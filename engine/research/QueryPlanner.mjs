import { randomUUID } from 'node:crypto';

/**
 * Standard Perspective Simulation Personas
 */
export const PERSPECTIVES = {
  TECHNICAL: {
    id: 'technical',
    title: 'Technical Architecture & Implementation',
    focus: 'Protocols, architectural seams, data structures, runtime APIs, and source code mechanisms.',
    keywords: ['architecture', 'protocol', 'internals', 'implementation', 'API', 'source code'],
  },
  PERFORMANCE: {
    id: 'performance',
    title: 'Performance, Scalability & Benchmarks',
    focus: 'Throughput, P99 latency, memory footprint, CPU utilization, concurrency scaling, and resource limits.',
    keywords: ['benchmark', 'latency', 'throughput', 'memory footprint', 'scaling', 'performance metrics'],
  },
  SECURITY: {
    id: 'security',
    title: 'Security, Sandboxing & Vulnerability Analysis',
    focus: 'Attack surface, privilege boundaries, SSRF/CSRF defenses, credential protection, CVEs, and input sanitization.',
    keywords: ['security audit', 'vulnerabilities', 'CVE', 'sandboxing', 'privilege escalation', 'injection'],
  },
};

/**
 * QueryPlanner
 * Decomposes research topics into multi-perspective milestones and Boolean search queries.
 * Supports LLM-based simulation and algorithmic rule-based fallback.
 */
export class QueryPlanner {
  constructor(options = {}) {
    this.modelProvider = options.modelProvider || null;
    this.defaultPerspectives = options.defaultPerspectives || ['technical', 'performance', 'security'];
  }

  /**
   * Extract keywords and clean core noun phrases from topic text
   */
  extractCorePhrases(topic) {
    if (!topic || typeof topic !== 'string') return [];

    // Strip common filler conversational words
    const cleaned = topic
      .replace(/\b(please|can you|how do i|what is|tell me about|explain|research|investigate|find|search for)\b/gi, '')
      .replace(/[^\w\s\u0600-\u06FF-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').filter((w) => w.length > 2);
    return words;
  }

  /**
   * Formulate a structured Boolean search query
   */
  buildBooleanQuery(baseTopic, { keywords = [], exactQuotes = [], exclusions = [], siteFilter } = {}) {
    const parts = [];

    // Base exact quote or core topic
    if (exactQuotes.length > 0) {
      parts.push(exactQuotes.map((q) => `"${q}"`).join(' '));
    } else if (baseTopic) {
      // If base topic has 1-3 words, put in quotes for precision; otherwise unquoted
      const words = baseTopic.trim().split(/\s+/);
      if (words.length <= 3) {
        parts.push(`"${baseTopic.trim()}"`);
      } else {
        parts.push(baseTopic.trim());
      }
    }

    // Boolean keyword group (OR group)
    if (keywords.length > 0) {
      const orGroup = keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
      parts.push(`(${orGroup})`);
    }

    // Exclusions
    if (exclusions.length > 0) {
      parts.push(exclusions.map((e) => `-${e}`).join(' '));
    }

    // Site filter
    if (siteFilter) {
      parts.push(`site:${siteFilter}`);
    }

    return parts.join(' ').trim();
  }

  /**
   * Algorithmic Rule-Based Research Plan Generation
   */
  generateAlgorithmicPlan(topic, options = {}) {
    const planId = `plan-${randomUUID()}`;
    const selectedPerspectives = options.perspectives || this.defaultPerspectives;
    const corePhrases = this.extractCorePhrases(topic);
    const coreTopicStr = corePhrases.length > 0 ? corePhrases.join(' ') : topic;

    const milestones = [];

    for (let i = 0; i < selectedPerspectives.length; i++) {
      const pKey = selectedPerspectives[i].toUpperCase();
      const pConfig = PERSPECTIVES[pKey] || {
        id: selectedPerspectives[i].toLowerCase(),
        title: `${selectedPerspectives[i]} Perspective`,
        focus: `Investigation from the ${selectedPerspectives[i]} angle.`,
        keywords: [selectedPerspectives[i]],
      };

      const milestoneId = `m-${i + 1}`;
      const queries = [];

      // Query 1: Targeted boolean query with top keywords
      const primaryKeywords = pConfig.keywords.slice(0, 3);
      queries.push(this.buildBooleanQuery(coreTopicStr, { keywords: primaryKeywords }));

      // Query 2: Specific deep technical or operational query
      const secondaryKeywords = pConfig.keywords.slice(3, 6);
      if (secondaryKeywords.length > 0) {
        queries.push(this.buildBooleanQuery(coreTopicStr, { keywords: secondaryKeywords }));
      } else {
        queries.push(this.buildBooleanQuery(coreTopicStr, { keywords: [pConfig.id] }));
      }

      // Query 3: Comparative or benchmark / specification query
      if (pConfig.id === 'technical') {
        queries.push(`"${coreTopicStr}" (spec OR architecture OR "design doc" OR RFC)`);
      } else if (pConfig.id === 'performance') {
        queries.push(`"${coreTopicStr}" (benchmark OR "P99" OR throughput OR comparison)`);
      } else if (pConfig.id === 'security') {
        queries.push(`"${coreTopicStr}" (vulnerability OR "CVE" OR exploit OR advisory)`);
      } else {
        queries.push(`"${coreTopicStr}" ${pConfig.id} analysis`);
      }

      milestones.push({
        id: milestoneId,
        title: pConfig.title,
        perspective: pConfig.id,
        focus: pConfig.focus,
        generatedQueries: queries,
        status: 'pending',
      });
    }

    return {
      id: planId,
      topic,
      perspectives: selectedPerspectives,
      milestones,
      createdAt: Date.now(),
    };
  }

  /**
   * Plan Research: Executes LLM simulation if available, otherwise rule-based plan
   */
  async planResearch(topic, options = {}) {
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      throw new Error('Research topic must be a non-empty string');
    }

    // If modelProvider is present and not explicitly disabled, attempt LLM generation
    if (this.modelProvider && options.useModel !== false) {
      try {
        const prompt = `You are a Principal Research Architect simulating Stanford STORM research planning.
Analyze the following research inquiry: "${topic}"

Decompose this investigation into 3 distinct expert perspectives:
1. Technical Architecture & Implementation
2. Performance, Scalability & Benchmarks
3. Security, Sandboxing & Vulnerabilities

For each perspective, provide:
- Perspective Title
- Focus Statement
- 3 targeted Boolean search queries using quotes ("exact term") and OR/AND operators.

Return your response ONLY as valid JSON in this format:
{
  "milestones": [
    {
      "perspective": "technical",
      "title": "Technical Architecture & Implementation",
      "focus": "...",
      "queries": ["...", "...", "..."]
    },
    {
      "perspective": "performance",
      "title": "Performance, Scalability & Benchmarks",
      "focus": "...",
      "queries": ["...", "...", "..."]
    },
    {
      "perspective": "security",
      "title": "Security & Risk Analysis",
      "focus": "...",
      "queries": ["...", "...", "..."]
    }
  ]
}`;

        let rawResponse = '';
        const stream = this.modelProvider.generateStream
          ? this.modelProvider.generateStream([{ role: 'user', content: prompt }])
          : null;

        if (stream) {
          for await (const chunk of stream) {
            if (chunk.type === 'content' || chunk.text) {
              rawResponse += chunk.text || chunk.content || '';
            }
          }

          // Parse JSON from response
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.milestones) && parsed.milestones.length > 0) {
              return {
                id: `plan-${randomUUID()}`,
                topic,
                perspectives: parsed.milestones.map((m) => m.perspective),
                milestones: parsed.milestones.map((m, idx) => ({
                  id: `m-${idx + 1}`,
                  title: m.title || `Perspective ${idx + 1}`,
                  perspective: m.perspective || 'general',
                  focus: m.focus || '',
                  generatedQueries: Array.isArray(m.queries) ? m.queries : [],
                  status: 'pending',
                })),
                createdAt: Date.now(),
              };
            }
          }
        }
      } catch {
        // Fallback gracefully to algorithmic plan on LLM parsing or network error
      }
    }

    return this.generateAlgorithmicPlan(topic, options);
  }
}
