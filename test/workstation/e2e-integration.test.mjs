import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { EngineServer } from '../../engine/server/index.mjs';

describe('End-to-End Integration & System Verification (Ticket #11)', () => {
  const TEST_PORT = 8011;
  let tempWorkspace;
  let engineServer;

  before(async () => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'lens-e2e-ws-'));

    // Create sample project files
    writeFileSync(
      join(tempWorkspace, 'package.json'),
      JSON.stringify({ name: 'sample-project', version: '0.1.0' }, null, 2),
      'utf8'
    );
    writeFileSync(
      join(tempWorkspace, 'index.js'),
      '// Original content\nfunction hello() { return "hello"; }\n',
      'utf8'
    );

    engineServer = new EngineServer({
      port: 0,
      initialWorkspace: tempWorkspace,
    });
    await engineServer.start();
  });

  after(async () => {
    if (engineServer) {
      await engineServer.stop();
    }
    if (tempWorkspace && existsSync(tempWorkspace)) {
      rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  // Helper to open WebSocket and collect messages
  function connectWsClient() {
    return new Promise((resolveClient, rejectClient) => {
      const port = engineServer.getPort();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const events = [];

      ws.on('message', (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          events.push(parsed);
          ws.emit('event', parsed);
        } catch { /* ignore non-json */ }
      });

      ws.on('open', () => {
        resolveClient({ ws, events });
      });

      ws.on('error', rejectClient);
    });
  }

  it('connects to WebSocket and receives connection handshake with capability grant', async () => {
    const { ws, events } = await connectWsClient();

    // Wait briefly for handshake
    await new Promise((r) => setTimeout(r, 50));

    const connEvent = events.find((e) => e.type === 'connected');
    assert.ok(connEvent, 'Must receive connected event');
    assert.ok(connEvent.sessionId, 'Must provide sessionId');
    assert.equal(connEvent.capabilityGrant, 'READ_ONLY_INSPECTION');
    assert.equal(connEvent.workspacePath, tempWorkspace);

    ws.close();
  });

  it('executes autonomous read-only inspection turn (/plan) without pausing for human approval', async () => {
    const { ws, events } = await connectWsClient();

    const donePromise = new Promise((resolveDone) => {
      ws.on('event', (e) => {
        if (e.type === 'done') resolveDone(e);
      });
    });

    ws.send(JSON.stringify({ type: 'user_turn', prompt: '/plan' }));

    const doneEvent = await donePromise;
    assert.equal(doneEvent.status, 'completed');

    const thoughtEvent = events.find((e) => e.type === 'thought');
    assert.ok(thoughtEvent, 'Must emit thought stream');

    const toolCall = events.find((e) => e.type === 'tool_call');
    assert.ok(toolCall, 'Must invoke read-only tool');
    assert.equal(toolCall.toolName, 'list_dir');

    const toolResult = events.find((e) => e.type === 'tool_result');
    assert.ok(toolResult, 'Must return directory listing');
    assert.ok(Array.isArray(toolResult.result), 'Result must be directory array');
    assert.ok(toolResult.result.includes('package.json'), 'Must list package.json');

    ws.close();
  });

  it('pauses on mutating tool (/test), requests human approval, and streams sanitized terminal execution on approval', async () => {
    const { ws, events } = await connectWsClient();

    const approvalPromise = new Promise((resolveApproval) => {
      ws.on('event', (e) => {
        if (e.type === 'tool_status' && e.status === 'waiting_approval') {
          resolveApproval(e);
        }
      });
    });

    const donePromise = new Promise((resolveDone) => {
      ws.on('event', (e) => {
        if (e.type === 'done') resolveDone(e);
      });
    });

    // Send mutating prompt
    ws.send(JSON.stringify({ type: 'user_turn', prompt: '/test' }));

    // Wait for checkpoint
    const approvalReq = await approvalPromise;
    assert.ok(approvalReq, 'Must enter approval checkpoint');
    assert.ok(approvalReq.toolId, 'Must have approval toolId');
    assert.deepEqual(approvalReq.args, {
      command: 'node',
      args: ['-e', "console.log('LENS Test Runner OK')"],
    });

    // Grant approval
    ws.send(JSON.stringify({
      type: 'tool_approval',
      toolId: approvalReq.toolId,
      approved: true,
    }));

    // Wait for completion
    const doneEvent = await donePromise;
    assert.equal(doneEvent.status, 'completed');

    // Verify sanitized terminal stream
    const termOutput = events.find(
      (e) => e.type === 'terminal_output' && e.data && e.data.includes('LENS Test Runner OK')
    );
    assert.ok(termOutput, 'Must receive streamed terminal stdout from sanitized runner');

    ws.close();
  });

  it('proposes file modification diff, applies atomic transaction upon accept, and rolls back cleanly with 1 click', async () => {
    const { ws, events } = await connectWsClient();

    const originalContent = readFileSync(join(tempWorkspace, 'index.js'), 'utf8');

    // 1. Propose diff via /modify
    const diffPromise = new Promise((resolveDiff) => {
      ws.on('event', (e) => {
        if (e.type === 'diff_preview') resolveDiff(e);
      });
    });

    const approvalPromise = new Promise((resolveApproval) => {
      ws.on('event', (e) => {
        if (e.type === 'tool_status' && e.status === 'waiting_approval') {
          resolveApproval(e);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'user_turn', prompt: '/modify index.js' }));

    const approvalReq = await approvalPromise;
    // Approve propose_diff tool execution
    ws.send(JSON.stringify({
      type: 'tool_approval',
      toolId: approvalReq.toolId,
      approved: true,
    }));

    const diffPreview = await diffPromise;
    assert.ok(diffPreview, 'Must broadcast diff_preview');
    assert.ok(diffPreview.diffId || diffPreview.file.id, 'Must have unique diffId');
    assert.equal(diffPreview.file.path, 'index.js');
    assert.equal(diffPreview.file.original, originalContent);
    assert.ok(diffPreview.file.modified.includes('Updated by LENS autonomous agent'));

    // 2. Accept Diff
    const txAppliedPromise = new Promise((resolveTx) => {
      ws.on('event', (e) => {
        if (e.type === 'transaction_applied') resolveTx(e);
      });
    });

    ws.send(JSON.stringify({
      type: 'diff_decision',
      diffId: diffPreview.diffId || diffPreview.file.id,
      path: 'index.js',
      decision: 'accept',
    }));

    const txResult = await txAppliedPromise;
    assert.ok(txResult, 'Must apply atomic transaction');
    assert.ok(txResult.transactionId, 'Must have transactionId');

    // Verify disk content changed
    const modifiedOnDisk = readFileSync(join(tempWorkspace, 'index.js'), 'utf8');
    assert.ok(modifiedOnDisk.includes('Updated by LENS autonomous agent'));

    // 3. Rollback Transaction via /rollback
    const rollbackDonePromise = new Promise((resolveRollback) => {
      ws.on('event', (e) => {
        if (e.type === 'done' && e.status === 'completed') resolveRollback(e);
      });
    });

    ws.send(JSON.stringify({ type: 'user_turn', prompt: '/rollback' }));

    await rollbackDonePromise;

    // Verify disk content is restored byte-for-byte to original
    const restoredOnDisk = readFileSync(join(tempWorkspace, 'index.js'), 'utf8');
    assert.equal(restoredOnDisk, originalContent, 'Rollback must restore original disk content byte-for-byte');

    ws.close();
  });

  it('verifies electron-builder packaging configuration', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.package, 'package script must be defined');
    assert.ok(pkg.build, 'build field must be defined for electron-builder');
    assert.equal(pkg.build.appId, 'com.lens.workstation');
    assert.equal(pkg.build.productName, 'LENS Workstation');
    assert.equal(pkg.build.directories.output, 'dist-installer');
  });
});
