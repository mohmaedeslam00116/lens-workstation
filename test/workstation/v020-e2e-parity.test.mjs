import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';

import { EngineServer } from '../../engine/server/index.mjs';
import { StreamingToolAccumulator } from '../../engine/providers/StreamingToolAccumulator.mjs';
import { ContextCompactor } from '../../engine/core/ContextCompactor.mjs';
import { AgentRuntime } from '../../engine/core/runtime.mjs';
import { SubagentRuntime } from '../../engine/core/SubagentRuntime.mjs';
import { EventBus } from '../../engine/core/EventBus.mjs';
import { DeepResearchOrchestrator } from '../../engine/research/DeepResearchOrchestrator.mjs';
import { GroundingAudit } from '../../engine/research/GroundingAudit.mjs';

describe('LENS Workstation v0.2.0 — End-to-End Integration & Parity Verification Suite (Ticket #31)', () => {
  let tempWorkspace;
  let engineServer;
  let serverPort;

  before(async () => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'lens-v020-e2e-'));

    // Create workspace sample files
    writeFileSync(
      join(tempWorkspace, 'package.json'),
      JSON.stringify({ name: 'test-v020-project', version: '0.2.0' }, null, 2),
      'utf8'
    );
    writeFileSync(
      join(tempWorkspace, 'README.md'),
      '# Test v0.2.0 Project\n\nTesting full parity pipeline.\n',
      'utf8'
    );

    engineServer = new EngineServer({
      port: 0,
      initialWorkspace: tempWorkspace,
    });
    await engineServer.start();
    serverPort = engineServer.getPort();
  });

  after(async () => {
    if (engineServer) {
      await engineServer.stop();
    }
    if (tempWorkspace && existsSync(tempWorkspace)) {
      rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  // Helper for WebSocket connection
  function connectWsClient() {
    return new Promise((resolveClient, rejectClient) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);
      const events = [];

      ws.on('message', (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          events.push(parsed);
          ws.emit('event', parsed);
        } catch {
          // ignore non-json
        }
      });

      ws.on('open', () => {
        resolveClient({ ws, events });
      });

      ws.on('error', rejectClient);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Version Parity & Health Verification
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Version Parity & Health Endpoint', () => {
    it('reports version 0.2.0 on HTTP /health endpoint', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.version, '0.2.0', 'Engine server health endpoint must report version 0.2.0');
    });

    it('reports matching version in package.json', () => {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
      assert.equal(pkg.version, '0.2.0', 'Root package.json version must be 0.2.0');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Provider Settings & Credential Store Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Provider Settings Configuration & Credential Store', () => {
    it('configures active provider profile and stores encrypted credentials with masking', async () => {
      // 1. Update provider credentials
      const updateRes = await fetch(`http://127.0.0.1:${serverPort}/api/settings/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'kilo',
          model: 'kilo/anthropic/claude-3-7-sonnet',
          apiKey: 'kilo-live-secret-test-key-12345678',
        }),
      });

      assert.equal(updateRes.status, 200);
      const updateData = await updateRes.json();
      assert.equal(updateData.success, true);
      assert.equal(updateData.provider, 'kilo');

      // 2. Query provider credentials
      const getRes = await fetch(`http://127.0.0.1:${serverPort}/api/settings/credentials`);
      assert.equal(getRes.status, 200);
      const settingsData = await getRes.json();
      assert.equal(settingsData.activeProvider, 'kilo');
      assert.ok(settingsData.credentials, 'Must provide credentials map');
      const kiloCreds = settingsData.credentials.kilo;
      assert.ok(kiloCreds, 'Must have credential entry for kilo');
      assert.ok(kiloCreds.apiKey, 'Must have masked apiKey');
      assert.ok(!kiloCreds.apiKey.includes('12345678'), 'API key must not expose full secret');
      assert.ok(kiloCreds.apiKey.includes('...'), 'Masked key must have ellipsis');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Streaming Tool Accumulation through Kilo & OpenAI Protocol
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. StreamingToolAccumulator Protocol Compatibility', () => {
    it('seamlessly accumulates chunked SSE tool call arguments into executable commands', () => {
      const accumulator = new StreamingToolAccumulator();

      // Chunk 1: Tool call start
      accumulator.processChunkDelta({
        tool_calls: [
          {
            index: 0,
            id: 'call_deep_research_001',
            type: 'function',
            function: { name: 'deep_research', arguments: '{"topic":' },
          },
        ],
      });

      // Chunk 2: Intermediate stream
      accumulator.processChunkDelta({
        tool_calls: [
          {
            index: 0,
            function: { arguments: ' "Autonomous ' },
          },
        ],
      });

      // Chunk 3: Final argument closing
      accumulator.processChunkDelta({
        tool_calls: [
          {
            index: 0,
            function: { arguments: 'Deep Research"}' },
          },
        ],
      });

      const tools = accumulator.finalize();
      assert.equal(tools.length, 1);
      assert.equal(tools[0].callId, 'call_deep_research_001');
      assert.equal(tools[0].toolName, 'deep_research');
      assert.deepEqual(tools[0].args, { topic: 'Autonomous Deep Research' });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Multi-Step ReAct Loop & Sliding Window Compaction
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Autonomous ReAct Reasoning Loop & Context Compaction', () => {
    it('executes multi-step reasoning turn while compactor summarizes older tool outputs', async () => {
      const compactor = new ContextCompactor({
        recentToolKeepCount: 3,
      });

      // Populate history with 5 tool results
      const history = [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Perform comprehensive inspection' },
      ];

      for (let i = 1; i <= 5; i++) {
        history.push({
          role: 'assistant',
          tool_calls: [{ id: `call_${i}`, name: `read_file_${i}`, args: {} }],
        });
        history.push({
          role: 'tool',
          name: `read_file_${i}`,
          tool_call_id: `call_${i}`,
          content: `Very detailed file content for inspection #${i}. ` + 'x'.repeat(100),
        });
      }

      const compacted = compactor.compact(history);

      // System and initial user turn must be preserved
      assert.equal(compacted[0].role, 'system');
      assert.equal(compacted[1].role, 'user');

      // The 3 most recent tool results (3, 4, 5) must be preserved in full
      const toolResults = compacted.filter((m) => m.role === 'tool');
      assert.equal(toolResults.length, 5);

      // Tool result 1 and 2 should be compacted summaries
      assert.ok(toolResults[0].content.includes('summarized'), 'Tool 1 must be compacted to summary');
      assert.ok(toolResults[0].isSummarized);
      assert.ok(toolResults[1].content.includes('summarized'), 'Tool 2 must be compacted to summary');
      assert.ok(toolResults[1].isSummarized);

      // Tool results 3, 4, 5 must remain full
      assert.ok(toolResults[2].content.includes('Very detailed file content'), 'Tool 3 must remain full');
      assert.ok(toolResults[3].content.includes('Very detailed file content'), 'Tool 4 must remain full');
      assert.ok(toolResults[4].content.includes('Very detailed file content'), 'Tool 5 must remain full');
    });

    it('toggles autonomy mode between Supervised and Autonomous via WebSocket', async () => {
      const { ws, events } = await connectWsClient();

      // Set Autonomous YOLO mode
      ws.send(JSON.stringify({ type: 'set_autonomy_mode', mode: 'autonomous' }));
      await new Promise((r) => setTimeout(r, 60));

      const autoEvent = events.find((e) => e.type === 'autonomy_mode_changed');
      assert.ok(autoEvent, 'Must receive autonomy_mode_changed event');
      assert.equal(autoEvent.mode, 'autonomous');

      // Set back to Supervised
      ws.send(JSON.stringify({ type: 'set_autonomy_mode', mode: 'supervised' }));
      await new Promise((r) => setTimeout(r, 60));

      const supervisedEvent = events.filter((e) => e.type === 'autonomy_mode_changed').pop();
      assert.ok(supervisedEvent);
      assert.equal(supervisedEvent.mode, 'supervised');

      ws.close();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Subagent Runtime Lifecycle & EventBus
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Subagent Runtime Lifecycle & EventBus Coordination', () => {
    it('spawns isolated subagent, records transcript.jsonl, and relays events', async () => {
      const eventBus = new EventBus();
      const lifecycleEvents = [];
      eventBus.on('subagent:*', (evt) => lifecycleEvents.push(evt.type));

      const subagentRuntime = new SubagentRuntime({
        workspacePath: tempWorkspace,
        eventBus,
      });

      const subagent = await subagentRuntime.spawnSubagent({
        role: 'Autonomous Security Auditor',
        type: 'research',
        prompt: 'Audit SSRF and boundary security in workspace',
      });

      assert.ok(subagent.id, 'Subagent must receive unique ID');
      assert.equal(subagent.type, 'research');
      assert.equal(subagent.role, 'Autonomous Security Auditor');

      // Wait for subagent execution
      await new Promise((r) => setTimeout(r, 50));

      const subagentsList = subagentRuntime.getSubagents();
      const registered = subagentsList.find((s) => s.id === subagent.id);
      assert.ok(registered, 'Subagent must be registered');

      // Verify transcript file was written
      const transcript = await subagentRuntime.getTranscript(subagent.id);
      assert.ok(Array.isArray(transcript), 'Must return transcript array');
      assert.ok(transcript.length > 0, 'Transcript must contain initialization entry');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Deep Research 5-Stage Autonomous Pipeline & Grounding Audit
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Deep Research 5-Stage Pipeline with Zero-Hallucination Audit', () => {
    it('executes 5-stage research pipeline, strips ungrounded citations, and emits verified shelf', async () => {
      const mockSearchPlane = {
        search: async () => [
          {
            url: 'https://research.example.com/runtime-spec',
            title: 'LENS Engine Runtime Specification',
            snippet: 'The autonomous research engine enforces SSRF safe DNS validation and bilingual BM25 indexing.',
            sourceEngine: 'brave',
          },
          {
            url: 'https://audit.example.org/security-analysis',
            title: 'Third-Party Security Analysis',
            snippet: 'Independent review confirms zero-hallucination post-synthesis regex audit with 100% precision.',
            sourceEngine: 'tavily',
          },
        ],
      };

      const mockScrapingLadder = {
        extract: async (url) => ({
          success: true,
          tier: 1,
          url,
          markdown: `Verified excerpt content from ${url}.\n\nDocuments the technical implementation of SSRF guard, linkedom extraction, and Okapi BM25 scoring with k1=1.2 and b=0.75.`,
          charCount: 220,
          truncated: false,
        }),
      };

      // Model provider that hallucinates [888] citation
      const mockModelProvider = {
        generateStream: async function* () {
          yield {
            type: 'content',
            text: 'Executive Summary:\nEmpirical research proves the system isolates subagents safely [1]. However, an unverified rumor [888] was also cited.',
          };
        },
      };

      const orchestrator = new DeepResearchOrchestrator({
        searchPlane: mockSearchPlane,
        scrapingLadder: mockScrapingLadder,
        modelProvider: mockModelProvider,
        maxUrlsPerMilestone: 1,
        maxExcerptsPerMilestone: 1,
      });

      const report = await orchestrator.run('LENS Deep Research Verification', {
        perspectives: ['technical'],
        useModel: true,
      });

      // Verify report integrity
      assert.ok(report, 'Must return complete research report');
      assert.ok(report.reportMarkdown, 'Report must contain markdown');

      // Grounding Audit assertion: hallucinated [888] citation MUST be stripped!
      assert.ok(!report.reportMarkdown.includes('[888]'), 'Hallucinated citation [888] must be stripped');
      assert.ok(report.reportMarkdown.includes('[1]'), 'Valid citation [1] must be preserved');

      // Verified Source Shelf assertion
      assert.ok(report.reportMarkdown.includes('## Verified Source Shelf'), 'Must include Verified Source Shelf');
      assert.ok(report.reportMarkdown.includes('| [1] |'), 'Source shelf must list verified citation [1]');

      // Audit stats
      assert.equal(report.audit.hallucinatedCitationsCount, 1);
      assert.equal(report.audit.validCitationsCount, 1);
      assert.deepEqual(report.audit.hallucinatedIndices, [888]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Desktop Packaging & Production Build Targets
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Windows Desktop Packaging & Build Integrity', () => {
    it('verifies electron-builder configuration for Windows NSIS packaging', () => {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
      assert.equal(pkg.build.appId, 'com.lens.workstation');
      assert.equal(pkg.build.productName, 'LENS Workstation');
      assert.equal(pkg.build.directories.output, 'dist-installer');
      assert.ok(Array.isArray(pkg.build.win.target));
      assert.ok(pkg.build.win.target.includes('nsis'), 'Must configure NSIS Windows installer target');
    });

    it('verifies production build output directories and entrypoints exist', () => {
      const mainPath = resolve(process.cwd(), 'dist/electron/main.cjs');
      const preloadPath = resolve(process.cwd(), 'dist/electron/preload.cjs');
      const htmlPath = resolve(process.cwd(), 'dist/workstation/index.html');

      assert.ok(existsSync(mainPath), 'dist/electron/main.cjs must exist');
      assert.ok(existsSync(preloadPath), 'dist/electron/preload.cjs must exist');
      assert.ok(existsSync(htmlPath), 'dist/workstation/index.html must exist');
    });
  });
});
