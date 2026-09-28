import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  GroundingAudit,
  extractDomain,
} from '../../engine/research/GroundingAudit.mjs';

import { DeepResearchOrchestrator } from '../../engine/research/DeepResearchOrchestrator.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// GroundingAudit Unit Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('GroundingAudit & Verified Evidence Synthesis (Ticket #30)', () => {
  let audit;

  beforeEach(() => {
    audit = new GroundingAudit();
  });

  describe('extractDomain', () => {
    it('extracts and cleans domain from standard URL', () => {
      assert.equal(extractDomain('https://www.example.com/path?foo=bar'), 'example.com');
      assert.equal(extractDomain('https://github.com/cline/cline'), 'github.com');
      assert.equal(extractDomain('http://docs.python.org/3/'), 'docs.python.org');
    });

    it('returns unknown for invalid or empty URL', () => {
      assert.equal(extractDomain(''), 'unknown');
      assert.equal(extractDomain(null), 'unknown');
      assert.equal(extractDomain('not-a-valid-url'), 'unknown');
    });
  });

  describe('allocateExcerpt and allocateExcerpts', () => {
    it('allocates immutable bracket and metadata for a single excerpt', () => {
      const excerpt = audit.allocateExcerpt(1, {
        sourceUrl: 'https://github.com/openai/codex',
        sourceTitle: 'OpenAI Codex Repository',
        text: 'The autonomous coding agent loop operates with tool calling capabilities.',
        relevanceScore: 0.92,
      });

      assert.equal(excerpt.index, 1);
      assert.equal(excerpt.bracket, '[1]');
      assert.equal(excerpt.sourceDomain, 'github.com');
      assert.equal(excerpt.sourceTitle, 'OpenAI Codex Repository');
      assert.equal(excerpt.text, 'The autonomous coding agent loop operates with tool calling capabilities.');
      assert.equal(excerpt.relevanceScore, 0.92);
    });

    it('allocates 1-based sequential brackets for batch excerpts', () => {
      const candidates = [
        { sourceUrl: 'https://docs.docker.com', text: 'Docker containers isolate processes.' },
        { sourceUrl: 'https://kubernetes.io', text: 'Kubernetes orchestrates container clusters.' },
      ];

      const excerpts = audit.allocateExcerpts(candidates, 'milestone-tech', 1);
      assert.equal(excerpts.length, 2);
      assert.equal(excerpts[0].index, 1);
      assert.equal(excerpts[0].bracket, '[1]');
      assert.equal(excerpts[0].milestoneId, 'milestone-tech');
      assert.equal(excerpts[1].index, 2);
      assert.equal(excerpts[1].bracket, '[2]');
      assert.equal(excerpts[1].sourceDomain, 'kubernetes.io');
    });
  });

  describe('extractCitations', () => {
    it('extracts all citation brackets from text', () => {
      const text = 'LENS integrates linkedom [1] and Okapi BM25 [2] with MMR diversity [1][3].';
      const result = audit.extractCitations(text);

      assert.deepEqual(result.indices, [1, 2, 1, 3]);
      assert.deepEqual(result.uniqueIndices, [1, 2, 3]);
      assert.equal(result.rawMatches.length, 4);
    });

    it('returns empty results when no citations present', () => {
      const text = 'Plain text without any brackets or citations.';
      const result = audit.extractCitations(text);

      assert.deepEqual(result.indices, []);
      assert.deepEqual(result.uniqueIndices, []);
      assert.equal(result.rawMatches.length, 0);
    });
  });

  describe('auditSynthesis (Zero-Hallucination Regex Audit)', () => {
    it('preserves valid citations and strips hallucinated citations', () => {
      const validExcerpts = [
        audit.allocateExcerpt(1, { sourceUrl: 'https://example.com/doc1', text: 'Valid doc 1' }),
        audit.allocateExcerpt(2, { sourceUrl: 'https://example.com/doc2', text: 'Valid doc 2' }),
      ];

      const synthesized = 'According to research [1], performance is high. Other claims [99] were unverified [404], while [2] confirms stability.';
      const result = audit.auditSynthesis(synthesized, validExcerpts);

      // Hallucinated [99] and [404] must be stripped!
      assert.ok(!result.sanitizedReportMarkdown.includes('[99]'), 'Should strip hallucinated [99]');
      assert.ok(!result.sanitizedReportMarkdown.includes('[404]'), 'Should strip hallucinated [404]');

      // Valid [1] and [2] must be preserved!
      assert.ok(result.sanitizedReportMarkdown.includes('[1]'), 'Should preserve valid [1]');
      assert.ok(result.sanitizedReportMarkdown.includes('[2]'), 'Should preserve valid [2]');

      assert.equal(result.totalCitationsFound, 4);
      assert.equal(result.validCitationsCount, 2);
      assert.equal(result.hallucinatedCitationsCount, 2);
      assert.deepEqual(result.validIndices, [1, 2]);
      assert.deepEqual(result.hallucinatedIndices, [99, 404]);
    });

    it('remaps hallucinated brackets if remapTable is provided', () => {
      const validExcerpts = [
        audit.allocateExcerpt(1, { sourceUrl: 'https://example.com/1', text: 'Doc 1' }),
      ];

      const synthesized = 'Claim referencing hallucinated index [99].';
      const result = audit.auditSynthesis(synthesized, validExcerpts, {
        remapTable: { 99: 1 },
      });

      assert.ok(result.sanitizedReportMarkdown.includes('[1]'), 'Should remap [99] to [1]');
      assert.ok(!result.sanitizedReportMarkdown.includes('[99]'));
    });
  });

  describe('detectContradictions', () => {
    it('detects latency metric contradiction between two distinct sources', () => {
      const excerpts = [
        audit.allocateExcerpt(1, {
          sourceUrl: 'https://vendor-official.com/benchmarks',
          text: 'The architecture achieves an ultra-low latency of 45ms P99 under test conditions.',
        }),
        audit.allocateExcerpt(2, {
          sourceUrl: 'https://independent-audit.org/report',
          text: 'Independent stress testing measured a latency of 140ms P99 under standard load.',
        }),
      ];

      const contradictions = audit.detectContradictions(excerpts);
      assert.ok(contradictions.length > 0, 'Should detect latency contradiction');
      assert.equal(contradictions[0].claims.length, 2);
      assert.equal(contradictions[0].claims[0].sourceIndex, 1);
      assert.equal(contradictions[0].claims[1].sourceIndex, 2);
      assert.ok(contradictions[0].explanation.includes('45ms') || contradictions[0].explanation.includes('140ms'));
    });

    it('detects licensing / open-source factual polarity contradiction', () => {
      const excerpts = [
        audit.allocateExcerpt(1, {
          sourceUrl: 'https://open-source-daily.com/article',
          text: 'The library is completely open-source under a permissive MIT license.',
        }),
        audit.allocateExcerpt(2, {
          sourceUrl: 'https://commercial-analyst.com/review',
          text: 'The enterprise edition is proprietary and closed-source commercial only.',
        }),
      ];

      const contradictions = audit.detectContradictions(excerpts);
      assert.ok(contradictions.length > 0, 'Should detect factual polarity contradiction');
      assert.ok(contradictions[0].topicOrMetric.includes('Licensing'));
    });

    it('ignores excerpts from the same domain/URL', () => {
      const excerpts = [
        audit.allocateExcerpt(1, {
          sourceUrl: 'https://same-site.com/p1',
          text: 'Measured 50ms latency.',
        }),
        audit.allocateExcerpt(2, {
          sourceUrl: 'https://same-site.com/p1',
          text: 'Measured 200ms latency on a different test.',
        }),
      ];

      const contradictions = audit.detectContradictions(excerpts);
      assert.equal(contradictions.length, 0, 'Should not flag same URL as contradiction');
    });
  });

  describe('formatContradictionCallouts', () => {
    it('formats markdown warning callout blocks', () => {
      const contradictions = [
        {
          topicOrMetric: 'Benchmark Discrepancy: LATENCY',
          claims: [
            { sourceIndex: 1, assertion: '45ms (official docs)', domain: 'vendor.com' },
            { sourceIndex: 2, assertion: '140ms (third-party audit)', domain: 'audit.org' },
          ],
          explanation: 'Source [1] reports 45ms while Source [2] reports 140ms.',
        },
      ];

      const formatted = audit.formatContradictionCallouts(contradictions);
      assert.ok(formatted.includes('> [!WARNING] Contradiction Detected: Benchmark Discrepancy: LATENCY'));
      assert.ok(formatted.includes('> - Source [1] (vendor.com): 45ms (official docs)'));
      assert.ok(formatted.includes('> - Source [2] (audit.org): 140ms (third-party audit)'));
      assert.ok(formatted.includes('> *Source [1] reports 45ms while Source [2] reports 140ms.*'));
    });

    it('returns empty string when no contradictions', () => {
      assert.equal(audit.formatContradictionCallouts([]), '');
    });
  });

  describe('generateVerifiedSourceShelf', () => {
    it('renders a Markdown table with citations, domain, link, and excerpt', () => {
      const excerpts = [
        audit.allocateExcerpt(1, {
          sourceUrl: 'https://github.com/cline/cline',
          sourceTitle: 'Cline Agent Core',
          text: 'Autonomous coding agent loop decoupled from VS Code.',
        }),
        audit.allocateExcerpt(2, {
          sourceUrl: 'https://api.kilo.ai',
          sourceTitle: 'Kilo Gateway API',
          text: 'Unified model routing with streaming tools.',
        }),
      ];

      const shelf = audit.generateVerifiedSourceShelf(excerpts, [1, 2]);
      assert.ok(shelf.includes('## Verified Source Shelf'));
      assert.ok(shelf.includes('| [1] | `github.com` | [Cline Agent Core](https://github.com/cline/cline) | "Autonomous coding agent loop decoupled from VS Code." |'));
      assert.ok(shelf.includes('| [2] | `api.kilo.ai` | [Kilo Gateway API](https://api.kilo.ai) | "Unified model routing with streaming tools." |'));
    });

    it('filters shelf to only used citation indices when provided', () => {
      const excerpts = [
        audit.allocateExcerpt(1, { sourceUrl: 'https://site1.com', text: 'Used excerpt' }),
        audit.allocateExcerpt(2, { sourceUrl: 'https://site2.com', text: 'Unused excerpt' }),
      ];

      const shelf = audit.generateVerifiedSourceShelf(excerpts, [1]);
      assert.ok(shelf.includes('[1]'));
      assert.ok(!shelf.includes('[2]'));
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DeepResearchOrchestrator Integration Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('DeepResearchOrchestrator 5-Stage Pipeline', () => {
  it('runs complete 5-stage research pipeline and outputs verified report with audit', async () => {
    // Mock Search Plane
    const mockSearchPlane = {
      search: async (query) => {
        return [
          {
            url: `https://techdocs.example.com/spec-${query.slice(0, 10).replace(/[^a-z0-9]/gi, '_')}`,
            title: `Technical Spec for ${query.slice(0, 20)}`,
            snippet: `Autonomous research and retrieval architecture with 45ms P99 latency. High throughput performance.`,
            sourceEngine: 'duckduckgo',
          },
          {
            url: `https://benchmarks.example.org/eval-${query.slice(0, 10).replace(/[^a-z0-9]/gi, '_')}`,
            title: `Independent Benchmark for ${query.slice(0, 20)}`,
            snippet: `Stress test reveals 140ms P99 latency and memory footprint analysis.`,
            sourceEngine: 'searxng',
          },
        ];
      },
    };

    // Mock Scraping Ladder
    const mockScrapingLadder = {
      extract: async (url) => {
        return {
          success: true,
          tier: 1,
          url,
          markdown: `Full extracted technical content for ${url}.\n\nDetailed breakdown of deep research algorithms, lexical indexing, and multi-hop query planning. Includes 45ms P99 benchmark latency measurements.`,
          charCount: 250,
          truncated: false,
        };
      },
    };

    const progressEvents = [];
    const orchestrator = new DeepResearchOrchestrator({
      searchPlane: mockSearchPlane,
      scrapingLadder: mockScrapingLadder,
      maxUrlsPerMilestone: 2,
      maxExcerptsPerMilestone: 2,
      onProgress: (evt) => progressEvents.push(evt.stage),
    });

    const report = await orchestrator.run('Deep Research Autonomous Agent Loops', {
      useModel: false, // Use deterministic synthesis
      perspectives: ['technical', 'performance'],
    });

    // Assertions on complete report structure
    assert.ok(report, 'Report should be returned');
    assert.equal(report.topic, 'Deep Research Autonomous Agent Loops');
    assert.ok(report.plan, 'Should have research plan');
    assert.equal(report.plan.milestones.length, 2);
    assert.ok(report.allExcerpts.length > 0, 'Should have allocated excerpts');
    assert.ok(report.audit, 'Should have grounding audit record');
    assert.ok(report.reportMarkdown, 'Should have markdown report');
    assert.ok(report.reportMarkdown.includes('## Verified Source Shelf'), 'Should include source shelf');

    // Verify stats
    assert.ok(report.stats.totalQueries > 0);
    assert.ok(report.stats.urlsRetrieved > 0);
    assert.ok(report.stats.urlsScraped > 0);
    assert.equal(report.stats.hallucinatedCitationsCount, 0, 'Zero hallucinated citations in deterministic synthesis');

    // Verify progress events emitted
    assert.ok(progressEvents.includes('stage_1_planning_started'));
    assert.ok(progressEvents.includes('stage_1_planning_completed'));
    assert.ok(progressEvents.includes('milestone_started'));
    assert.ok(progressEvents.includes('stage_5_synthesis_started'));
    assert.ok(progressEvents.includes('research_completed'));
  });

  it('correctly audits LLM synthesis and strips hallucinated citations', async () => {
    // Mock Search Plane
    const mockSearchPlane = {
      search: async () => [
        {
          url: 'https://docs.example.com/guide',
          title: 'Guide Title',
          snippet: 'Grounded passage about agentic loops.',
          sourceEngine: 'duckduckgo',
        },
      ],
    };

    // Mock Model Provider that hallucinates [999] citation
    const mockModelProvider = {
      generateStream: async function* () {
        yield {
          type: 'content',
          text: 'Executive Summary:\nAgentic loops require tool verification [1]. Furthermore, ungrounded claim from non-existent evidence [999] was mentioned.',
        };
      },
    };

    // Mock Scraping Ladder
    const mockScrapingLadder = {
      extract: async (url) => ({
        success: true,
        tier: 1,
        url,
        markdown: 'Technical architecture and implementation of agentic loop verification with tool verification.',
        charCount: 95,
        truncated: false,
      }),
    };

    const orchestrator = new DeepResearchOrchestrator({
      searchPlane: mockSearchPlane,
      scrapingLadder: mockScrapingLadder,
      modelProvider: mockModelProvider,
      maxUrlsPerMilestone: 1,
      maxExcerptsPerMilestone: 1,
    });

    const report = await orchestrator.run('Agentic Loop Verification', {
      perspectives: ['technical'],
      useModel: true,
    });

    // The hallucinated [999] citation MUST be stripped in reportMarkdown!
    assert.ok(!report.reportMarkdown.includes('[999]'), 'Hallucinated [999] must be stripped from final report');
    assert.ok(report.reportMarkdown.includes('[1]'), 'Valid [1] citation must be kept');
    assert.equal(report.audit.hallucinatedCitationsCount, 1);
    assert.deepEqual(report.audit.hallucinatedIndices, [999]);
  });
});
