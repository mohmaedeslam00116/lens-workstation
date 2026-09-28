import { DuckDuckGoSearchAdapter } from './DuckDuckGoSearchAdapter.mjs';
import { SearXNGSearchAdapter } from './SearXNGSearchAdapter.mjs';
import { ArXivSearchAdapter } from './ArXivSearchAdapter.mjs';
import { BraveSearchAdapter } from './BraveSearchAdapter.mjs';
import { TavilySearchAdapter } from './TavilySearchAdapter.mjs';
import { DeduplicationEngine } from '../DeduplicationEngine.mjs';

/**
 * SearchPlane
 * Supervises web retrieval adapters, manages rate limits via bounded concurrency,
 * provides automatic fallback to zero-config engines, and applies deduplication.
 */
export class SearchPlane {
  constructor(options = {}) {
    this.concurrencyLimit = options.concurrencyLimit || 3;
    this.activeRequests = 0;
    this.queue = [];

    this.adapters = {
      duckduckgo: new DuckDuckGoSearchAdapter(options.duckduckgo),
      searxng: new SearXNGSearchAdapter(options.searxng),
      arxiv: new ArXivSearchAdapter(options.arxiv),
      brave: options.braveApiKey ? new BraveSearchAdapter({ apiKey: options.braveApiKey }) : null,
      tavily: options.tavilyApiKey ? new TavilySearchAdapter({ apiKey: options.tavilyApiKey }) : null,
    };

    this.preferredEngine = options.preferredEngine || (options.braveApiKey ? 'brave' : options.tavilyApiKey ? 'tavily' : 'duckduckgo');
    this.deduplicator = options.deduplicator || new DeduplicationEngine();
  }

  /**
   * Bounded concurrency admission gate (Semaphore)
   */
  async acquireTicket() {
    if (this.activeRequests < this.concurrencyLimit) {
      this.activeRequests++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.activeRequests++;
  }

  releaseTicket() {
    this.activeRequests--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Execute search with automatic fallback across providers
   */
  async search(query, options = {}) {
    await this.acquireTicket();
    try {
      const preferred = options.engine || this.preferredEngine;
      const primaryAdapter = this.adapters[preferred];

      if (primaryAdapter) {
        try {
          const results = await primaryAdapter.search(query, options);
          if (Array.isArray(results) && results.length > 0) {
            return results;
          }
        } catch {
          // Fall through to fallback adapters
        }
      }

      // Fallback 1: DuckDuckGo
      if (preferred !== 'duckduckgo') {
        try {
          const ddgResults = await this.adapters.duckduckgo.search(query, options);
          if (Array.isArray(ddgResults) && ddgResults.length > 0) {
            return ddgResults;
          }
        } catch {
          // Fall through
        }
      }

      // Fallback 2: If query looks academic or technical, try arXiv
      if (/\b(algorithm|paper|protocol|architecture|neural|model|survey)\b/i.test(query)) {
        try {
          const arxivResults = await this.adapters.arxiv.search(query, options);
          if (Array.isArray(arxivResults) && arxivResults.length > 0) {
            return arxivResults;
          }
        } catch {
          // Fall through
        }
      }

      return [];
    } finally {
      this.releaseTicket();
    }
  }

  /**
   * Batch Search across multiple milestone queries with 3-level deduplication
   */
  async batchSearch(queries, options = {}) {
    if (!Array.isArray(queries) || queries.length === 0) {
      return [];
    }

    const dedup = options.deduplicator || this.deduplicator;
    const allResults = [];

    const searchPromises = queries.map((q) =>
      this.search(q, options).catch(() => [])
    );

    const settled = await Promise.all(searchPromises);

    for (const resultSet of settled) {
      for (const item of resultSet) {
        const check = dedup.checkAndRegister({
          url: item.url,
          content: item.snippet,
          title: item.title,
        });

        if (!check.duplicate) {
          allResults.push({
            ...item,
            canonicalUrl: check.canonicalUrl,
          });
        }
      }
    }

    return allResults;
  }
}
