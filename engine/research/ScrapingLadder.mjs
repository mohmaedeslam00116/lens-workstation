import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { SsrfGuard, SsrfError } from '../security/SsrfGuard.mjs';

/**
 * Default page content budget (characters).
 */
const DEFAULT_PAGE_BUDGET = 8000;
const MIN_PAGE_BUDGET = 2000;
const MAX_PAGE_BUDGET = 12000;

/**
 * HTTP status codes that trigger Tier 2 fallback.
 */
const FALLBACK_STATUS_CODES = new Set([403, 429, 451, 503, 520, 521, 522, 523, 524, 525, 526]);

/**
 * User-Agent for direct HTTP fetch.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * ScrapingLadder — 3-Tier Content Extraction Pipeline
 *
 * Tier 1: Fast HTTP fetch + linkedom DOM emulation + Readability extraction + Turndown markdown.
 * Tier 2: Fallback to Jina reader proxy (r.jina.ai/<url>) on HTTP 403/429/Cloudflare blocks.
 * Tier 3: Graceful skip with structured metadata about the failure.
 *
 * Usage:
 *   const ladder = new ScrapingLadder({ pageBudget: 8000 });
 *   const result = await ladder.extract('https://example.com/article');
 *   console.log(result.markdown); // cleaned markdown text
 */
export class ScrapingLadder {
  constructor(options = {}) {
    this.pageBudget = Math.min(
      MAX_PAGE_BUDGET,
      Math.max(MIN_PAGE_BUDGET, options.pageBudget ?? DEFAULT_PAGE_BUDGET)
    );
    this.fetchTimeout = options.fetchTimeout ?? 10000;
    this.jinaTimeout = options.jinaTimeout ?? 15000;
    this.ssrfGuard = options.ssrfGuard ?? new SsrfGuard();
    this.turndown = this._createTurndown();
  }

  /**
   * Configure Turndown with GFM-appropriate rules.
   */
  _createTurndown() {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '_',
      strongDelimiter: '**',
    });

    // Remove script, style, nav, footer, header, aside, iframe, form elements
    td.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'form', 'noscript']);

    return td;
  }

  /**
   * Main extraction entry point. Attempts tiers in order.
   *
   * @param {string} url — The page URL to extract.
   * @returns {Promise<ExtractionResult>}
   */
  async extract(url) {
    if (!url || typeof url !== 'string') {
      return this._skip(url, 'invalid_url', 'URL is empty or non-string');
    }

    // Tier 1: Direct HTTP + linkedom + Readability + Turndown
    const tier1 = await this._tier1(url);
    if (tier1.success) return tier1;

    // Tier 2: Jina reader proxy fallback
    const tier2 = await this._tier2(url, tier1.error);
    if (tier2.success) return tier2;

    // Tier 3: Graceful skip
    return this._skip(url, 'all_tiers_failed', `Tier1: ${tier1.error}; Tier2: ${tier2.error}`);
  }

  /**
   * Tier 1: Direct HTTP fetch → linkedom → Readability → Turndown
   */
  async _tier1(url) {
    try {
      // SSRF pre-flight check
      await this.ssrfGuard.validateUrl(url);
    } catch (err) {
      if (err instanceof SsrfError) {
        return {
          success: false,
          tier: 1,
          error: `SSRF blocked: ${err.message}`,
          ssrfBlocked: true,
        };
      }
      return { success: false, tier: 1, error: `SSRF check failed: ${err.message}` };
    }

    let response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeout);

      response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
    } catch (err) {
      return { success: false, tier: 1, error: `Fetch failed: ${err.message}` };
    }

    // Check for blocked status codes → trigger Tier 2
    if (FALLBACK_STATUS_CODES.has(response.status)) {
      return {
        success: false,
        tier: 1,
        error: `HTTP ${response.status} — blocked or rate-limited`,
        statusCode: response.status,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        tier: 1,
        error: `HTTP ${response.status} ${response.statusText}`,
        statusCode: response.status,
      };
    }

    // Read body
    let html;
    try {
      html = await response.text();
    } catch (err) {
      return { success: false, tier: 1, error: `Body read failed: ${err.message}` };
    }

    if (!html || html.trim().length < 100) {
      return { success: false, tier: 1, error: 'Empty or too-short HTML body' };
    }

    // Parse with linkedom + extract with Readability
    try {
      const markdown = this._htmlToMarkdown(html, url);
      if (!markdown || markdown.trim().length < 50) {
        return { success: false, tier: 1, error: 'Readability extraction yielded empty content' };
      }

      const budgeted = this._applyBudget(markdown);

      return {
        success: true,
        tier: 1,
        url,
        markdown: budgeted,
        charCount: budgeted.length,
        truncated: budgeted.length < markdown.length,
      };
    } catch (err) {
      return { success: false, tier: 1, error: `Extraction failed: ${err.message}` };
    }
  }

  /**
   * Tier 2: Jina reader proxy (r.jina.ai/<url>) fallback.
   */
  async _tier2(url, tier1Error) {
    // Don't fallback to Jina if SSRF was blocked — the URL itself is dangerous
    if (tier1Error && tier1Error.includes('SSRF blocked')) {
      return { success: false, tier: 2, error: 'Skipped — SSRF-blocked URL' };
    }

    const jinaUrl = `https://r.jina.ai/${url}`;

    let response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.jinaTimeout);

      response = await fetch(jinaUrl, {
        headers: {
          Accept: 'text/plain',
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err) {
      return { success: false, tier: 2, error: `Jina fetch failed: ${err.message}` };
    }

    if (!response.ok) {
      return {
        success: false,
        tier: 2,
        error: `Jina HTTP ${response.status} ${response.statusText}`,
      };
    }

    let text;
    try {
      text = await response.text();
    } catch (err) {
      return { success: false, tier: 2, error: `Jina body read failed: ${err.message}` };
    }

    if (!text || text.trim().length < 50) {
      return { success: false, tier: 2, error: 'Jina returned empty or too-short content' };
    }

    const budgeted = this._applyBudget(text.trim());

    return {
      success: true,
      tier: 2,
      url,
      markdown: budgeted,
      charCount: budgeted.length,
      truncated: budgeted.length < text.trim().length,
    };
  }

  /**
   * Tier 3: Graceful skip — return structured metadata about the failure.
   */
  _skip(url, reason, details) {
    return {
      success: false,
      tier: 3,
      url: url || '',
      markdown: '',
      charCount: 0,
      truncated: false,
      skipped: true,
      skipReason: reason,
      skipDetails: details,
    };
  }

  /**
   * Parse HTML via linkedom, extract main content via Readability, convert to Markdown via Turndown.
   *
   * @param {string} html — Raw HTML string.
   * @param {string} url — Source URL for Readability.
   * @returns {string} Markdown text.
   */
  _htmlToMarkdown(html, url) {
    // linkedom parsing
    const { document } = parseHTML(html);

    // Readability extraction
    const reader = new Readability(document, { charThreshold: 50 });
    const article = reader.parse();

    if (!article || !article.content) {
      // Fallback: use body innerHTML directly
      const body = document.querySelector('body');
      if (!body) return '';
      return this.turndown.turndown(body.innerHTML || '');
    }

    // Convert article content to markdown
    return this.turndown.turndown(article.content);
  }

  /**
   * Apply hard character budget. Truncates at the last complete paragraph boundary.
   */
  _applyBudget(text) {
    if (text.length <= this.pageBudget) return text;

    // Find the last paragraph break before the budget limit
    const truncated = text.slice(0, this.pageBudget);
    const lastParagraph = truncated.lastIndexOf('\n\n');

    if (lastParagraph > this.pageBudget * 0.5) {
      return truncated.slice(0, lastParagraph) + '\n\n[...truncated]';
    }

    // Fallback: truncate at the last space
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > this.pageBudget * 0.7) {
      return truncated.slice(0, lastSpace) + ' [...truncated]';
    }

    return truncated + ' [...truncated]';
  }
}

/**
 * @typedef {Object} ExtractionResult
 * @property {boolean} success — Whether content was successfully extracted.
 * @property {number} tier — Which tier succeeded (1, 2, or 3 for skip).
 * @property {string} url — The source URL.
 * @property {string} markdown — Extracted markdown content.
 * @property {number} charCount — Character count of the markdown content.
 * @property {boolean} truncated — Whether content was truncated to page budget.
 * @property {boolean} [skipped] — Whether extraction was skipped entirely (Tier 3).
 * @property {string} [skipReason] — Reason for skipping.
 * @property {string} [skipDetails] — Detailed failure description.
 * @property {string} [error] — Error description (on failure).
 */
