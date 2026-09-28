/**
 * DuckDuckGoSearchAdapter
 * Free, zero-API-key web retrieval adapter via DuckDuckGo HTML endpoint.
 */
export class DuckDuckGoSearchAdapter {
  constructor(options = {}) {
    this.name = 'duckduckgo';
    this.endpoint = options.endpoint || 'https://html.duckduckgo.com/html/';
    this.timeoutMs = options.timeoutMs || 8000;
  }

  /**
   * Extract actual destination URL from DuckDuckGo redirect link
   * e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=...
   */
  decodeDuckDuckGoUrl(rawHref) {
    if (!rawHref) return '';
    try {
      if (rawHref.includes('uddg=')) {
        const urlObj = new URL(rawHref, 'https://duckduckgo.com');
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
      }
      if (rawHref.startsWith('//')) {
        return `https:${rawHref}`;
      }
      return rawHref;
    } catch {
      return rawHref;
    }
  }

  /**
   * Strip HTML tags and decode basic HTML entities
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Execute search and parse organic search results
   */
  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const limit = options.limit || 10;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = options.signal || controller.signal;

    try {
      const body = new URLSearchParams({ q: query.trim() });
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        body: body.toString(),
        signal,
      });

      if (!res.ok) {
        throw new Error(`DuckDuckGo HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();
      return this.parseHtml(html, limit);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`DuckDuckGo search timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse organic results from DuckDuckGo HTML
   */
  parseHtml(html, limit = 10) {
    const results = [];
    if (!html) return results;

    // DuckDuckGo result blocks: <div class="result results_links ...">
    const resultBlockRegex = /<div[^>]*class="[^"]*result\s+results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let match;

    while ((match = resultBlockRegex.exec(html)) !== null && results.length < limit) {
      const block = match[1];

      // Extract Title & Link: <a class="result__a" href="...">Title</a>
      const titleLinkMatch = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!titleLinkMatch) continue;

      const rawHref = titleLinkMatch[1];
      const titleHtml = titleLinkMatch[2];
      const url = this.decodeDuckDuckGoUrl(rawHref);
      const title = this.stripHtml(titleHtml);

      // Extract Snippet: <a class="result__snippet" ...>Snippet</a>
      const snippetMatch = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : '';

      if (url && (title || snippet)) {
        results.push({
          url,
          title,
          snippet,
          sourceEngine: 'duckduckgo',
        });
      }
    }

    return results;
  }
}
