/**
 * Base Provider classes for Multi-Provider Gateway
 */

export class BaseProvider {
  constructor(config = {}) {
    this.name = config.provider;
    this.model = config.model;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || '';
  }

  async *generateStream() {
    throw new Error('generateStream must be implemented by provider adapter');
  }

  async *continueStreamWithToolResult() {
    throw new Error('continueStreamWithToolResult must be implemented by provider adapter');
  }
}

export class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }
}

export class AnthropicProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  }
}

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    if (!this.baseUrl) {
      if (this.name === 'deepseek') {
        this.baseUrl = 'https://api.deepseek.com';
      } else if (this.name === 'ollama') {
        this.baseUrl = 'http://127.0.0.1:11434/v1';
      } else {
        this.baseUrl = 'https://api.openai.com/v1';
      }
    }
  }
}
