/**
 * Multi-Provider LLM Streaming Gateway
 * Normalizes Gemini, Anthropic Claude, OpenAI, DeepSeek, and Ollama into unified TurnEvents.
 */

export function parseOpenAIStreamChunk(chunk, accumulator = null) {
  const events = [];
  if (!chunk || !chunk.choices || !chunk.choices[0]) return events;

  const delta = chunk.choices[0].delta || {};

  // 1. Thinking / Reasoning content (DeepSeek / OpenAI reasoning models)
  if (delta.reasoning_content) {
    events.push({
      type: 'thought',
      text: delta.reasoning_content,
    });
  }

  // 2. Regular Assistant Content
  if (delta.content) {
    events.push({
      type: 'content',
      text: delta.content,
    });
  }

  // 3. Tool Calls
  if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
    if (accumulator) {
      accumulator.processChunkDelta(delta);
    } else {
      for (const tc of delta.tool_calls) {
        if (tc.function) {
          let args = {};
          if (typeof tc.function.arguments === 'string') {
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = { raw: tc.function.arguments };
            }
          } else if (typeof tc.function.arguments === 'object') {
            args = tc.function.arguments;
          }

          events.push({
            type: 'tool_call',
            callId: tc.id || tc.function.name,
            toolName: tc.function.name,
            args,
          });
        }
      }
    }
  }

  return events;
}

export function parseAnthropicEvent(event) {
  const events = [];
  if (!event || !event.type) return events;

  if (event.type === 'content_block_delta' && event.delta) {
    if (event.delta.type === 'text_delta' && event.delta.text) {
      events.push({
        type: 'content',
        text: event.delta.text,
      });
    } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
      events.push({
        type: 'thought',
        text: event.delta.thinking,
      });
    }
  } else if (event.type === 'content_block_start' && event.content_block) {
    if (event.content_block.type === 'tool_use') {
      events.push({
        type: 'tool_call',
        callId: event.content_block.id,
        toolName: event.content_block.name,
        args: event.content_block.input || {},
      });
    }
  }

  return events;
}

export function parseGeminiChunk(chunk) {
  const events = [];
  if (!chunk || !chunk.candidates || !chunk.candidates[0]) return events;

  const content = chunk.candidates[0].content;
  if (!content || !Array.isArray(content.parts)) return events;

  for (const part of content.parts) {
    if (part.text) {
      events.push({
        type: 'content',
        text: part.text,
      });
    } else if (part.functionCall) {
      events.push({
        type: 'tool_call',
        toolName: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    }
  }

  return events;
}

import {
  BaseProvider,
  GeminiProvider,
  AnthropicProvider,
  OpenAICompatibleProvider,
} from './BaseProvider.mjs';
import { KiloGatewayProvider } from './KiloGatewayProvider.mjs';
import { OpenCodeBridgeProvider } from './OpenCodeBridgeProvider.mjs';
import { ClineBridgeProvider } from './ClineBridgeProvider.mjs';
import { parseClineXmlTools } from './ClinePromptParser.mjs';
import { StreamingToolAccumulator } from './StreamingToolAccumulator.mjs';

export {
  BaseProvider,
  GeminiProvider,
  AnthropicProvider,
  OpenAICompatibleProvider,
  KiloGatewayProvider,
  OpenCodeBridgeProvider,
  ClineBridgeProvider,
  parseClineXmlTools,
  StreamingToolAccumulator,
};


export function createProvider(config = {}) {
  if (!config.provider) {
    throw new Error('Missing required config parameter: provider');
  }

  const p = config.provider.toLowerCase();

  switch (p) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'claude':
    case 'anthropic':
      return new AnthropicProvider({ ...config, provider: 'claude' });
    case 'openai':
    case 'deepseek':
    case 'ollama':
      return new OpenAICompatibleProvider(config);
    case 'kilo':
      return new KiloGatewayProvider(config);
    case 'opencode':
      return new OpenCodeBridgeProvider(config);
    case 'cline':
      return new ClineBridgeProvider(config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}



