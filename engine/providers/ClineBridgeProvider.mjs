import { OpenAICompatibleProvider } from './BaseProvider.mjs';
import { parseClineXmlTools } from './ClinePromptParser.mjs';

/**
 * Cline Bridge Provider Adapter
 * Connects to OpenRouter or custom Cline-compatible endpoints with dual XML & native function calling parsing.
 */
export class ClineBridgeProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'cline',
      baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
    });
    this.name = 'cline';
    this.extraHeaders = {
      'HTTP-Referer': 'https://lens-desktop.org',
      'X-Title': 'LENS Workstation',
      ...(config.extraHeaders || {}),
    };
  }

  /**
   * Helper to parse any XML-formatted tool calls in streamed response text
   */
  parseXmlTools(text) {
    return parseClineXmlTools(text);
  }
}
