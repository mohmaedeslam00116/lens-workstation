/**
 * TavilySearchAdapter
 * High-precision search and extraction adapter via Tavily API.
 */
export class TavilySearchAdapter {
  constructor(options = {}) {
    this.name = 'tavily';
    this.apiKey = options.apiKey || process.env.TAVILY_API_KEY || '';
    this.endpoint = options.endpoint || 'https://api.tavily.com/search';
    this.timeoutMs = options.timeoutMs || 8000;
  }

  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const apiKey = options.apiKey || this.apiKey;
    if (!apiKey) {
      throw new Error('Tavily Search API key is required but was not provided.');
    }

    const limit = options.limit || 10;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options.signal || controller.signal;

    try {
      const payload = {
        api_key: apiKey,
        query: query.trim(),
        search_depth: options.searchDepth || 'basic',
        max_results: limit,
        include_raw_content: false,
      };

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'LENS-Workstation/0.2.0 (TavilySearch)',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Tavily Search HTTP ${res.status}: ${errText || res.statusText}`);
      }

      const json = await res.json();
      const rawResults = Array.isArray(json.results) ? json.results : [];

      return rawResults.slice(0, limit).map((r) => ({
        url: r.url || '',
        title: r.title || '',
        snippet: r.content || '',
        score: typeof r.score === 'number' ? r.score : undefined,
        sourceEngine: 'tavily',
        metadata: {
          rawContent: r.raw_content,
        },
      }));
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Tavily Search timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
