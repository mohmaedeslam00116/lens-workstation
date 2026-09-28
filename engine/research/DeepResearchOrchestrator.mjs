import { QueryPlanner } from './QueryPlanner.mjs';
import { SearchPlane } from './search/SearchPlane.mjs';
import { DeduplicationEngine } from './DeduplicationEngine.mjs';
import { ScrapingLadder } from './ScrapingLadder.mjs';
import { BilingualBM25 } from './BilingualBM25.mjs';
import { GroundingAudit } from './GroundingAudit.mjs';

/**
 * DeepResearchOrchestrator
 *
 * Coordinates the full 5-stage autonomous deep research pipeline:
 * Stage 1: Query Planning & Perspective Simulation (QueryPlanner)
 * Stage 2: Multi-Source Retrieval & URL Deduplication (SearchPlane + DeduplicationEngine L1)
 * Stage 3: SSRF-Safe Content Extraction & Content Deduplication (ScrapingLadder + DeduplicationEngine L2/L3)
 * Stage 4: Bilingual Lexical/Semantic Indexing & MMR Ranking (BilingualBM25 + GroundingAudit Excerpt Allocation)
 * Stage 5: Stratified Evidence Synthesis & Zero-Hallucination Grounding Audit (LLM / Fallback + GroundingAudit)
 */
export class DeepResearchOrchestrator {
  constructor(options = {}) {
    this.modelProvider = options.modelProvider || null;
    this.queryPlanner = options.queryPlanner || new QueryPlanner({ modelProvider: this.modelProvider });
    this.searchPlane = options.searchPlane || new SearchPlane();
    this.deduplicator = options.deduplicator || new DeduplicationEngine();
    this.scrapingLadder = options.scrapingLadder || new ScrapingLadder();
    this.bm25Index = options.bm25Index || new BilingualBM25();
    this.groundingAudit = options.groundingAudit || new GroundingAudit();

    this.maxUrlsPerMilestone = options.maxUrlsPerMilestone ?? 4;
    this.maxExcerptsPerMilestone = options.maxExcerptsPerMilestone ?? 3;
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Helper to emit progress events
   */
  _emit(stage, data = {}) {
    try {
      this.onProgress({
        stage,
        timestamp: Date.now(),
        ...data,
      });
    } catch {
      // Ignore progress listener errors
    }
  }

  /**
   * Execute the full 5-stage deep research pipeline on a topic
   *
   * @param {string} topic - The user's research inquiry
   * @param {object} options - Execution options (perspectives, topK, etc.)
   * @returns {Promise<object>} Complete research report with verified evidence and grounding audit
   */
  async run(topic, options = {}) {
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      throw new Error('Research topic must be a non-empty string');
    }

    const startTime = Date.now();
    let totalQueries = 0;
    let urlsRetrieved = 0;
    let urlsScraped = 0;
    let duplicatesFiltered = 0;

    // Reset components for fresh run
    this.deduplicator.clear();
    this.bm25Index.clear();

    // ─────────────────────────────────────────────────────────────
    // Stage 1: Query Planning & Perspective Simulation
    // ─────────────────────────────────────────────────────────────
    this._emit('stage_1_planning_started', { topic });
    const plan = await this.queryPlanner.planResearch(topic, {
      perspectives: options.perspectives,
      useModel: options.useModel !== false,
    });
    this._emit('stage_1_planning_completed', { plan });

    // Store for scraped document passages across all milestones
    const scrapedDocuments = [];
    const allAllocatedExcerpts = [];
    let excerptCounter = 1;

    // Process each milestone
    for (let mIdx = 0; mIdx < plan.milestones.length; mIdx++) {
      const milestone = plan.milestones[mIdx];
      milestone.status = 'retrieving';
      this._emit('milestone_started', { milestone, index: mIdx });

      // ─────────────────────────────────────────────────────────────
      // Stage 2: Multi-Source Retrieval & Deduplication (Level 1 & 2)
      // ─────────────────────────────────────────────────────────────
      const milestoneUrlsToScrape = [];
      const queries = milestone.generatedQueries || [];

      for (const query of queries) {
        totalQueries++;
        this._emit('query_executing', { query, milestoneId: milestone.id });

        let results = [];
        try {
          results = await this.searchPlane.search(query, { maxResults: 5 });
        } catch (err) {
          this._emit('query_failed', { query, error: err.message });
          continue;
        }

        urlsRetrieved += results.length;

        for (const item of results) {
          if (!item.url) continue;

          // Level 1 Deduplication (Canonical URL)
          const dedupCheck = this.deduplicator.checkAndRegister({
            url: item.url,
            title: item.title,
            content: item.snippet,
          });

          if (dedupCheck.duplicate) {
            duplicatesFiltered++;
          } else {
            milestoneUrlsToScrape.push({
              url: item.url,
              title: item.title,
              snippet: item.snippet,
              sourceEngine: item.sourceEngine || 'web',
            });

            if (milestoneUrlsToScrape.length >= this.maxUrlsPerMilestone) {
              break;
            }
          }
        }

        if (milestoneUrlsToScrape.length >= this.maxUrlsPerMilestone) {
          break;
        }
      }

      this._emit('milestone_retrieval_completed', {
        milestoneId: milestone.id,
        urlsFound: milestoneUrlsToScrape.length,
      });

      // ─────────────────────────────────────────────────────────────
      // Stage 3: SSRF-Safe Content Extraction & Content Deduplication
      // ─────────────────────────────────────────────────────────────
      milestone.status = 'synthesizing';
      const milestoneScrapedPassages = [];

      for (const target of milestoneUrlsToScrape) {
        this._emit('url_scraping_started', { url: target.url });

        let extracted;
        try {
          extracted = await this.scrapingLadder.extract(target.url);
        } catch (err) {
          this._emit('url_scraping_failed', { url: target.url, error: err.message });
          continue;
        }

        if (extracted && extracted.success && extracted.markdown) {
          urlsScraped++;

          // Level 2 (SHA256) and Level 3 (SimHash) check on extracted markdown
          const contentDedup = this.deduplicator.checkAndRegister({
            url: target.url,
            content: extracted.markdown,
            title: target.title,
          });

          // Even if content is near-duplicate of another page, we register it
          const docId = `doc-${mIdx}-${milestoneScrapedPassages.length + 1}`;
          const docRecord = {
            docId,
            url: target.url,
            title: target.title,
            markdown: extracted.markdown,
            milestoneId: milestone.id,
          };

          scrapedDocuments.push(docRecord);
          milestoneScrapedPassages.push(docRecord);

          // Index full content into BilingualBM25
          this.bm25Index.addDocument(docId, `${target.title}\n\n${extracted.markdown}`);
          this._emit('url_scraping_completed', { url: target.url, docId, charCount: extracted.charCount });
        } else if (target.snippet && target.snippet.length > 30) {
          // Fallback to search snippet if scraping skipped/failed
          const docId = `snippet-${mIdx}-${milestoneScrapedPassages.length + 1}`;
          const snippetRecord = {
            docId,
            url: target.url,
            title: target.title,
            markdown: target.snippet,
            milestoneId: milestone.id,
          };

          scrapedDocuments.push(snippetRecord);
          milestoneScrapedPassages.push(snippetRecord);
          this.bm25Index.addDocument(docId, `${target.title}\n\n${target.snippet}`);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Stage 4: Lexical/Semantic Indexing & MMR Ranking
      // ─────────────────────────────────────────────────────────────
      // Query BM25 index with milestone focus and queries to extract top grounded passages
      const searchQuery = `${milestone.title} ${milestone.focus}`;
      const rankedResults = this.bm25Index.hybridSearch(searchQuery, this.maxExcerptsPerMilestone, {
        diversify: true,
      });

      const candidateExcerpts = [];
      for (const res of rankedResults) {
        const doc = scrapedDocuments.find((d) => d.docId === res.docId);
        if (doc) {
          // Break document into a relevant excerpt passage (around 200-400 chars)
          const excerptSnippet = this._extractRelevantSnippet(doc.markdown, searchQuery);
          candidateExcerpts.push({
            chunkId: `${doc.docId}-chunk`,
            milestoneId: milestone.id,
            text: excerptSnippet,
            sourceUrl: doc.url,
            sourceTitle: doc.title,
            relevanceScore: res.score,
          });
        }
      }

      // Fallback: If BM25 found no direct keyword overlap, use available scraped passages for milestone
      if (candidateExcerpts.length === 0 && milestoneScrapedPassages.length > 0) {
        for (const doc of milestoneScrapedPassages.slice(0, this.maxExcerptsPerMilestone)) {
          const excerptSnippet = this._extractRelevantSnippet(doc.markdown, searchQuery);
          candidateExcerpts.push({
            chunkId: `${doc.docId}-chunk`,
            milestoneId: milestone.id,
            text: excerptSnippet,
            sourceUrl: doc.url,
            sourceTitle: doc.title,
            relevanceScore: 0.5,
          });
        }
      }

      // Pre-allocate immutable bracket identifiers [1], [2], ...
      const allocatedForMilestone = this.groundingAudit.allocateExcerpts(
        candidateExcerpts,
        milestone.id,
        excerptCounter
      );
      excerptCounter += allocatedForMilestone.length;

      allAllocatedExcerpts.push(...allocatedForMilestone);
      milestone.status = 'completed';
      this._emit('milestone_completed', {
        milestoneId: milestone.id,
        excerptsCount: allocatedForMilestone.length,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Stage 5: Stratified Evidence Synthesis & Grounding Audit
    // ─────────────────────────────────────────────────────────────
    this._emit('stage_5_synthesis_started', { totalExcerpts: allAllocatedExcerpts.length });

    // Generate synthesis with LLM or deterministic fallback
    const rawSynthesisMarkdown = await this._synthesizeReport(topic, plan, allAllocatedExcerpts, options);

    // Run Zero-Hallucination Regex Audit
    const auditRecord = this.groundingAudit.auditSynthesis(rawSynthesisMarkdown, allAllocatedExcerpts);

    // Format any detected contradictions
    const contradictionCallouts = this.groundingAudit.formatContradictionCallouts(
      auditRecord.contradictionsDetected
    );

    // Generate verified source shelf
    const sourceShelf = this.groundingAudit.generateVerifiedSourceShelf(
      allAllocatedExcerpts,
      auditRecord.validIndices
    );

    // Assemble finalized report markdown
    const sections = [];
    if (contradictionCallouts) {
      sections.push(contradictionCallouts);
    }
    sections.push(auditRecord.sanitizedReportMarkdown);
    if (sourceShelf) {
      sections.push('\n---\n\n' + sourceShelf);
    }

    const finalizedReportMarkdown = sections.join('\n\n');

    const durationMs = Date.now() - startTime;
    this._emit('research_completed', {
      topic,
      durationMs,
      validCitations: auditRecord.validCitationsCount,
      hallucinatedStripped: auditRecord.hallucinatedCitationsCount,
    });

    return {
      topic,
      plan,
      milestones: plan.milestones,
      allExcerpts: allAllocatedExcerpts,
      audit: auditRecord,
      reportMarkdown: finalizedReportMarkdown,
      contradictions: auditRecord.contradictionsDetected,
      stats: {
        durationMs,
        totalQueries,
        urlsRetrieved,
        urlsScraped,
        duplicatesFiltered,
        excerptsIndexed: allAllocatedExcerpts.length,
        totalCitationsFound: auditRecord.totalCitationsFound,
        validCitationsCount: auditRecord.validCitationsCount,
        hallucinatedCitationsCount: auditRecord.hallucinatedCitationsCount,
      },
    };
  }

  /**
   * Synthesize research report using LLM if available, otherwise deterministic structured synthesis
   */
  async _synthesizeReport(topic, plan, excerpts, options = {}) {
    // If model provider is available, formulate synthesis prompt
    if (this.modelProvider && options.useModel !== false) {
      try {
        const evidencePrompt = excerpts
          .map((e) => `Evidence ${e.bracket} (Source: ${e.sourceTitle} - ${e.sourceDomain}):\n"${e.text}"`)
          .join('\n\n');

        const systemPrompt = `You are LENS Deep Research Synthesizer.
Synthesize an authoritative, technical research report on: "${topic}".

STRICT CITATION RULES:
1. You must substantiate factual claims using EXACT citation brackets [1], [2], etc., matching the provided Evidence passages.
2. DO NOT hallucinate citation numbers that are not in the evidence list. Only use indices: ${excerpts.map((e) => `[${e.index}]`).join(', ')}.
3. Structure your response with an Executive Summary, followed by detailed sections corresponding to the planned milestones:
${plan.milestones.map((m) => `- ${m.title}`).join('\n')}
4. Maintain a neutral, precise, and analytical tone.`;

        const userPrompt = `Grounded Evidence Passages:\n${evidencePrompt}\n\nPlease generate the comprehensive research report now.`;

        let rawResponse = '';
        const stream = this.modelProvider.generateStream
          ? this.modelProvider.generateStream([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ])
          : null;

        if (stream) {
          for await (const chunk of stream) {
            if (chunk.type === 'content' || chunk.text) {
              rawResponse += chunk.text || chunk.content || '';
            }
          }

          if (rawResponse.trim().length > 100) {
            return rawResponse.trim();
          }
        }
      } catch {
        // Fallback to deterministic synthesis on provider error
      }
    }

    // Deterministic High-Integrity Fallback Synthesis
    return this._generateDeterministicSynthesis(topic, plan, excerpts);
  }

  /**
   * Deterministic structured synthesis generator
   */
  _generateDeterministicSynthesis(topic, plan, excerpts) {
    const lines = [
      `# Research Report: ${topic}`,
      '',
      `*Generated by LENS Autonomous Research Workspace*`,
      '',
      '## Executive Summary',
      `This report synthesizes empirical findings across multiple analytical perspectives on **${topic}**. Evidence was gathered and verified across ${excerpts.length} primary source passages.`,
      '',
    ];

    // Build milestone sections
    for (const milestone of plan.milestones) {
      lines.push(`## ${milestone.title}`);
      lines.push(`*Focus: ${milestone.focus}*`);
      lines.push('');

      const milestoneExcerpts = excerpts.filter((e) => e.milestoneId === milestone.id);

      if (milestoneExcerpts.length > 0) {
        for (const ex of milestoneExcerpts) {
          lines.push(`According to **${ex.sourceTitle}** (${ex.sourceDomain}) ${ex.bracket}:`);
          lines.push(`> "${ex.text}"`);
          lines.push('');
        }
      } else {
        lines.push('No direct evidence was retrieved for this perspective.');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract most relevant snippet around query terms
   */
  _extractRelevantSnippet(markdown, query, maxChars = 320) {
    if (!markdown) return '';
    const clean = markdown.replace(/\[\.\.\.truncated\]/g, '').trim();
    if (clean.length <= maxChars) return clean;

    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Look for first occurrence of any query word
    let bestPos = -1;
    for (const w of queryWords) {
      const pos = clean.toLowerCase().indexOf(w);
      if (pos >= 0) {
        bestPos = pos;
        break;
      }
    }

    if (bestPos >= 0) {
      const start = Math.max(0, bestPos - 60);
      const end = Math.min(clean.length, start + maxChars);
      let snippet = clean.slice(start, end).trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < clean.length) snippet = snippet + '...';
      return snippet;
    }

    // Default to first chunk
    return clean.slice(0, maxChars).trim() + '...';
  }
}
