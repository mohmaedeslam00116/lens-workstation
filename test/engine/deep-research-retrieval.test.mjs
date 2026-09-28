import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QueryPlanner,
  DeduplicationEngine,
  fnv1a64,
  DuckDuckGoSearchAdapter,
  SearXNGSearchAdapter,
  ArXivSearchAdapter,
  BraveSearchAdapter,
  TavilySearchAdapter,
  SearchPlane,
} from '../../engine/research/index.mjs';

describe('Deep Research Retrieval Plane & 3-Level Deduplication Engine (Ticket #28)', () => {
  describe('QueryPlanner & Perspective Simulation', () => {
    it('decomposes a research topic into multi-perspective milestones with Boolean queries', async () => {
      const planner = new QueryPlanner();
      const plan = await planner.planResearch('Node.js worker_threads memory leaks and V8 garbage collection');

      assert.ok(plan.id.startsWith('plan-'));
      assert.equal(plan.topic, 'Node.js worker_threads memory leaks and V8 garbage collection');
      assert.deepEqual(plan.perspectives, ['technical', 'performance', 'security']);
      assert.equal(plan.milestones.length, 3);

      const techMilestone = plan.milestones.find((m) => m.perspective === 'technical');
      assert.ok(techMilestone);
      assert.ok(techMilestone.generatedQueries.length >= 3);
      assert.ok(techMilestone.generatedQueries.some((q) => q.includes('OR')));

      const perfMilestone = plan.milestones.find((m) => m.perspective === 'performance');
      assert.ok(perfMilestone);
      assert.ok(perfMilestone.generatedQueries.some((q) => q.toLowerCase().includes('benchmark') || q.toLowerCase().includes('p99')));

      const secMilestone = plan.milestones.find((m) => m.perspective === 'security');
      assert.ok(secMilestone);
      assert.ok(secMilestone.generatedQueries.some((q) => q.toLowerCase().includes('vulnerability') || q.toLowerCase().includes('cve')));
    });

    it('extracts core phrases and builds formatted Boolean queries', () => {
      const planner = new QueryPlanner();
      const phrases = planner.extractCorePhrases('Please tell me about electron safeStorage DPAPI encryption');
      assert.ok(phrases.includes('electron'));
      assert.ok(phrases.includes('safeStorage'));
      assert.ok(phrases.includes('DPAPI'));
      assert.ok(!phrases.includes('please'));
      assert.ok(!phrases.includes('tell'));

      const query = planner.buildBooleanQuery('electron safeStorage', {
        keywords: ['DPAPI', 'Windows encryption'],
        exclusions: ['legacy', 'deprecated'],
        siteFilter: 'github.com',
      });

      assert.ok(query.includes('"electron safeStorage"'));
      assert.ok(query.includes('(DPAPI OR "Windows encryption")'));
      assert.ok(query.includes('-legacy'));
      assert.ok(query.includes('-deprecated'));
      assert.ok(query.includes('site:github.com'));
    });

    it('supports LLM simulation stream and falls back gracefully to rule-based planning on failure', async () => {
      const mockModelProvider = {
        async *generateStream() {
          yield {
            type: 'content',
            text: JSON.stringify({
              milestones: [
                {
                  perspective: 'technical',
                  title: 'Deep Architecture Analysis',
                  focus: 'Kernel pipes and zero-copy buffers',
                  queries: ['"kernel pipes" zero-copy buffer', 'linux splice syscall'],
                },
              ],
            }),
          };
        },
      };

      const planner = new QueryPlanner({ modelProvider: mockModelProvider });
      const plan = await planner.planResearch('Zero copy kernel buffers');
      assert.equal(plan.milestones.length, 1);
      assert.equal(plan.milestones[0].title, 'Deep Architecture Analysis');

      // Failure fallback test
      const failingProvider = {
        async *generateStream() {
          throw new Error('API Rate Limit');
        },
      };
      const fallbackPlanner = new QueryPlanner({ modelProvider: failingProvider });
      const fallbackPlan = await fallbackPlanner.planResearch('Zero copy kernel buffers');
      assert.equal(fallbackPlan.milestones.length, 3, 'Must fall back to 3 rule-based milestones');
    });
  });

  describe('DeduplicationEngine: 3-Level Deduplication', () => {
    const dedup = new DeduplicationEngine();

    it('Level 1: normalizes canonical URLs, stripping UTM params, default ports, and trailing slashes', () => {
      const rawUrl1 = 'HTTPS://WWW.Example.com:443/docs/api/?utm_source=twitter&b=2&utm_medium=social&a=1#section-3';
      const canonical1 = dedup.normalizeUrl(rawUrl1);
      assert.equal(canonical1, 'https://example.com/docs/api?a=1&b=2');

      const rawUrl2 = 'http://github.com:80/anomalyco/opencode//';
      const canonical2 = dedup.normalizeUrl(rawUrl2);
      assert.equal(canonical2, 'http://github.com/anomalyco/opencode');

      const rawUrl3 = 'https://news.ycombinator.com/item?id=12345&fbclid=abcdef&ref=hackernews';
      const canonical3 = dedup.normalizeUrl(rawUrl3);
      assert.equal(canonical3, 'https://news.ycombinator.com/item?id=12345');
    });

    it('Level 2: hashes exact text with SHA-256 after Unicode and whitespace normalization', () => {
      const text1 = '  LENS Workstation   is an autonomous  agent harness. \n';
      const text2 = 'lens workstation is an autonomous agent harness.';
      const hash1 = dedup.hashTextSha256(text1);
      const hash2 = dedup.hashTextSha256(text2);

      assert.equal(hash1, hash2, 'Normalized whitespace and casing must produce identical SHA-256');

      const differentText = 'LENS Workstation is a desktop research engine.';
      const diffHash = dedup.hashTextSha256(differentText);
      assert.notEqual(hash1, diffHash, 'Different content must produce different SHA-256');
    });

    it('Level 3: computes 64-bit SimHash and identifies near-duplicates within Hamming distance <= 3', () => {
      const textA = 'Deep research engine uses BM25 and multi-hop retrieval for autonomous research and agentic execution.';
      const textB = 'Deep research engine uses BM25 and multi-hop retrieval for autonomous web research and agentic execution!';
      const textC = 'Quick chocolate cake recipe: stir flour, sugar, baking soda, cocoa powder, and milk together.';

      const simHashA = dedup.computeSimHash(textA);
      const simHashB = dedup.computeSimHash(textB);
      const simHashC = dedup.computeSimHash(textC);

      assert.equal(typeof simHashA, 'bigint');
      assert.equal(typeof simHashB, 'bigint');

      const distAB = dedup.hammingDistance(simHashA, simHashB);
      const distAC = dedup.hammingDistance(simHashA, simHashC);

      assert.ok(distAB <= 3, `Near duplicate distance must be <= 3 (got ${distAB})`);
      assert.ok(distAC > 10, `Completely different text distance must be high (got ${distAC})`);

      // Test with Arabic text (diacritics, tatweel, and punctuation variations)
      const arabicA = 'محرك البحث العميق لمنصة لنس يدعم استرجاع الوثائق وتصفية التكرار بشكل فوري وذاتي.';
      const arabicB = 'مُحَرِّكُ البَحْثِ العَمِيقِ لِمَنَصَّةِ لِنْسْ يَدْعَمُ اسْتِرْجَاعَ الوَثَائِقِ وَتَصْفِيَةَ التَّكْرَارِ بـشـكـل فـوري وذاتـي!';
      const arHashA = dedup.computeSimHash(arabicA);
      const arHashB = dedup.computeSimHash(arabicB);
      const arDist = dedup.hammingDistance(arHashA, arHashB);
      assert.ok(arDist <= 3, `Arabic near-duplicate distance must be <= 3 (got ${arDist})`);

      const arabicDiff = 'وصفة تحضير كعكة الشوكولاتة اللذيذة باستخدام الدقيق والسكر والكاكاو والخميرة والحليب.';
      const arHashDiff = dedup.computeSimHash(arabicDiff);
      const arDiffDist = dedup.hammingDistance(arHashA, arHashDiff);
      assert.ok(arDiffDist > 10, `Completely different Arabic text distance must be high (got ${arDiffDist})`);
    });

    it('executes full 3-level checkAndRegister pipeline correctly', () => {
      const engine = new DeduplicationEngine({ maxHammingDistance: 3 });

      // Document 1: Initial admission
      const doc1 = engine.checkAndRegister({
        url: 'https://example.com/blog/storm-architecture?utm_source=rss',
        content: 'Stanford STORM introduces perspective simulation for autonomous multi-hop research.',
      });
      assert.equal(doc1.duplicate, false);
      assert.equal(doc1.canonicalUrl, 'https://example.com/blog/storm-architecture');

      // Duplicate 1: Level 1 duplicate (same canonical URL, different UTM)
      const doc2 = engine.checkAndRegister({
        url: 'https://example.com/blog/storm-architecture?utm_source=twitter',
        content: 'Completely different content under the exact same URL.',
      });
      assert.equal(doc2.duplicate, true);
      assert.equal(doc2.level, 1);
      assert.equal(doc2.reason, 'canonical_url');

      // Duplicate 2: Level 2 duplicate (different URL, exact same content)
      const doc3 = engine.checkAndRegister({
        url: 'https://mirror.com/storm-clone',
        content: 'Stanford STORM introduces perspective simulation for autonomous multi-hop research.   ',
      });
      assert.equal(doc3.duplicate, true);
      assert.equal(doc3.level, 2);
      assert.equal(doc3.reason, 'exact_sha256');

      // Duplicate 3: Level 3 duplicate (different URL, minor edits / near duplicate)
      const doc4 = engine.checkAndRegister({
        url: 'https://syndicate.org/storm-repost',
        content: 'Stanford STORM introduces perspective simulation for autonomous multi-hop web research!',
      });
      assert.equal(doc4.duplicate, true);
      assert.equal(doc4.level, 3);
      assert.equal(doc4.reason, 'simhash_near_duplicate');
      assert.ok(doc4.distance <= 3);

      // Unique Document: admitted cleanly
      const doc5 = engine.checkAndRegister({
        url: 'https://arxiv.org/abs/2402.14207',
        content: 'In this paper, we study the theoretical convergence bounds of multi-agent reinforcement learning.',
      });
      assert.equal(doc5.duplicate, false);
    });
  });

  describe('Search Adapters & SearchPlane', () => {
    it('DuckDuckGoSearchAdapter parses mock HTML and extracts direct URLs and snippets', () => {
      const adapter = new DuckDuckGoSearchAdapter();
      const mockHtml = `
        <div class="result results_links results_links_deep web-result">
          <div class="result__body links_main links_deep">
            <h2 class="result__title">
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fcline%2Fcline&rut=1">Cline Autonomous Coding Agent</a>
            </h2>
            <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fcline%2Fcline&rut=1">
              Autonomous coding agent that uses tools to create and edit files in the workspace.
            </a>
          </div>
        </div>
      `;

      const results = adapter.parseHtml(mockHtml);
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Cline Autonomous Coding Agent');
      assert.equal(results[0].url, 'https://github.com/cline/cline');
      assert.ok(results[0].snippet.includes('Autonomous coding agent'));
      assert.equal(results[0].sourceEngine, 'duckduckgo');
    });

    it('ArXivSearchAdapter parses Atom XML and extracts metadata', () => {
      const adapter = new ArXivSearchAdapter();
      const mockXml = `
        <?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2402.14207v1</id>
            <title>STORM: Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking</title>
            <summary>We present STORM, an LLM system for writing comprehensive research articles.</summary>
            <published>2024-02-21T18:00:00Z</published>
            <author><name>Yuhuai Wu</name></author>
            <link title="pdf" href="http://arxiv.org/pdf/2402.14207v1" />
          </entry>
        </feed>
      `;

      const results = adapter.parseAtomXml(mockXml);
      assert.equal(results.length, 1);
      assert.ok(results[0].title.includes('STORM: Synthesis of Topic Outlines'));
      assert.equal(results[0].url, 'http://arxiv.org/abs/2402.14207v1');
      assert.equal(results[0].metadata.pdfUrl, 'http://arxiv.org/pdf/2402.14207v1');
      assert.deepEqual(results[0].metadata.authors, ['Yuhuai Wu']);
    });

    it('BraveSearchAdapter and TavilySearchAdapter require API keys when executed', async () => {
      const brave = new BraveSearchAdapter({ apiKey: '' });
      await assert.rejects(
        () => brave.search('test query'),
        /Brave Search API key is required/
      );

      const tavily = new TavilySearchAdapter({ apiKey: '' });
      await assert.rejects(
        () => tavily.search('test query'),
        /Tavily Search API key is required/
      );
    });

    it('SearchPlane orchestrates searches with bounded concurrency and auto-fallback to free adapters', async () => {
      const mockDdgAdapter = {
        name: 'duckduckgo',
        async search(query) {
          return [
            {
              url: `https://example.com/search?q=${encodeURIComponent(query)}`,
              title: `Result for ${query}`,
              snippet: `Summary text for ${query} with rich retrieval details.`,
              sourceEngine: 'duckduckgo',
            },
          ];
        },
      };

      const searchPlane = new SearchPlane({ concurrencyLimit: 2 });
      searchPlane.adapters.duckduckgo = mockDdgAdapter;
      searchPlane.adapters.brave = null; // No commercial key

      // 1. Single search with fallback to DuckDuckGo
      const singleResults = await searchPlane.search('autonomous coding agents', { engine: 'brave' });
      assert.ok(singleResults.length > 0);
      assert.equal(singleResults[0].sourceEngine, 'duckduckgo');

      // 2. Batch search across multiple queries with integrated 3-level deduplication
      const duplicateAdapter = {
        name: 'duckduckgo',
        async search(query) {
          return [
            {
              url: 'https://docs.lens.org/guide?utm_source=one',
              title: 'LENS Engine Guide',
              snippet: 'Official architecture and operational documentation for LENS.',
              sourceEngine: 'duckduckgo',
            },
            {
              url: 'https://docs.lens.org/guide?utm_source=two', // Canonical duplicate of above
              title: 'LENS Engine Guide Mirror',
              snippet: 'Official architecture and operational documentation for LENS.',
              sourceEngine: 'duckduckgo',
            },
            {
              url: 'https://docs.lens.org/api',
              title: 'LENS API Reference',
              snippet: 'Complete API reference for subagents and eventbus.',
              sourceEngine: 'duckduckgo',
            },
          ];
        },
      };

      searchPlane.adapters.duckduckgo = duplicateAdapter;
      const batchResults = await searchPlane.batchSearch(['query 1', 'query 2']);

      assert.equal(batchResults.length, 2, 'Must deduplicate redundant canonical URL results down to 2 unique items');
      assert.equal(batchResults[0].canonicalUrl, 'https://docs.lens.org/guide');
      assert.equal(batchResults[1].canonicalUrl, 'https://docs.lens.org/api');
    });
  });
});
