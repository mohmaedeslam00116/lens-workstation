import { normalizeArabic } from './DeduplicationEngine.mjs';

/**
 * English stopwords (common high-frequency function words).
 */
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while',
  'about', 'up', 'its', 'it', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom',
]);

/**
 * Arabic stopwords (common function words and particles).
 */
const ARABIC_STOPWORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'اللذان', 'اللتان', 'الذين', 'اللاتي', 'اللواتي',
  'هو', 'هي', 'هم', 'هن', 'نحن', 'أنت', 'أنتم', 'أنا',
  'كان', 'كانت', 'كانوا', 'يكون', 'تكون',
  'لا', 'لم', 'لن', 'قد', 'ما', 'إن', 'أن',
  'أو', 'ثم', 'بل', 'لكن', 'حتى', 'بين',
  'كل', 'بعض', 'غير', 'أي', 'عند', 'بعد', 'قبل',
  'ذا', 'إذا', 'إذ', 'منذ', 'حيث', 'كيف', 'ليس',
]);

/**
 * Arabic article prefixes to strip during normalization.
 * Order matters — check longest prefixes first.
 */
const ARABIC_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'ال'];

/**
 * Detect if a string contains Arabic characters.
 */
function isArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Lightweight Porter-like English stemmer.
 * Handles common suffixes: -ing, -tion, -sion, -ness, -ment, -able, -ible, -ful, -less, -ly, -ed, -er, -est, -ies, -ous, -s.
 */
function stemEnglish(word) {
  if (word.length < 4) return word;

  // Plurals
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);

  // -tion, -sion → remove
  if ((word.endsWith('tion') || word.endsWith('sion')) && word.length > 5) return word.slice(0, -3);

  // -ing
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    // running → run (doubled consonant)
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return stem.slice(0, -1);
    }
    return stem;
  }

  // -ness
  if (word.endsWith('ness') && word.length > 5) return word.slice(0, -4);
  // -ment
  if (word.endsWith('ment') && word.length > 5) return word.slice(0, -4);
  // -able / -ible
  if ((word.endsWith('able') || word.endsWith('ible')) && word.length > 5) return word.slice(0, -4);
  // -ful
  if (word.endsWith('ful') && word.length > 4) return word.slice(0, -3);
  // -less
  if (word.endsWith('less') && word.length > 5) return word.slice(0, -4);
  // -ous
  if (word.endsWith('ous') && word.length > 4) return word.slice(0, -3);
  // -ly
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  // -ed
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  // -er
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  // -est
  if (word.endsWith('est') && word.length > 4) return word.slice(0, -3);
  // Simple plural -s (not -ss, -us, -is)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is') && word.length > 3) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Light Arabic prefix-stemmer.
 * Strips definite article ال and its conjunctive forms (وال، فال، بال، كال).
 */
function stemArabic(word) {
  if (word.length < 3) return word;

  for (const prefix of ARABIC_PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length + 1) {
      return word.slice(prefix.length);
    }
  }

  return word;
}

/**
 * BilingualBM25 — Pure TypeScript Inverted Index with Okapi BM25 Scoring
 *
 * Features:
 * - Bilingual Arabic + English text normalization and stemming
 * - Okapi BM25 scoring (k1=1.2, b=0.75)
 * - Reciprocal Rank Fusion (RRF k=60) for hybrid ranking
 * - Maximal Marginal Relevance (MMR λ=0.7) for diversity selection
 *
 * Usage:
 *   const bm25 = new BilingualBM25();
 *   bm25.addDocument('doc1', 'Deep learning for NLP');
 *   bm25.addDocument('doc2', 'التعلم العميق في معالجة اللغة الطبيعية');
 *   const results = bm25.search('deep learning', 10);
 */
export class BilingualBM25 {
  constructor(options = {}) {
    /** @type {number} BM25 term frequency saturation parameter */
    this.k1 = options.k1 ?? 1.2;
    /** @type {number} BM25 document length normalization parameter */
    this.b = options.b ?? 0.75;
    /** @type {number} RRF fusion constant */
    this.rrfK = options.rrfK ?? 60;
    /** @type {number} MMR diversity-relevance tradeoff */
    this.mmrLambda = options.mmrLambda ?? 0.7;

    /**
     * Inverted index: term → Map<docId, termFrequency>
     * @type {Map<string, Map<string, number>>}
     */
    this.invertedIndex = new Map();

    /**
     * Document length (token count) by docId.
     * @type {Map<string, number>}
     */
    this.docLengths = new Map();

    /**
     * Document raw tokens by docId (for MMR similarity).
     * @type {Map<string, string[]>}
     */
    this.docTokens = new Map();

    /**
     * Total number of documents.
     * @type {number}
     */
    this.docCount = 0;

    /**
     * Sum of all document lengths (for avgdl).
     * @type {number}
     */
    this.totalLength = 0;
  }

  /**
   * Tokenize text with bilingual normalization and stemming.
   *
   * @param {string} text
   * @returns {string[]} Normalized, stemmed tokens.
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];

    // Apply Arabic normalization (from DeduplicationEngine)
    let normalized = normalizeArabic(text);
    // Lowercase
    normalized = normalized.toLowerCase();
    // Strip punctuation but keep Arabic/Latin/numeric characters
    normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    // Collapse whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    if (!normalized) return [];

    const rawTokens = normalized.split(' ');
    const result = [];

    for (const token of rawTokens) {
      if (!token || token.length < 2) continue;

      if (isArabic(token)) {
        // Arabic stopword check (against normalized form)
        if (ARABIC_STOPWORDS.has(token)) continue;
        result.push(stemArabic(token));
      } else {
        // English stopword check
        if (ENGLISH_STOPWORDS.has(token)) continue;
        result.push(stemEnglish(token));
      }
    }

    return result;
  }

  /**
   * Add a document to the index.
   *
   * @param {string} docId — Unique document identifier.
   * @param {string} text — Document text content.
   */
  addDocument(docId, text) {
    if (this.docLengths.has(docId)) {
      this.removeDocument(docId);
    }

    const tokens = this.tokenize(text);
    if (tokens.length === 0) return;

    // Count term frequencies
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Update inverted index
    for (const [term, freq] of tf) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term).set(docId, freq);
    }

    // Store metadata
    this.docLengths.set(docId, tokens.length);
    this.docTokens.set(docId, tokens);
    this.docCount++;
    this.totalLength += tokens.length;
  }

  /**
   * Remove a document from the index.
   *
   * @param {string} docId
   */
  removeDocument(docId) {
    if (!this.docLengths.has(docId)) return;

    const length = this.docLengths.get(docId);
    this.totalLength -= length;
    this.docCount--;
    this.docLengths.delete(docId);
    this.docTokens.delete(docId);

    // Remove from inverted index
    for (const [term, postings] of this.invertedIndex) {
      postings.delete(docId);
      if (postings.size === 0) {
        this.invertedIndex.delete(term);
      }
    }
  }

  /**
   * Compute IDF for a term.
   * IDF(t) = ln((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
   *
   * @param {string} term
   * @returns {number}
   */
  idf(term) {
    const postings = this.invertedIndex.get(term);
    const df = postings ? postings.size : 0;
    return Math.log(((this.docCount - df + 0.5) / (df + 0.5)) + 1);
  }

  /**
   * Compute BM25 score for a document against a query.
   *
   * score(D,Q) = Σ IDF(t) · f(t,D)·(k1+1) / (f(t,D) + k1·(1-b+b·|D|/avgdl))
   *
   * @param {string} docId
   * @param {string[]} queryTokens
   * @returns {number}
   */
  scoreBM25(docId, queryTokens) {
    const docLength = this.docLengths.get(docId);
    if (docLength === undefined) return 0;

    const avgdl = this.docCount > 0 ? this.totalLength / this.docCount : 1;
    let score = 0;

    for (const term of queryTokens) {
      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      const tf = postings.get(docId) || 0;
      if (tf === 0) continue;

      const termIdf = this.idf(term);
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / avgdl));

      score += termIdf * (numerator / denominator);
    }

    return score;
  }

  /**
   * Search the index with BM25 ranking.
   *
   * @param {string} query — Search query text.
   * @param {number} [topK=10] — Number of results to return.
   * @returns {Array<{ docId: string, score: number }>}
   */
  search(query, topK = 10) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = [];

    for (const docId of this.docLengths.keys()) {
      const score = this.scoreBM25(docId, queryTokens);
      if (score > 0) {
        scores.push({ docId, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Reciprocal Rank Fusion (RRF) — merge multiple ranked lists.
   *
   * RRF_Score(d) = Σ w_m / (k + rank_m(d))
   *
   * @param {Array<Array<{ docId: string, score: number }>>} rankedLists — Multiple ranked lists.
   * @param {number[]} [weights] — Per-list weights (default all 1).
   * @returns {Array<{ docId: string, score: number }>} Fused ranked list.
   */
  fusionRRF(rankedLists, weights) {
    const k = this.rrfK;
    const fusedScores = new Map();

    for (let m = 0; m < rankedLists.length; m++) {
      const w = weights?.[m] ?? 1;
      const list = rankedLists[m];

      for (let rank = 0; rank < list.length; rank++) {
        const { docId } = list[rank];
        const rrfContribution = w / (k + rank + 1); // rank is 0-indexed, formula uses 1-indexed
        fusedScores.set(docId, (fusedScores.get(docId) || 0) + rrfContribution);
      }
    }

    const result = Array.from(fusedScores.entries())
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score);

    return result;
  }

  /**
   * Compute Jaccard similarity between two token sets (for MMR).
   *
   * @param {string[]} tokensA
   * @param {string[]} tokensB
   * @returns {number} Similarity score [0, 1].
   */
  jaccardSimilarity(tokensA, tokensB) {
    if (!tokensA?.length || !tokensB?.length) return 0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Maximal Marginal Relevance (MMR) — diversify ranked results.
   *
   * MMR = argmax[λ·Sim1(di,Q) - (1-λ)·max Sim2(di,dj)]
   *
   * @param {Array<{ docId: string, score: number }>} candidates — Ranked candidate list.
   * @param {string[]} queryTokens — Tokenized query.
   * @param {number} [topK=10] — Number of diversified results.
   * @returns {Array<{ docId: string, score: number, mmrScore: number }>}
   */
  selectMMR(candidates, queryTokens, topK = 10) {
    if (candidates.length === 0) return [];
    if (candidates.length <= topK) {
      return candidates.map(c => ({ ...c, mmrScore: c.score }));
    }

    const lambda = this.mmrLambda;
    const selected = [];
    const remaining = [...candidates];

    // Normalize scores to [0, 1]
    const maxScore = Math.max(...remaining.map(c => c.score));
    const minScore = Math.min(...remaining.map(c => c.score));
    const scoreRange = maxScore - minScore || 1;

    while (selected.length < topK && remaining.length > 0) {
      let bestIdx = -1;
      let bestMmr = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const normalizedScore = (candidate.score - minScore) / scoreRange;

        // Query relevance (Sim1)
        const sim1 = normalizedScore;

        // Maximum similarity to already-selected documents (Sim2)
        let maxSim2 = 0;
        for (const sel of selected) {
          const tokensI = this.docTokens.get(candidate.docId) || [];
          const tokensJ = this.docTokens.get(sel.docId) || [];
          const sim2 = this.jaccardSimilarity(tokensI, tokensJ);
          if (sim2 > maxSim2) maxSim2 = sim2;
        }

        const mmr = lambda * sim1 - (1 - lambda) * maxSim2;

        if (mmr > bestMmr) {
          bestMmr = mmr;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        selected.push({
          ...remaining[bestIdx],
          mmrScore: bestMmr,
        });
        remaining.splice(bestIdx, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Full hybrid search: BM25 → RRF (if multiple rankers) → MMR diversity.
   *
   * @param {string} query
   * @param {number} [topK=10]
   * @param {Object} [options]
   * @param {Array<Array<{ docId: string, score: number }>>} [options.additionalRankings] — Extra ranked lists for RRF.
   * @param {boolean} [options.diversify=true] — Apply MMR diversity.
   * @returns {Array<{ docId: string, score: number, mmrScore?: number }>}
   */
  hybridSearch(query, topK = 10, options = {}) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // BM25 ranking
    const bm25Results = this.search(query, topK * 3);

    // RRF if additional rankings provided
    let ranked;
    if (options.additionalRankings?.length) {
      ranked = this.fusionRRF(
        [bm25Results, ...options.additionalRankings],
        [1, ...options.additionalRankings.map(() => 1)]
      );
    } else {
      ranked = bm25Results;
    }

    // MMR diversity selection
    if (options.diversify !== false && ranked.length > topK) {
      return this.selectMMR(ranked, queryTokens, topK);
    }

    return ranked.slice(0, topK);
  }

  /**
   * Get index statistics.
   */
  getStats() {
    return {
      documentCount: this.docCount,
      termCount: this.invertedIndex.size,
      averageDocLength: this.docCount > 0 ? this.totalLength / this.docCount : 0,
      totalTokens: this.totalLength,
    };
  }

  /**
   * Clear the entire index.
   */
  clear() {
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.docTokens.clear();
    this.docCount = 0;
    this.totalLength = 0;
  }
}

// Export helpers for testing
export {
  stemEnglish,
  stemArabic,
  isArabic,
  ENGLISH_STOPWORDS,
  ARABIC_STOPWORDS,
};
