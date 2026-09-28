import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from '../../engine/core/EventBus.mjs';
import { SubagentRuntime } from '../../engine/core/SubagentRuntime.mjs';
import { AgentRuntime } from '../../engine/core/runtime.mjs';

describe('SubagentRuntime & EventBus Isolation Engine (Ticket #26)', () => {
  let tempDir;
  let conversationsDir;
  let eventBus;
  let mockInspectionPort;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lens-subagent-test-'));
    conversationsDir = join(tempDir, 'conversations');
    eventBus = new EventBus();

    const files = {
      'src/auth.ts': 'export function login() { return true; }',
      'package.json': JSON.stringify({ name: 'test-app', version: '1.0.0' }),
    };

    mockInspectionPort = {
      async viewFile(path) {
        if (!files[path]) throw new Error(`File not found: ${path}`);
        return files[path];
      },
      async listDir() {
        return Object.keys(files);
      },
      async grepSearch(query) {
        return Object.entries(files)
          .filter(([, content]) => content.includes(query))
          .map(([path]) => ({ path, preview: query }));
      },
      async findByName(pattern) {
        return Object.keys(files).filter((p) => p.includes(pattern));
      },
    };
  });

  after(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('EventBus Subsystem', () => {
    it('emits and relays subagent lifecycle events with consistent payload and timestamp', () => {
      const bus = new EventBus();
      const events = [];

      bus.on('event', (e) => events.push(e));

      bus.emitSubagentStarted({
        id: 'sub-1',
        role: 'Research Assistant',
        type: 'research',
        prompt: 'Investigate token bucket rate limiting',
      });

      bus.emitSubagentStep({
        id: 'sub-1',
        stepIndex: 1,
        state: 'running',
        stateDetail: 'Searching documentation...',
        thought: 'Analyzing algorithms',
      });

      bus.emitSubagentDone({
        id: 'sub-1',
        result: 'Investigation complete: Token bucket algorithm analyzed.',
        durationMs: 120,
      });

      assert.equal(events.length, 3);
      assert.equal(events[0].type, 'subagent:started');
      assert.equal(events[0].id, 'sub-1');
      assert.equal(events[0].role, 'Research Assistant');
      assert.ok(events[0].timestamp > 0);

      assert.equal(events[1].type, 'subagent:step');
      assert.equal(events[1].stateDetail, 'Searching documentation...');

      assert.equal(events[2].type, 'subagent:done');
      assert.equal(events[2].status, 'completed');
      assert.ok(events[2].result.includes('Token bucket'));
    });
  });

  describe('SubagentRuntime Lifecycle & Archetype Isolation', () => {
    it('spawns a research subagent in background, writes transcript.jsonl, and completes', async () => {
      const bus = new EventBus();
      const capturedBusEvents = [];
      bus.on('event', (e) => capturedBusEvents.push(e));

      const mockModel = {
        async *generateStream(messages) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.role === 'user') {
            yield { type: 'thought', text: 'Scanning workspace files...' };
            yield {
              type: 'tool_call',
              callId: 'call-list-1',
              toolName: 'list_dir',
              args: {},
            };
          } else if (lastMsg.role === 'tool') {
            yield { type: 'thought', text: 'Files found. Formulating research summary.' };
            yield { type: 'content', text: 'Research findings: Found package.json and src/auth.ts.' };
          }
        },
      };

      const runtime = new SubagentRuntime({
        workspacePath: tempDir,
        conversationsDir,
        eventBus: bus,
        modelProvider: mockModel,
        inspectionPort: mockInspectionPort,
      });

      const handle = await runtime.spawnSubagent({
        role: 'Codebase Researcher',
        type: 'research',
        prompt: 'Explore workspace file organization',
      });

      assert.ok(handle.conversationId, 'Must return conversationId');
      assert.equal(handle.role, 'Codebase Researcher');
      assert.equal(handle.type, 'research');
      assert.equal(handle.status, 'running');

      // Wait for subagent background execution to finish
      await handle.completionPromise;

      const subagent = runtime.getSubagent(handle.conversationId);
      assert.equal(subagent.status, 'completed');
      assert.ok(subagent.result.includes('Found package.json and src/auth.ts'));
      assert.ok(subagent.durationMs >= 0);

      // Verify transcript.jsonl file was created and contains records
      const transcriptFile = join(conversationsDir, handle.conversationId, 'transcript.jsonl');
      assert.ok(existsSync(transcriptFile), 'transcript.jsonl must exist on disk');

      const lines = readFileSync(transcriptFile, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

      assert.ok(lines.length >= 3, 'Transcript must contain multiple step records');
      assert.ok(lines.some((l) => l.type === 'init'));
      assert.ok(lines.some((l) => l.type === 'tool_call' || l.type === 'tool_result' || l.type === 'thought'));
      assert.ok(lines.some((l) => l.type === 'done'));

      // Verify getTranscript method
      const transcriptRecords = await runtime.getTranscript(handle.conversationId);
      assert.equal(transcriptRecords.length, lines.length);

      // Verify event bus events
      const busTypes = capturedBusEvents.map((e) => e.type);
      assert.ok(busTypes.includes('subagent:started'));
      assert.ok(busTypes.includes('subagent:step'));
      assert.ok(busTypes.includes('subagent:done'));
    });

    it('enforces archetype tool isolation: research subagents cannot execute mutating tools', async () => {
      const bus = new EventBus();
      const mutatingExecuted = [];

      const tools = {
        list_dir: {
          name: 'list_dir',
          isMutating: false,
          async execute() {
            return ['file.txt'];
          },
        },
        propose_diff: {
          name: 'propose_diff',
          isMutating: true,
          async execute(args) {
            mutatingExecuted.push(args);
            return { status: 'diff_proposed' };
          },
        },
      };

      const mockModel = {
        async *generateStream() {
          // Model maliciously tries to call mutating tool propose_diff
          yield {
            type: 'tool_call',
            callId: 'call-bad-1',
            toolName: 'propose_diff',
            args: { path: 'src/auth.ts', diff: 'corrupted' },
          };
        },
      };

      const runtime = new SubagentRuntime({
        workspacePath: tempDir,
        conversationsDir,
        eventBus: bus,
        modelProvider: mockModel,
        inspectionPort: mockInspectionPort,
        tools,
      });

      const handle = await runtime.spawnSubagent({
        role: 'Research Assistant',
        type: 'research',
        prompt: 'Investigate code',
      });

      await handle.completionPromise;

      // Mutating tool must NOT have been executed
      assert.equal(mutatingExecuted.length, 0, 'Research subagent must not have access to propose_diff');

      // Transcript should record tool error
      const transcript = await runtime.getTranscript(handle.conversationId);
      const toolStep = transcript.find((t) => t.toolName === 'propose_diff' && t.type === 'tool_result');
      assert.ok(toolStep, 'Transcript should log rejected tool attempt');
      assert.ok(String(toolStep.error).includes('Unknown') || String(toolStep.error).includes('not permitted'));
    });

    it('supports killing an active subagent during execution', async () => {
      const bus = new EventBus();

      // Long-running model
      const mockModel = {
        async *generateStream() {
          yield { type: 'thought', text: 'Starting infinite background research...' };
          await new Promise((r) => setTimeout(r, 400));
          yield { type: 'content', text: 'Finished' };
        },
      };

      const runtime = new SubagentRuntime({
        workspacePath: tempDir,
        conversationsDir,
        eventBus: bus,
        modelProvider: mockModel,
        inspectionPort: mockInspectionPort,
      });

      const handle = await runtime.spawnSubagent({
        role: 'Background Worker',
        type: 'general',
        prompt: 'Compute endlessly',
      });

      assert.equal(handle.status, 'running');

      // Kill subagent after 30ms
      await new Promise((r) => setTimeout(r, 30));
      const killed = runtime.killSubagent(handle.conversationId);
      assert.equal(killed, true);

      await handle.completionPromise;

      const subagent = runtime.getSubagent(handle.conversationId);
      assert.equal(subagent.status, 'cancelled');
    });

    it('lists all spawned subagents via getSubagents()', async () => {
      const bus = new EventBus();
      const mockModel = {
        async *generateStream() {
          yield { type: 'content', text: 'Quick response' };
        },
      };

      const runtime = new SubagentRuntime({
        workspacePath: tempDir,
        conversationsDir,
        eventBus: bus,
        modelProvider: mockModel,
        inspectionPort: mockInspectionPort,
      });

      const h1 = await runtime.spawnSubagent({ role: 'Auditor 1', type: 'code_reviewer', prompt: 'Audit 1' });
      const h2 = await runtime.spawnSubagent({ role: 'Researcher 2', type: 'research', prompt: 'Research 2' });

      await Promise.all([h1.completionPromise, h2.completionPromise]);

      const all = runtime.getSubagents();
      assert.equal(all.length, 2);
      assert.ok(all.some((s) => s.id === h1.conversationId && s.role === 'Auditor 1'));
      assert.ok(all.some((s) => s.id === h2.conversationId && s.role === 'Researcher 2'));
    });
  });

  describe('Main Agent invoke_subagent Integration Seam', () => {
    it('allows main agent to spawn subagent via invoke_subagent tool call', async () => {
      const bus = new EventBus();

      const subagentModel = {
        async *generateStream() {
          yield { type: 'content', text: 'Subagent completed research task.' };
        },
      };

      const subagentRuntime = new SubagentRuntime({
        workspacePath: tempDir,
        conversationsDir,
        eventBus: bus,
        modelProvider: subagentModel,
        inspectionPort: mockInspectionPort,
      });

      // Register invoke_subagent tool into main agent tools
      const mainTools = {
        invoke_subagent: subagentRuntime.createInvokeTool(),
      };

      // Main agent calls invoke_subagent
      const mainModel = {
        async *generateStream(messages) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.role === 'user') {
            yield { type: 'thought', text: 'Delegating research to a child subagent...' };
            yield {
              type: 'tool_call',
              callId: 'call-invoke-1',
              toolName: 'invoke_subagent',
              args: {
                role: 'Web Search Researcher',
                type: 'research',
                prompt: 'Investigate latest specs',
              },
            };
          } else if (lastMsg.role === 'tool') {
            yield { type: 'content', text: 'Delegated research successfully.' };
          }
        },
      };

      const mainAgent = new AgentRuntime({
        inspectionPort: mockInspectionPort,
        modelProvider: mainModel,
        tools: mainTools,
        autonomyMode: 'autonomous',
      });

      const result = await mainAgent.runTurn('Please research latest specs via subagent');
      assert.equal(result.status, 'completed');
      assert.equal(result.finalText, 'Delegated research successfully.');

      // Check that subagent was registered in SubagentRuntime
      const subagents = subagentRuntime.getSubagents();
      assert.equal(subagents.length, 1);
      assert.equal(subagents[0].role, 'Web Search Researcher');
      assert.equal(subagents[0].type, 'research');
    });
  });
});
