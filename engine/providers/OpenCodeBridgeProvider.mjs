import { OpenAICompatibleProvider } from './BaseProvider.mjs';

/**
 * Dedicated OpenCode Bridge Provider
 * Connects to OpenCode Zen gateway, local proxies, or custom AI routing gateways.
 */
export class OpenCodeBridgeProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'opencode',
      baseUrl: config.baseUrl || 'https://api.opencode.ai/v1',
    });
    this.name = 'opencode';
    this.extraHeaders = config.extraHeaders || {};
  }
}
