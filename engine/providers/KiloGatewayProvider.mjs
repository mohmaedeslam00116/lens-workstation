import { OpenAICompatibleProvider } from './BaseProvider.mjs';

/**
 * Dedicated Kilo Gateway Provider Adapter
 * Targets https://api.kilo.ai/api/gateway/v1
 * Supports dynamic model discovery and namespaced models (e.g. anthropic/claude-3-7-sonnet).
 */
export class KiloGatewayProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kilo',
      baseUrl: config.baseUrl || 'https://api.kilo.ai/api/gateway/v1',
    });
    this.name = 'kilo';
  }

  /**
   * Retrieves available models from Kilo Gateway
   */
  async fetchModels() {
    const modelsUrl = this.baseUrl.endsWith('/v1')
      ? this.baseUrl.replace(/\/v1$/, '/models')
      : `${this.baseUrl}/models`;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch models from Kilo Gateway (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.data || [];
  }
}
