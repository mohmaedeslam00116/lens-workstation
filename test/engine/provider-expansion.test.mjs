import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StreamingToolAccumulator } from '../../engine/providers/StreamingToolAccumulator.mjs';

describe('Provider Expansion & Streaming Accumulator (Ticket #23)', () => {
  describe('StreamingToolAccumulator', () => {
    it('accumulates fragmented arguments across multiple SSE deltas into a single tool call', () => {
      const accumulator = new StreamingToolAccumulator();

      // Chunk 1: Tool call start with partial name & argument start
      accumulator.processChunkDelta({
        tool_calls: [{
          index: 0,
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'view_file',
            arguments: '{"pa'
          }
        }]
      });

      // Chunk 2: Intermediate argument piece
      accumulator.processChunkDelta({
        tool_calls: [{
          index: 0,
          function: {
            arguments: 'th":"src/'
          }
        }]
      });

      // Chunk 3: Final argument piece closing JSON
      accumulator.processChunkDelta({
        tool_calls: [{
          index: 0,
          function: {
            arguments: 'index.ts"}'
          }
        }]
      });

      const finalized = accumulator.finalize();
      assert.equal(finalized.length, 1);
      assert.equal(finalized[0].type, 'tool_call');
      assert.equal(finalized[0].callId, 'call_abc123');
      assert.equal(finalized[0].toolName, 'view_file');
      assert.deepEqual(finalized[0].args, { path: 'src/index.ts' });
    });

    it('handles multiple parallel tool calls with distinct indices', () => {
      const accumulator = new StreamingToolAccumulator();

      // Tool call 0
      accumulator.processChunkDelta({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":"a.js"}' }
          },
          {
            index: 1,
            id: 'call_2',
            function: { name: 'read_file', arguments: '{"path":"b.js"}' }
          }
        ]
      });

      const finalized = accumulator.finalize();
      assert.equal(finalized.length, 2);
      assert.equal(finalized[0].callId, 'call_1');
      assert.deepEqual(finalized[0].args, { path: 'a.js' });
      assert.equal(finalized[1].callId, 'call_2');
      assert.deepEqual(finalized[1].args, { path: 'b.js' });
    });

    it('falls back to raw string args if JSON is invalid', () => {
      const accumulator = new StreamingToolAccumulator();

      accumulator.processChunkDelta({
        tool_calls: [{
          index: 0,
          id: 'call_raw',
          function: {
            name: 'execute_command',
            arguments: 'unclosed json string...'
          }
        }]
      });

      const finalized = accumulator.finalize();
      assert.equal(finalized.length, 1);
      assert.deepEqual(finalized[0].args, { raw: 'unclosed json string...' });
    });
  });

  describe('KiloGatewayProvider', () => {
    it('initializes with default Kilo Gateway baseUrl and model namespacing', async () => {
      const { KiloGatewayProvider } = await import('../../engine/providers/KiloGatewayProvider.mjs');
      const { createProvider } = await import('../../engine/providers/index.mjs');

      const kilo = new KiloGatewayProvider({
        apiKey: 'kilo-secret-key',
        model: 'anthropic/claude-3-7-sonnet',
      });

      assert.equal(kilo.name, 'kilo');
      assert.equal(kilo.baseUrl, 'https://api.kilo.ai/api/gateway/v1');
      assert.equal(kilo.model, 'anthropic/claude-3-7-sonnet');
      assert.equal(kilo.apiKey, 'kilo-secret-key');

      // Test createProvider factory registration
      const created = createProvider({
        provider: 'kilo',
        apiKey: 'kilo-factory-key',
        model: 'deepseek/deepseek-chat',
      });
      assert.equal(created.name, 'kilo');
      assert.equal(created.baseUrl, 'https://api.kilo.ai/api/gateway/v1');
      assert.equal(created.model, 'deepseek/deepseek-chat');
    });

    it('parses models catalog response correctly from fetchModels', async () => {
      const { KiloGatewayProvider } = await import('../../engine/providers/KiloGatewayProvider.mjs');
      const kilo = new KiloGatewayProvider({ apiKey: 'mock-key' });

      // Mock fetch
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          assert.equal(url, 'https://api.kilo.ai/api/gateway/models');
          assert.equal(opts.headers.Authorization, 'Bearer mock-key');
          return {
            ok: true,
            json: async () => ({
              data: [
                { id: 'anthropic/claude-3-7-sonnet', context_length: 200000 },
                { id: 'deepseek/deepseek-chat', context_length: 64000 }
              ]
            })
          };
        };

        const models = await kilo.fetchModels();
        assert.equal(models.length, 2);
        assert.equal(models[0].id, 'anthropic/claude-3-7-sonnet');
        assert.equal(models[1].id, 'deepseek/deepseek-chat');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('OpenCodeBridgeProvider', () => {
    it('initializes with custom or default baseUrl and passes extra headers', async () => {
      const { OpenCodeBridgeProvider } = await import('../../engine/providers/OpenCodeBridgeProvider.mjs');
      const { createProvider } = await import('../../engine/providers/index.mjs');

      // Default
      const opencode = new OpenCodeBridgeProvider({
        apiKey: 'opencode-key',
        model: 'opencode/zen-coder',
      });
      assert.equal(opencode.name, 'opencode');
      assert.equal(opencode.baseUrl, 'https://api.opencode.ai/v1');

      // Custom proxy & extra headers
      const custom = new OpenCodeBridgeProvider({
        apiKey: 'local-token',
        baseUrl: 'http://127.0.0.1:4096/v1',
        model: 'opencode/local-qwen',
        extraHeaders: { 'X-OpenCode-Workspace': 'test-ws' },
      });
      assert.equal(custom.baseUrl, 'http://127.0.0.1:4096/v1');
      assert.deepEqual(custom.extraHeaders, { 'X-OpenCode-Workspace': 'test-ws' });

      // createProvider factory registration
      const created = createProvider({
        provider: 'opencode',
        apiKey: 'factory-key',
        baseUrl: 'https://gateway.custom.org/v1',
        model: 'custom-model',
      });
      assert.equal(created.name, 'opencode');
      assert.equal(created.baseUrl, 'https://gateway.custom.org/v1');
    });
  });

  describe('ClinePromptParser', () => {
    it('parses single and multi-parameter XML tool blocks and extracts clean text', async () => {
      const { parseClineXmlTools } = await import('../../engine/providers/ClinePromptParser.mjs');

      const rawText = `I will inspect the workspace first.
<read_file>
<path>src/components/Header.tsx</path>
</read_file>
Then I will run tests.`;

      const result = parseClineXmlTools(rawText);
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].type, 'tool_call');
      assert.equal(result.toolCalls[0].toolName, 'read_file');
      assert.deepEqual(result.toolCalls[0].args, { path: 'src/components/Header.tsx' });
      assert.equal(result.cleanedText.includes('<read_file>'), false);
      assert.match(result.cleanedText, /I will inspect the workspace first/);
      assert.match(result.cleanedText, /Then I will run tests/);
    });

    it('extracts multi-parameter XML tool blocks correctly', async () => {
      const { parseClineXmlTools } = await import('../../engine/providers/ClinePromptParser.mjs');

      const rawText = `<write_to_file>
<path>src/utils.ts</path>
<content>export const sum = (a, b) => a + b;</content>
</write_to_file>`;

      const result = parseClineXmlTools(rawText);
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].toolName, 'write_to_file');
      assert.deepEqual(result.toolCalls[0].args, {
        path: 'src/utils.ts',
        content: 'export const sum = (a, b) => a + b;',
      });
    });

    it('returns empty toolCalls and pristine text if no XML tools present', async () => {
      const { parseClineXmlTools } = await import('../../engine/providers/ClinePromptParser.mjs');

      const rawText = 'Just a regular conversational response without tools.';
      const result = parseClineXmlTools(rawText);
      assert.equal(result.toolCalls.length, 0);
      assert.equal(result.cleanedText, rawText);
    });
  });

  describe('ClineBridgeProvider', () => {
    it('initializes with default OpenRouter endpoint and registers in createProvider', async () => {
      const { ClineBridgeProvider } = await import('../../engine/providers/ClineBridgeProvider.mjs');
      const { createProvider } = await import('../../engine/providers/index.mjs');

      const cline = new ClineBridgeProvider({
        apiKey: 'cline-or-key',
        model: 'anthropic/claude-3-7-sonnet',
      });

      assert.equal(cline.name, 'cline');
      assert.equal(cline.baseUrl, 'https://openrouter.ai/api/v1');
      assert.equal(cline.model, 'anthropic/claude-3-7-sonnet');

      // Test createProvider
      const created = createProvider({
        provider: 'cline',
        apiKey: 'cline-key',
        model: 'deepseek/deepseek-r1',
      });
      assert.equal(created.name, 'cline');
      assert.equal(created.baseUrl, 'https://openrouter.ai/api/v1');
    });
  });
});




