/**
 * BraveSearchAdapter
 * High-performance independent web index search adapter via Brave Search API.
 */
export class BraveSearchAdapter {
  constructor(options = {}) {
    this.name = 'brave';
    this.apiKey = options.apiKey || process.env.BRAVE_SEARCH_API_KEY || '';
    this.endpoint = options.endpoint || 'https://api.search.brave.com/res/v1/web/search';
    this.timeoutMs = options.timeoutMs || 8000;
  }

  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const apiKey = options.apiKey || this.apiKey;
    if (!apiKey) {
      throw new Error('Brave Search API key is required but was not provided.');
    }

    const limit = options.limit || 10;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options.signal || controller.signal;

    try {
      const url = `${this.endpoint}?q=${encodeURIComponent(query.trim())}&count=${limit}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
          'User-Agent': 'LENS-Workstation/0.2.0 (BraveSearch)',
        },
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Brave Search HTTP ${res.status}: ${errText || res.statusText}`);
      }

      const json = await res.json();
      const rawResults = json.web?.results || [];

      return rawResults.slice(0, limit).map((r) => {
        let snippet = r.description || '';
        if (Array.isArray(r.extra_snippets) && r.extra_snippets.length > 0) {
          snippet += '\n' + r.extra_snippets.join('\n');
        }

        return {
          url: r.url || '',
          title: r.title || '',
          snippet: snippet.trim(),
          sourceEngine: 'brave',
          metadata: {
            age: r.age,
            language: r.language,
          },
        };
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Brave Search timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
