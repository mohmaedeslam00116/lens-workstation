import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, parseOpenAIStreamChunk, parseAnthropicEvent, parseGeminiChunk } from '../../engine/providers/index.mjs';

describe('Multi-Provider LLM Streaming Gateway (Ticket #8)', () => {
  describe('Provider Factory & Configuration', () => {
    it('creates correct provider instances based on config', () => {
      const gemini = createProvider({ provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' });
      assert.equal(gemini.name, 'gemini');
      assert.equal(gemini.model, 'gemini-2.5-flash');

      const claude = createProvider({ provider: 'claude', apiKey: 'test-key', model: 'claude-3-5-sonnet' });
      assert.equal(claude.name, 'claude');
      assert.equal(claude.model, 'claude-3-5-sonnet');

      const openai = createProvider({ provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' });
      assert.equal(openai.name, 'openai');
      assert.equal(openai.model, 'gpt-4o');

      const deepseek = createProvider({ provider: 'deepseek', apiKey: 'test-key', model: 'deepseek-reasoner' });
      assert.equal(deepseek.name, 'deepseek');
      assert.equal(deepseek.baseUrl, 'https://api.deepseek.com');

      const ollama = createProvider({ provider: 'ollama', model: 'qwen2.5-coder' });
      assert.equal(ollama.name, 'ollama');
      assert.equal(ollama.baseUrl, 'http://127.0.0.1:11434/v1');
    });

    it('throws on unsupported provider name', () => {
      assert.throws(() => {
        createProvider({ provider: 'unknown-vendor', model: 'xyz' });
      }, /Unsupported provider/);
    });
  });

  describe('OpenAI-compatible Normalizer (OpenAI, DeepSeek, Ollama)', () => {
    it('normalizes content chunks', () => {
      const chunk = {
        choices: [{
          delta: { content: 'Hello world' }
        }]
      };
      const events = parseOpenAIStreamChunk(chunk);
      assert.deepEqual(events, [{ type: 'content', text: 'Hello world' }]);
    });

    it('normalizes reasoning / thinking content (e.g. DeepSeek)', () => {
      const chunk = {
        choices: [{
          delta: { reasoning_content: 'Let us consider the algorithm complexity...' }
        }]
      };
      const events = parseOpenAIStreamChunk(chunk);
      assert.deepEqual(events, [{ type: 'thought', text: 'Let us consider the algorithm complexity...' }]);
    });

    it('normalizes tool calls', () => {
      const chunk = {
        choices: [{
          delta: {
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'view_file',
                arguments: '{"path":"src/main.ts"}'
              }
            }]
          }
        }]
      };
      const events = parseOpenAIStreamChunk(chunk);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'tool_call');
      assert.equal(events[0].callId, 'call_123');
      assert.equal(events[0].toolName, 'view_file');
      assert.deepEqual(events[0].args, { path: 'src/main.ts' });
    });
  });

  describe('Anthropic Claude Normalizer', () => {
    it('normalizes text delta', () => {
      const event = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Explaining solution...' }
      };
      const events = parseAnthropicEvent(event);
      assert.deepEqual(events, [{ type: 'content', text: 'Explaining solution...' }]);
    });

    it('normalizes extended thinking delta', () => {
      const event = {
        type: 'content_block_delta',
        delta: { type: 'thinking_delta', thinking: 'Analyzing edge cases...' }
      };
      const events = parseAnthropicEvent(event);
      assert.deepEqual(events, [{ type: 'thought', text: 'Analyzing edge cases...' }]);
    });

    it('normalizes tool_use block start', () => {
      const event = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          id: 'toolu_abc',
          name: 'list_dir',
          input: { path: 'engine' }
        }
      };
      const events = parseAnthropicEvent(event);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'tool_call');
      assert.equal(events[0].callId, 'toolu_abc');
      assert.equal(events[0].toolName, 'list_dir');
      assert.deepEqual(events[0].args, { path: 'engine' });
    });
  });

  describe('Google Gemini Normalizer', () => {
    it('normalizes text parts', () => {
      const chunk = {
        candidates: [{
          content: {
            parts: [{ text: 'Here is the architecture breakdown:' }]
          }
        }]
      };
      const events = parseGeminiChunk(chunk);
      assert.deepEqual(events, [{ type: 'content', text: 'Here is the architecture breakdown:' }]);
    });

    it('normalizes functionCall parts', () => {
      const chunk = {
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: 'grep_search',
                args: { query: 'EngineServer' }
              }
            }]
          }
        }]
      };
      const events = parseGeminiChunk(chunk);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'tool_call');
      assert.equal(events[0].toolName, 'grep_search');
      assert.deepEqual(events[0].args, { query: 'EngineServer' });
    });
  });
});
