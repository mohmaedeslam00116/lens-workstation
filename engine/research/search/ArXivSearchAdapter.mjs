/**
 * ArXivSearchAdapter
 * Scientific and academic preprint literature search via official arXiv API (Atom XML).
 */
export class ArXivSearchAdapter {
  constructor(options = {}) {
    this.name = 'arxiv';
    this.endpoint = options.endpoint || 'https://export.arxiv.org/api/query';
    this.timeoutMs = options.timeoutMs || 10000;
  }

  /**
   * Strip XML tags and clean whitespace
   */
  stripXml(xml) {
    if (!xml) return '';
    return xml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
      const formattedQuery = encodeURIComponent(`all:${query.trim()}`);
      const url = `${this.endpoint}?search_query=${formattedQuery}&start=0&max_results=${limit}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/atom+xml',
          'User-Agent': 'LENS-Workstation/0.2.0 (arXiv Research)',
        },
        signal,
      });

      if (!res.ok) {
        throw new Error(`arXiv HTTP ${res.status}: ${res.statusText}`);
      }

      const xml = await res.text();
      return this.parseAtomXml(xml, limit);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`arXiv search timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  parseAtomXml(xml, limit = 10) {
    const results = [];
    if (!xml) return results;

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;

    while ((match = entryRegex.exec(xml)) !== null && results.length < limit) {
      const entryXml = match[1];

      // Extract ID / URL
      const idMatch = /<id>([\s\S]*?)<\/id>/i.exec(entryXml);
      const url = idMatch ? this.stripXml(idMatch[1]) : '';

      // Extract Title
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(entryXml);
      const title = titleMatch ? this.stripXml(titleMatch[1]) : 'Untitled Paper';

      // Extract Summary / Abstract
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(entryXml);
      const snippet = summaryMatch ? this.stripXml(summaryMatch[1]) : '';

      // Extract Published Date
      const publishedMatch = /<published>([\s\S]*?)<\/published>/i.exec(entryXml);
      const published = publishedMatch ? this.stripXml(publishedMatch[1]) : '';

      // Extract PDF Link
      const pdfMatch = /<link[^>]*title="pdf"[^>]*href="([^"]+)"/i.exec(entryXml);
      const pdfUrl = pdfMatch ? pdfMatch[1] : '';

      // Extract Authors
      const authors = [];
      const authorRegex = /<author>\s*<name>([\s\S]*?)<\/name>/gi;
      let aMatch;
      while ((aMatch = authorRegex.exec(entryXml)) !== null) {
        authors.push(this.stripXml(aMatch[1]));
      }

      if (url && (title || snippet)) {
        results.push({
          url,
          title,
          snippet,
          sourceEngine: 'arxiv',
          metadata: {
            pdfUrl,
            published,
            authors,
          },
        });
      }
    }

    return results;
  }
}
