import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// SsrfGuard Tests
// ──────────────────────────────────────────────────────────────────────────────
import {
  SsrfGuard,
  SsrfError,
  ipv4ToInt,
  isBlockedIPv4,
  isBlockedIPv6,
} from '../../engine/security/SsrfGuard.mjs';

describe('SsrfGuard', () => {
  describe('ipv4ToInt', () => {
    it('parses 127.0.0.1 correctly', () => {
      assert.equal(ipv4ToInt('127.0.0.1'), 0x7f000001 >>> 0);
    });

    it('parses 10.0.0.1', () => {
      assert.equal(ipv4ToInt('10.0.0.1'), 0x0a000001 >>> 0);
    });

    it('parses 192.168.1.1', () => {
      assert.equal(ipv4ToInt('192.168.1.1'), 0xc0a80101 >>> 0);
    });

    it('returns null for invalid IPs', () => {
      assert.equal(ipv4ToInt('not-an-ip'), null);
      assert.equal(ipv4ToInt('256.1.1.1'), null);
      assert.equal(ipv4ToInt('1.2.3'), null);
    });
  });

  describe('isBlockedIPv4', () => {
    it('blocks loopback 127.0.0.1', () => {
      const result = isBlockedIPv4(ipv4ToInt('127.0.0.1'));
      assert.equal(result.blocked, true);
      assert.equal(result.label, 'loopback');
    });

    it('blocks RFC 1918 10.x.x.x', () => {
      assert.equal(isBlockedIPv4(ipv4ToInt('10.255.0.1')).blocked, true);
    });

    it('blocks RFC 1918 172.16.x.x', () => {
      assert.equal(isBlockedIPv4(ipv4ToInt('172.16.0.1')).blocked, true);
      assert.equal(isBlockedIPv4(ipv4ToInt('172.31.255.255')).blocked, true);
    });

    it('allows 172.32.x.x (outside /12)', () => {
      assert.equal(isBlockedIPv4(ipv4ToInt('172.32.0.1')).blocked, false);
    });

    it('blocks RFC 1918 192.168.x.x', () => {
      assert.equal(isBlockedIPv4(ipv4ToInt('192.168.0.1')).blocked, true);
    });

    it('blocks link-local 169.254.169.254', () => {
      const result = isBlockedIPv4(ipv4ToInt('169.254.169.254'));
      assert.equal(result.blocked, true);
      assert.equal(result.label, 'link-local');
    });

    it('allows public IPs', () => {
      assert.equal(isBlockedIPv4(ipv4ToInt('8.8.8.8')).blocked, false);
      assert.equal(isBlockedIPv4(ipv4ToInt('1.1.1.1')).blocked, false);
      assert.equal(isBlockedIPv4(ipv4ToInt('151.101.1.69')).blocked, false);
    });
  });

  describe('isBlockedIPv6', () => {
    it('blocks ::1 loopback', () => {
      assert.equal(isBlockedIPv6('::1').blocked, true);
    });

    it('blocks :: unspecified', () => {
      assert.equal(isBlockedIPv6('::').blocked, true);
    });

    it('blocks fe80: link-local', () => {
      assert.equal(isBlockedIPv6('fe80::1').blocked, true);
    });

    it('blocks fd00: ULA', () => {
      assert.equal(isBlockedIPv6('fd12::1').blocked, true);
    });

    it('allows public IPv6', () => {
      assert.equal(isBlockedIPv6('2001:4860:4860::8888').blocked, false);
    });
  });

  describe('SsrfGuard.validateUrl', () => {
    let guard;

    beforeEach(() => {
      guard = new SsrfGuard();
    });

    it('rejects empty URL', async () => {
      await assert.rejects(() => guard.validateUrl(''), SsrfError);
    });

    it('rejects non-HTTP scheme', async () => {
      await assert.rejects(() => guard.validateUrl('ftp://example.com'), SsrfError);
    });

    it('rejects raw loopback IP', async () => {
      await assert.rejects(
        () => guard.validateUrl('http://127.0.0.1:8080/admin'),
        (err) => {
          assert.ok(err instanceof SsrfError);
          assert.ok(err.message.includes('loopback'));
          return true;
        }
      );
    });

    it('rejects private 10.x.x.x IP', async () => {
      await assert.rejects(
        () => guard.validateUrl('http://10.0.0.1/secret'),
        SsrfError
      );
    });

    it('rejects cloud metadata endpoint', async () => {
      await assert.rejects(
        () => guard.validateUrl('http://169.254.169.254/latest/meta-data'),
        SsrfError
      );
    });

    it('rejects explicitly blocked hostname', async () => {
      guard = new SsrfGuard({ blockedHostnames: ['evil.com'] });
      await assert.rejects(
        () => guard.validateUrl('https://evil.com/page'),
        SsrfError
      );
    });

    it('allows explicitly allowed hostname', async () => {
      guard = new SsrfGuard({ allowedHostnames: ['safe.example.com'] });
      const result = await guard.validateUrl('https://safe.example.com/page');
      assert.equal(result.safe, true);
      assert.equal(result.ip, 'allowed-bypass');
    });

    it('validates public URL via DNS lookup', async () => {
      const result = await guard.validateUrl('https://example.com');
      assert.equal(result.safe, true);
      assert.ok(result.ip);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ScrapingLadder Tests (Unit tests with mocked HTML)
// ──────────────────────────────────────────────────────────────────────────────
import { ScrapingLadder } from '../../engine/research/ScrapingLadder.mjs';

describe('ScrapingLadder', () => {
  describe('_htmlToMarkdown', () => {
    let ladder;

    beforeEach(() => {
      ladder = new ScrapingLadder();
    });

    it('extracts article content from HTML', () => {
      const html = `
        <html><head><title>Test Article</title></head>
        <body>
          <nav>Menu Item 1 | Menu Item 2</nav>
          <article>
            <h1>Main Heading</h1>
            <p>This is the main article content with enough text to pass the Readability threshold.
            It needs to be sufficiently long for Readability to consider it real content rather than
            boilerplate. Adding more sentences here to ensure extraction works properly.</p>
            <p>Second paragraph with additional meaningful content that contributes to the article.
            More text is needed for reliable Readability extraction so we add several sentences.</p>
          </article>
          <footer>Copyright 2024</footer>
        </body></html>
      `;

      const markdown = ladder._htmlToMarkdown(html, 'https://example.com/article');
      assert.ok(markdown.length > 0, 'Should produce non-empty markdown');
      assert.ok(markdown.includes('Main Heading') || markdown.includes('main article content'),
        'Should contain article content');
    });

    it('falls back to body when no article element', () => {
      const html = `
        <html><body>
          <div>
            <h2>Simple Page</h2>
            <p>Just some content on a basic page with enough text for extraction.
            Multiple paragraphs help Readability understand the content structure.
            We need sufficient text density to trigger proper parsing.</p>
          </div>
        </body></html>
      `;

      const markdown = ladder._htmlToMarkdown(html, 'https://example.com');
      assert.ok(markdown.length > 0);
    });
  });

  describe('_applyBudget', () => {
    it('returns text unchanged when under budget', () => {
      const ladder = new ScrapingLadder({ pageBudget: 8000 });
      const short = 'Hello World';
      assert.equal(ladder._applyBudget(short), short);
    });

    it('truncates long text and adds marker', () => {
      // MIN_PAGE_BUDGET is 2000, so we need text longer than that
      const ladder = new ScrapingLadder({ pageBudget: 2000 });
      const paragraph = 'A meaningful paragraph of text.\n\n';
      const long = paragraph.repeat(100); // ~3200 chars
      const result = ladder._applyBudget(long);
      assert.ok(result.length < long.length, 'Should be shorter than original');
      assert.ok(result.includes('[...truncated]'), 'Should include truncation marker');
    });
  });

  describe('extract', () => {
    it('returns skip for invalid URL', async () => {
      const ladder = new ScrapingLadder();
      const result = await ladder.extract('');
      assert.equal(result.success, false);
      assert.equal(result.skipped, true);
      assert.equal(result.skipReason, 'invalid_url');
    });

    it('returns skip for null URL', async () => {
      const ladder = new ScrapingLadder();
      const result = await ladder.extract(null);
      assert.equal(result.success, false);
      assert.equal(result.skipped, true);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BilingualBM25 Tests
// ──────────────────────────────────────────────────────────────────────────────
import {
  BilingualBM25,
  stemEnglish,
  stemArabic,
  isArabic,
  ENGLISH_STOPWORDS,
  ARABIC_STOPWORDS,
} from '../../engine/research/BilingualBM25.mjs';

describe('BilingualBM25', () => {
  describe('stemEnglish', () => {
    it('stems -ing words', () => {
      assert.equal(stemEnglish('running'), 'run');
      assert.equal(stemEnglish('testing'), 'test');
    });

    it('stems -tion/-sion words', () => {
      assert.equal(stemEnglish('information'), 'informat');
      assert.equal(stemEnglish('compression'), 'compress');
    });

    it('stems -ness words', () => {
      assert.equal(stemEnglish('happiness'), 'happi');
    });

    it('stems plurals', () => {
      assert.equal(stemEnglish('queries'), 'query');
      assert.equal(stemEnglish('boxes'), 'box');
    });

    it('preserves short words', () => {
      assert.equal(stemEnglish('run'), 'run');
      assert.equal(stemEnglish('go'), 'go');
    });
  });

  describe('stemArabic', () => {
    it('strips ال prefix', () => {
      assert.equal(stemArabic('الكتاب'), 'كتاب');
    });

    it('strips وال prefix', () => {
      assert.equal(stemArabic('والعلم'), 'علم');
    });

    it('strips فال prefix', () => {
      assert.equal(stemArabic('فالعمل'), 'عمل');
    });

    it('preserves short words', () => {
      assert.equal(stemArabic('في'), 'في');
    });
  });

  describe('isArabic', () => {
    it('detects Arabic text', () => {
      assert.ok(isArabic('مرحبا'));
      assert.ok(isArabic('العربية'));
    });

    it('rejects non-Arabic text', () => {
      assert.ok(!isArabic('hello'));
      assert.ok(!isArabic('12345'));
    });
  });

  describe('tokenize', () => {
    let bm25;

    beforeEach(() => {
      bm25 = new BilingualBM25();
    });

    it('tokenizes English text with stemming', () => {
      const tokens = bm25.tokenize('Information retrieval and testing systems');
      assert.ok(tokens.length > 0);
      // 'and' should be removed as stopword
      assert.ok(!tokens.includes('and'));
      // 'information' should be stemmed
      assert.ok(tokens.some(t => t.startsWith('informat')));
    });

    it('tokenizes Arabic text with normalization', () => {
      const tokens = bm25.tokenize('التعلم العميق في معالجة اللغة');
      assert.ok(tokens.length > 0);
      // في should be removed as stopword
      assert.ok(!tokens.includes('في'));
      // ال should be stripped from التعلم → تعلم
      assert.ok(tokens.includes('تعلم'));
    });

    it('handles mixed Arabic/English text', () => {
      const tokens = bm25.tokenize('Deep learning التعلم العميق');
      assert.ok(tokens.length > 0);
      // Should have both English and Arabic tokens
      assert.ok(tokens.some(t => !isArabic(t)), 'Should have English tokens');
      assert.ok(tokens.some(t => isArabic(t)), 'Should have Arabic tokens');
    });

    it('returns empty array for empty input', () => {
      assert.deepEqual(bm25.tokenize(''), []);
      assert.deepEqual(bm25.tokenize(null), []);
    });
  });

  describe('addDocument and search', () => {
    let bm25;

    beforeEach(() => {
      bm25 = new BilingualBM25();
      bm25.addDocument('doc1', 'Machine learning algorithms for natural language processing');
      bm25.addDocument('doc2', 'Deep neural networks and computer vision applications');
      bm25.addDocument('doc3', 'Natural language understanding with transformer models');
      bm25.addDocument('doc4', 'التعلم الآلي ومعالجة اللغة الطبيعية');
    });

    it('returns relevant results for English query', () => {
      const results = bm25.search('natural language processing', 10);
      assert.ok(results.length > 0, 'Should return results');
      // doc1 or doc3 should rank high (they mention NLP)
      const topIds = results.slice(0, 2).map(r => r.docId);
      assert.ok(
        topIds.includes('doc1') || topIds.includes('doc3'),
        'NLP docs should rank in top 2'
      );
    });

    it('returns relevant results for Arabic query', () => {
      const results = bm25.search('التعلم الآلي', 10);
      assert.ok(results.length > 0, 'Should return results');
      assert.equal(results[0].docId, 'doc4', 'Arabic doc should rank first');
    });

    it('returns empty for unrelated query', () => {
      const results = bm25.search('quantum physics thermodynamics', 10);
      assert.equal(results.length, 0);
    });

    it('respects topK limit', () => {
      const results = bm25.search('learning', 2);
      assert.ok(results.length <= 2);
    });
  });

  describe('removeDocument', () => {
    it('removes document from index', () => {
      const bm25 = new BilingualBM25();
      bm25.addDocument('doc1', 'Unique quantum computing research');
      bm25.addDocument('doc2', 'Something completely different');

      let results = bm25.search('quantum computing', 10);
      assert.equal(results.length, 1);
      assert.equal(results[0].docId, 'doc1');

      bm25.removeDocument('doc1');
      results = bm25.search('quantum computing', 10);
      assert.equal(results.length, 0);
    });
  });

  describe('fusionRRF', () => {
    it('fuses two ranked lists', () => {
      const bm25 = new BilingualBM25();
      const list1 = [
        { docId: 'A', score: 10 },
        { docId: 'B', score: 8 },
        { docId: 'C', score: 5 },
      ];
      const list2 = [
        { docId: 'B', score: 12 },
        { docId: 'C', score: 9 },
        { docId: 'A', score: 3 },
      ];

      const fused = bm25.fusionRRF([list1, list2]);
      assert.ok(fused.length >= 3, 'All docs should appear');

      // B appears rank 2 in list1 and rank 1 in list2 → should have high RRF
      const docB = fused.find(r => r.docId === 'B');
      assert.ok(docB, 'Doc B should be in fused results');
    });

    it('handles empty lists', () => {
      const bm25 = new BilingualBM25();
      const fused = bm25.fusionRRF([[], []]);
      assert.equal(fused.length, 0);
    });
  });

  describe('selectMMR', () => {
    it('diversifies results', () => {
      const bm25 = new BilingualBM25();
      // Add similar and different documents
      bm25.addDocument('similar1', 'deep learning neural networks artificial intelligence');
      bm25.addDocument('similar2', 'deep learning neural networks machine learning');
      bm25.addDocument('different', 'database query optimization indexing');

      const candidates = [
        { docId: 'similar1', score: 10 },
        { docId: 'similar2', score: 9 },
        { docId: 'different', score: 5 },
      ];

      const queryTokens = bm25.tokenize('deep learning');
      const selected = bm25.selectMMR(candidates, queryTokens, 2);
      assert.equal(selected.length, 2);
      // First pick should be highest score
      assert.equal(selected[0].docId, 'similar1');
    });

    it('returns all when fewer than topK', () => {
      const bm25 = new BilingualBM25();
      const candidates = [{ docId: 'only', score: 5 }];
      const selected = bm25.selectMMR(candidates, ['test'], 10);
      assert.equal(selected.length, 1);
    });
  });

  describe('jaccardSimilarity', () => {
    it('returns 1 for identical token sets', () => {
      const bm25 = new BilingualBM25();
      assert.equal(bm25.jaccardSimilarity(['a', 'b'], ['a', 'b']), 1);
    });

    it('returns 0 for disjoint token sets', () => {
      const bm25 = new BilingualBM25();
      assert.equal(bm25.jaccardSimilarity(['a', 'b'], ['c', 'd']), 0);
    });

    it('returns 0.5 for half-overlapping sets', () => {
      const bm25 = new BilingualBM25();
      const sim = bm25.jaccardSimilarity(['a', 'b'], ['a', 'c']);
      // intersection=1, union=3 → ~0.33
      assert.ok(sim > 0.3 && sim < 0.4);
    });

    it('returns 0 for empty arrays', () => {
      const bm25 = new BilingualBM25();
      assert.equal(bm25.jaccardSimilarity([], []), 0);
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      const bm25 = new BilingualBM25();
      bm25.addDocument('doc1', 'hello world testing');
      bm25.addDocument('doc2', 'another document here');

      const stats = bm25.getStats();
      assert.equal(stats.documentCount, 2);
      assert.ok(stats.termCount > 0);
      assert.ok(stats.averageDocLength > 0);
    });
  });

  describe('hybridSearch', () => {
    it('runs BM25 + MMR pipeline', () => {
      const bm25 = new BilingualBM25();
      bm25.addDocument('d1', 'Machine learning algorithms optimization gradient descent');
      bm25.addDocument('d2', 'Deep learning neural networks convolutional recurrent');
      bm25.addDocument('d3', 'Natural language processing text classification sentiment');
      bm25.addDocument('d4', 'Machine learning feature engineering data preprocessing');

      const results = bm25.hybridSearch('machine learning', 3);
      assert.ok(results.length > 0);
      assert.ok(results.length <= 3);
    });

    it('handles additional rankings in RRF', () => {
      const bm25 = new BilingualBM25();
      bm25.addDocument('d1', 'quantum computing algorithms');
      bm25.addDocument('d2', 'classical computing hardware');

      const extraRanking = [
        { docId: 'd2', score: 10 },
        { docId: 'd1', score: 5 },
      ];

      const results = bm25.hybridSearch('computing', 2, {
        additionalRankings: [extraRanking],
      });
      assert.ok(results.length > 0);
    });
  });
});
