import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { EngineServer } from '../../engine/server/index.mjs';

describe('Local Engine Server API & WebSocket Contract (Ticket #4)', () => {
  let server;
  let baseUrl;
  let wsUrl;
  const testPort = 8011;

  before(async () => {
    server = new EngineServer({
      port: testPort,
      staticDir: 'dist/workstation',
      initialWorkspace: process.cwd(),
    });
    await server.start();
    baseUrl = `http://127.0.0.1:${testPort}`;
    wsUrl = `ws://127.0.0.1:${testPort}/ws`;
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('REST Endpoints', () => {
    it('GET /health returns status ok and version', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.version, '0.1.0');
    });

    it('GET /api/workspace returns active workspace configuration', async () => {
      const res = await fetch(`${baseUrl}/api/workspace`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.workspacePath, 'string');
      assert.equal(data.capabilityGrant, 'READ_ONLY_INSPECTION');
    });

    it('POST /api/workspace/select updates active workspace path', async () => {
      const res = await fetch(`${baseUrl}/api/workspace/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath: 'd:/ai/test-workspace' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.workspacePath, 'd:/ai/test-workspace');

      // Verify persistence in GET
      const getRes = await fetch(`${baseUrl}/api/workspace`);
      const getData = await getRes.json();
      assert.equal(getData.workspacePath, 'd:/ai/test-workspace');
    });

    it('Serves static assets or index.html for SPA routes', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('LENS Workstation') || text.includes('root'));
    });
  });

  describe('WebSocket Real-Time Streaming', () => {
    it('connects to /ws and receives connection acknowledgement', async () => {
      const ws = new WebSocket(wsUrl);

      const messagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 3000);
        ws.on('message', (raw) => {
          clearTimeout(timeout);
          resolve(JSON.parse(raw.toString()));
        });
        ws.on('error', reject);
      });

      const message = await messagePromise;
      assert.equal(message.type, 'connected');
      assert.ok(message.sessionId);
      ws.close();
    });

    it('broadcasts turn events to connected clients', async () => {
      const ws = new WebSocket(wsUrl);
      const messages = [];

      ws.on('message', (raw) => {
        messages.push(JSON.parse(raw.toString()));
      });

      await new Promise((resolve) => ws.on('open', resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));

      server.broadcast({
        type: 'thought',
        payload: { text: 'Analyzing codebase structure...' },
        timestamp: Date.now(),
      });

      const thoughtMsg = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Event broadcast timeout')), 2000);
        const interval = setInterval(() => {
          const found = messages.find((m) => m.type === 'thought');
          if (found) {
            clearTimeout(timeout);
            clearInterval(interval);
            resolve(found);
          }
        }, 10);
      });

      assert.equal(thoughtMsg.type, 'thought');
      assert.equal(thoughtMsg.payload.text, 'Analyzing codebase structure...');
      ws.close();
    });

    it('handles WebSocket invoke_subagent and broadcasts subagent events', async () => {
      const ws = new WebSocket(wsUrl);
      const messages = [];

      ws.on('message', (raw) => {
        messages.push(JSON.parse(raw.toString()));
      });

      await new Promise((resolve) => ws.on('open', resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));

      ws.send(JSON.stringify({
        type: 'invoke_subagent',
        role: 'Async Auditor',
        subagentType: 'code_reviewer',
        prompt: 'Check code quality',
      }));

      const startMsg = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Subagent broadcast timeout')), 3000);
        const interval = setInterval(() => {
          const found = messages.find((m) => m.type === 'subagent:started');
          if (found) {
            clearTimeout(timeout);
            clearInterval(interval);
            resolve(found);
          }
        }, 10);
      });

      assert.equal(startMsg.type, 'subagent:started');
      assert.equal(startMsg.role, 'Async Auditor');
      assert.ok(startMsg.id);

      // Verify GET /api/subagents REST endpoint
      const res = await fetch(`${baseUrl}/api/subagents`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.subagents));
      assert.ok(json.subagents.some((s) => s.id === startMsg.id));

      // Verify GET /api/subagents/:id endpoint
      const singleRes = await fetch(`${baseUrl}/api/subagents/${startMsg.id}`);
      assert.equal(singleRes.status, 200);
      const singleJson = await singleRes.json();
      assert.equal(singleJson.id, startMsg.id);
      assert.equal(singleJson.role, 'Async Auditor');

      // Verify GET /api/subagents/:id/transcript endpoint
      const transRes = await fetch(`${baseUrl}/api/subagents/${startMsg.id}/transcript`);
      assert.equal(transRes.status, 200);
      const transJson = await transRes.json();
      assert.ok(Array.isArray(transJson.transcript));

      // Verify 404 for unknown subagent
      const notFoundRes = await fetch(`${baseUrl}/api/subagents/unknown-id`);
      assert.equal(notFoundRes.status, 404);

      ws.close();
    });
  });
});

