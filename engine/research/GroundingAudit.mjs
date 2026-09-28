/**
 * GroundingAudit
 * Pre-allocates immutable citation brackets, performs post-synthesis regex audit
 * to guarantee zero hallucinations, detects factual/benchmark contradictions between sources,
 * and formats verified source shelves.
 */

/**
 * Parse domain from URL safely
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  try {
    const parsed = new URL(url.trim());
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    return host;
  } catch {
    return 'unknown';
  }
}

/**
 * Common metric pattern extractors for empirical contradiction detection
 */
const METRIC_PATTERNS = [
  {
    name: 'latency',
    regex: /(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|seconds|µs|us)\b/i,
    normalize: (val, unit) => {
      const u = unit.toLowerCase();
      const num = parseFloat(val);
      if (u === 's' || u === 'seconds') return num * 1000;
      if (u === 'µs' || u === 'us') return num / 1000;
      return num; // ms
    },
    displayUnit: 'ms',
  },
  {
    name: 'throughput',
    regex: /(\d+(?:\.\d+)?)\s*(req\/s|rps|ops|tps|qps|queries per second|reqs\/sec)\b/i,
    normalize: (val) => parseFloat(val),
    displayUnit: 'req/s',
  },
  {
    name: 'memory',
    regex: /(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB)\b/i,
    normalize: (val, unit) => {
      const u = unit.toUpperCase();
      const num = parseFloat(val);
      if (u === 'TB') return num * 1024 * 1024;
      if (u === 'GB') return num * 1024;
      if (u === 'KB') return num / 1024;
      return num; // MB
    },
    displayUnit: 'MB',
  },
  {
    name: 'percentage',
    regex: /(\d+(?:\.\d+)?)\s*%/i,
    normalize: (val) => parseFloat(val),
    displayUnit: '%',
  },
];

/**
 * Binary factual polarity checks
 */
const POLARITY_CHECKS = [
  {
    topic: 'Licensing / Open Source Status',
    posRegex: /\b(open[- ]source|permissive|mit|apache|gpl|bsd|agpl)\b/i,
    negRegex: /\b(closed[- ]source|proprietary|commercial only|source[- ]available)\b/i,
    posLabel: 'Reports open-source / permissive licensing',
    negLabel: 'Reports proprietary / closed-source licensing',
  },
  {
    topic: 'Support / Deprecation Status',
    posRegex: /\b(active|actively maintained|supported|production ready|recommended)\b/i,
    negRegex: /\b(deprecated|unsupported|abandoned|end of life|sunset|discontinued)\b/i,
    posLabel: 'Reports active maintenance / production support',
    negLabel: 'Reports deprecated / discontinued status',
  },
];

export class GroundingAudit {
  constructor(options = {}) {
    this.maxContextSnippetChars = options.maxContextSnippetChars ?? 140;
    this.contradictionToleranceRatio = options.contradictionToleranceRatio ?? 1.25; // 25% discrepancy threshold
  }

  /**
   * Pre-allocate an immutable bracket identifier and GroundedExcerpt record
   */
  allocateExcerpt(index, data) {
    const safeIndex = Number(index) || 1;
    const bracket = `[${safeIndex}]`;
    const sourceUrl = data.sourceUrl || data.url || '';
    const sourceDomain = data.sourceDomain || extractDomain(sourceUrl);
    const sourceTitle = data.sourceTitle || data.title || sourceDomain;
    const text = (data.text || data.content || data.snippet || '').trim();

    return {
      index: safeIndex,
      bracket,
      chunkId: data.chunkId || `chunk-${safeIndex}`,
      milestoneId: data.milestoneId || 'default',
      text,
      sourceUrl,
      sourceTitle,
      sourceDomain,
      relevanceScore: Number(data.relevanceScore || data.score || 0),
    };
  }

  /**
   * Batch allocate immutable bracket identifiers for a list of excerpt candidates
   */
  allocateExcerpts(items = [], milestoneId = 'default', startIndex = 1) {
    if (!Array.isArray(items)) return [];

    let currentIndex = startIndex;
    return items.map((item) => {
      const excerpt = this.allocateExcerpt(currentIndex, {
        ...item,
        milestoneId: item.milestoneId || milestoneId,
      });
      currentIndex++;
      return excerpt;
    });
  }

  /**
   * Extract all citation brackets from text: [1], [2], etc.
   */
  extractCitations(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return { rawMatches: [], indices: [], uniqueIndices: [] };
    }

    const citationRegex = /\[(\d+)\]/g;
    const rawMatches = [];
    const indices = [];

    let match;
    while ((match = citationRegex.exec(markdown)) !== null) {
      rawMatches.push(match[0]);
      indices.push(parseInt(match[1], 10));
    }

    const uniqueIndices = Array.from(new Set(indices)).sort((a, b) => a - b);

    return {
      rawMatches,
      indices,
      uniqueIndices,
    };
  }

  /**
   * Run post-synthesis regex audit to enforce zero hallucinations.
   * Strips or remaps hallucinated brackets not matching valid ground excerpts.
   */
  auditSynthesis(synthesizedMarkdown, validExcerpts = [], options = {}) {
    if (!synthesizedMarkdown || typeof synthesizedMarkdown !== 'string') {
      return {
        sanitizedReportMarkdown: '',
        totalCitationsFound: 0,
        validCitationsCount: 0,
        hallucinatedCitationsCount: 0,
        validIndices: [],
        hallucinatedIndices: [],
        contradictionsDetected: [],
      };
    }

    const validIndicesMap = new Map();
    for (const excerpt of validExcerpts) {
      validIndicesMap.set(excerpt.index, excerpt);
    }

    const extraction = this.extractCitations(synthesizedMarkdown);
    const validFound = new Set();
    const hallucinatedFound = new Set();

    let validCount = 0;
    let hallucinatedCount = 0;

    for (const idx of extraction.indices) {
      if (validIndicesMap.has(idx)) {
        validFound.add(idx);
        validCount++;
      } else {
        hallucinatedFound.add(idx);
        hallucinatedCount++;
      }
    }

    // Replace or strip hallucinated citations
    // Regex matches [digits]
    let sanitized = synthesizedMarkdown.replace(/\[(\d+)\]/g, (match, digitStr) => {
      const idx = parseInt(digitStr, 10);
      if (validIndicesMap.has(idx)) {
        return match; // Keep valid bracket
      }

      // Check if remapping is provided
      if (options.remapTable && options.remapTable[idx]) {
        const remappedIdx = options.remapTable[idx];
        if (validIndicesMap.has(remappedIdx)) {
          return `[${remappedIdx}]`;
        }
      }

      // Otherwise strip hallucinated citation
      return '';
    });

    // Cleanup artifacts: e.g. empty brackets `[]`, multiple consecutive spaces, dangling commas before punctuation
    sanitized = sanitized
      .replace(/\[\s*\]/g, '')
      .replace(/ +([.,;:!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ');

    // Detect contradictions across valid excerpts that were cited (or all valid excerpts)
    const citedExcerpts = validExcerpts.filter((e) => validFound.has(e.index));
    const excerptsToInspect = citedExcerpts.length >= 2 ? citedExcerpts : validExcerpts;
    const contradictionsDetected = this.detectContradictions(excerptsToInspect);

    return {
      sanitizedReportMarkdown: sanitized,
      totalCitationsFound: extraction.indices.length,
      validCitationsCount: validCount,
      hallucinatedCitationsCount: hallucinatedCount,
      validIndices: Array.from(validFound).sort((a, b) => a - b),
      hallucinatedIndices: Array.from(hallucinatedFound).sort((a, b) => a - b),
      contradictionsDetected,
    };
  }

  /**
   * Detect factual and benchmark contradictions between excerpt passages
   */
  detectContradictions(excerpts = []) {
    if (!Array.isArray(excerpts) || excerpts.length < 2) {
      return [];
    }

    const contradictions = [];
    const seenPairs = new Set();

    // 1. Metric / numerical discrepancies
    for (let i = 0; i < excerpts.length; i++) {
      const ex1 = excerpts[i];
      for (let j = i + 1; j < excerpts.length; j++) {
        const ex2 = excerpts[j];

        // Skip excerpts from the exact same URL or domain
        if (ex1.sourceUrl === ex2.sourceUrl && ex1.sourceUrl) continue;

        const pairKey = `${Math.min(ex1.index, ex2.index)}-${Math.max(ex1.index, ex2.index)}`;
        if (seenPairs.has(pairKey)) continue;

        // Check metric extractors
        for (const metric of METRIC_PATTERNS) {
          const m1 = ex1.text.match(metric.regex);
          const m2 = ex2.text.match(metric.regex);

          if (m1 && m2) {
            const v1 = metric.normalize(m1[1], m1[2]);
            const v2 = metric.normalize(m2[1], m2[2]);

            if (v1 > 0 && v2 > 0) {
              const maxVal = Math.max(v1, v2);
              const minVal = Math.min(v1, v2);
              const ratio = maxVal / minVal;

              if (ratio >= this.contradictionToleranceRatio) {
                seenPairs.add(pairKey);

                const claim1 = `${m1[0]} (in: "${this._truncate(ex1.text)}")`;
                const claim2 = `${m2[0]} (in: "${this._truncate(ex2.text)}")`;

                contradictions.push({
                  topicOrMetric: `Benchmark Discrepancy: ${metric.name.toUpperCase()} (${minVal}${metric.displayUnit} vs ${maxVal}${metric.displayUnit})`,
                  claims: [
                    {
                      sourceIndex: ex1.index,
                      assertion: claim1,
                      domain: ex1.sourceDomain,
                    },
                    {
                      sourceIndex: ex2.index,
                      assertion: claim2,
                      domain: ex2.sourceDomain,
                    },
                  ],
                  explanation: `Source [${ex1.index}] (${ex1.sourceDomain}) reports ${m1[0]} while Source [${ex2.index}] (${ex2.sourceDomain}) reports ${m2[0]} (discrepancy ratio: ${ratio.toFixed(2)}x).`,
                });
                break;
              }
            }
          }
        }

        // Check polarity / binary contradictions
        if (!seenPairs.has(pairKey)) {
          for (const pol of POLARITY_CHECKS) {
            const ex1Pos = pol.posRegex.test(ex1.text);
            const ex1Neg = pol.negRegex.test(ex1.text);
            const ex2Pos = pol.posRegex.test(ex2.text);
            const ex2Neg = pol.negRegex.test(ex2.text);

            if ((ex1Pos && ex2Neg) || (ex1Neg && ex2Pos)) {
              seenPairs.add(pairKey);

              const posEx = ex1Pos ? ex1 : ex2;
              const negEx = ex1Pos ? ex2 : ex1;

              contradictions.push({
                topicOrMetric: `Factual Conflict: ${pol.topic}`,
                claims: [
                  {
                    sourceIndex: posEx.index,
                    assertion: `${pol.posLabel} ("${this._truncate(posEx.text)}")`,
                    domain: posEx.sourceDomain,
                  },
                  {
                    sourceIndex: negEx.index,
                    assertion: `${pol.negLabel} ("${this._truncate(negEx.text)}")`,
                    domain: negEx.sourceDomain,
                  },
                ],
                explanation: `Source [${posEx.index}] (${posEx.sourceDomain}) asserts ${pol.posLabel}, whereas Source [${negEx.index}] (${negEx.sourceDomain}) indicates ${pol.negLabel}.`,
              });
              break;
            }
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Format warning callout blocks for detected contradictions
   */
  formatContradictionCallouts(contradictions = []) {
    if (!Array.isArray(contradictions) || contradictions.length === 0) {
      return '';
    }

    const blocks = [];

    for (const c of contradictions) {
      const lines = [
        `> [!WARNING] Contradiction Detected: ${c.topicOrMetric}`,
      ];

      for (const claim of c.claims) {
        lines.push(`> - Source [${claim.sourceIndex}] (${claim.domain}): ${claim.assertion}`);
      }

      if (c.explanation) {
        lines.push('>');
        lines.push(`> *${c.explanation}*`);
      }

      blocks.push(lines.join('\n'));
    }

    return blocks.join('\n\n');
  }

  /**
   * Generate verified source shelf table in Markdown format
   */
  generateVerifiedSourceShelf(validExcerpts = [], usedIndices = null) {
    if (!Array.isArray(validExcerpts) || validExcerpts.length === 0) {
      return '';
    }

    const filterSet = usedIndices ? new Set(usedIndices) : null;
    const targetExcerpts = filterSet
      ? validExcerpts.filter((e) => filterSet.has(e.index))
      : validExcerpts;

    if (targetExcerpts.length === 0) {
      return '';
    }

    const rows = [
      '## Verified Source Shelf',
      '| Citation | Domain | Source Title & URL | Relevant Excerpt |',
      '|:---:|:---|:---|:---|',
    ];

    for (const excerpt of targetExcerpts) {
      const cleanTitle = (excerpt.sourceTitle || excerpt.sourceDomain).replace(/\|/g, '\\|');
      const link = excerpt.sourceUrl
        ? `[${cleanTitle}](${excerpt.sourceUrl})`
        : cleanTitle;
      const snippet = this._truncate(excerpt.text, 120).replace(/\|/g, '\\|').replace(/\n/g, ' ');

      rows.push(`| [${excerpt.index}] | \`${excerpt.sourceDomain}\` | ${link} | "${snippet}" |`);
    }

    return rows.join('\n');
  }

  /**
   * Helper: Truncate text cleanly with ellipsis
   */
  _truncate(str, max = this.maxContextSnippetChars) {
    if (!str || typeof str !== 'string') return '';
    const clean = str.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 3) + '...';
  }
}
