/**
 * SearXNGSearchAdapter
 * Free metasearch JSON adapter targeting self-hosted or public SearXNG instances.
 */
export class SearXNGSearchAdapter {
  constructor(options = {}) {
    this.name = 'searxng';
    this.baseUrl = (options.baseUrl || 'http://localhost:8080').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 8000;
  }

  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const limit = options.limit || 10;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options.signal || controller.signal;

    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query.trim())}&format=json`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LENS-Workstation/0.2.0 (DeepResearch)',
        },
        signal,
      });

      if (!res.ok) {
        throw new Error(`SearXNG HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const rawResults = Array.isArray(json.results) ? json.results : [];

      return rawResults.slice(0, limit).map((r) => ({
        url: r.url || '',
        title: r.title || '',
        snippet: r.content || '',
        score: typeof r.score === 'number' ? r.score : undefined,
        sourceEngine: 'searxng',
        metadata: {
          engine: r.engine,
          publishedDate: r.publishedDate,
        },
      }));
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`SearXNG search timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
