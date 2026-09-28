import { createHash } from 'node:crypto';

/**
 * Tracking query parameters commonly appended by advertising and social networks.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_reader',
  'utm_referrer',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'zanpid',
  'twclid',
  'igshid',
  'wbraid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  '_openstat',
  'yclid',
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'source_id',
]);

/**
 * 64-bit FNV-1a Hash for SimHash feature projection
 */
export function fnv1a64(str) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const buf = Buffer.from(str, 'utf8');

  for (let i = 0; i < buf.length; i++) {
    hash ^= BigInt(buf[i]);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash;
}

/**
 * Normalizes Arabic text by stripping diacritics, tatweel, and normalizing Alef/Yaa/Taa Marbuta
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // Strip tashkeel (diacritics: fatha, damma, kasra, sukun, shadda, tanween)
    .replace(/[\u064B-\u0652\u0670]/g, '')
    // Strip tatweel / kashida (ـ)
    .replace(/\u0640/g, '')
    // Normalize Alefs (أ, إ, آ, ٱ -> ا)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    // Normalize Taa Marbuta (ة -> ه)
    .replace(/\u0629/g, '\u0647')
    // Normalize Yaa (ى -> ي)
    .replace(/\u0649/g, '\u064A');
}

/**
 * DeduplicationEngine
 * 3-Level deduplication for autonomous web research:
 * - Level 1: Canonical URL normalizer
 * - Level 2: Exact SHA-256 text digest hash
 * - Level 3: 64-bit SimHash near-duplicate detector
 */
export class DeduplicationEngine {
  constructor(options = {}) {
    this.maxHammingDistance = options.maxHammingDistance ?? 3;
    this.seenUrls = new Set();
    this.seenExactHashes = new Set();
    this.seenSimHashes = []; // Array of { simHash: BigInt, url: string }
  }

  /**
   * Level 1: Canonical URL Normalizer
   * - Lowercase scheme and host
   * - Strips www. prefix
   * - Removes default ports (80, 443)
   * - Strips tracking query params (utm_*, fbclid, etc.)
   * - Deterministically sorts query keys
   * - Strips trailing slash and hash fragments
   */
  normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    try {
      const parsed = new URL(rawUrl.trim());

      // Normalize protocol & hostname
      parsed.protocol = parsed.protocol.toLowerCase();
      let host = parsed.hostname.toLowerCase();
      if (host.startsWith('www.')) {
        host = host.slice(4);
      }
      parsed.hostname = host;

      // Remove default ports
      if (
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')
      ) {
        parsed.port = '';
      }

      // Remove hash fragment
      parsed.hash = '';

      // Strip tracking params and sort remaining params
      const searchParams = new URLSearchParams();
      const keys = Array.from(parsed.searchParams.keys()).sort();

      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        if (!TRACKING_PARAMS.has(lowerKey) && !lowerKey.startsWith('utm_')) {
          const vals = parsed.searchParams.getAll(key);
          for (const val of vals) {
            searchParams.append(key, val);
          }
        }
      }

      // Normalize pathname
      let pathname = parsed.pathname.replace(/\/+/g, '/');
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }

      const queryString = searchParams.toString();
      const searchPart = queryString ? `?${queryString}` : '';
      const portPart = parsed.port ? `:${parsed.port}` : '';

      return `${parsed.protocol}//${parsed.hostname}${portPart}${pathname}${searchPart}`;
    } catch {
      // Fallback for malformed URLs
      return rawUrl
        .trim()
        .toLowerCase()
        .replace(/#.*$/, '')
        .replace(/\/+$/, '');
    }
  }

  /**
   * Level 2: Exact SHA-256 Text Digest Hash
   * - Normalizes Unicode (NFC) and Arabic morphology
   * - Collapses consecutive whitespace
   * - Computes SHA-256 hex digest
   */
  hashTextSha256(text) {
    if (!text || typeof text !== 'string') return '';

    const normalized = normalizeArabic(text.normalize('NFC'))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Tokenize text into words and sub-word shingles for SimHash
   * Supports English, Latin, Arabic, and numeric tokens.
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];

    const normalized = normalizeArabic(text.normalize('NFC')).toLowerCase();
    const words = normalized.match(/[\p{L}\p{N}_]{2,}/gu) || [];
    if (words.length === 0) return [];

    const tokens = [...words];

    // Sub-word character 3-shingles within each word to capture morphological features
    for (const w of words) {
      if (w.length >= 3) {
        for (let i = 0; i <= w.length - 3; i++) {
          tokens.push(w.slice(i, i + 3));
        }
      }
    }

    return tokens;
  }

  /**
   * Level 3: Compute 64-bit SimHash Fingerprint
   */
  computeSimHash(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return 0n;

    // Term frequencies
    const freqMap = new Map();
    for (const token of tokens) {
      freqMap.set(token, (freqMap.get(token) || 0) + 1);
    }

    const V = new Float64Array(64);

    for (const [token] of freqMap.entries()) {
      const weight = 1;
      const tokenHash = fnv1a64(token);

      for (let i = 0; i < 64; i++) {
        const bit = (tokenHash >> BigInt(i)) & 1n;
        if (bit === 1n) {
          V[i] += weight;
        } else {
          V[i] -= weight;
        }
      }
    }

    let fingerprint = 0n;
    for (let i = 0; i < 64; i++) {
      if (V[i] > 0) {
        fingerprint |= 1n << BigInt(i);
      }
    }

    return fingerprint;
  }

  /**
   * Compute Hamming Distance between two 64-bit SimHashes
   */
  hammingDistance(hashA, hashB) {
    let xor = (BigInt(hashA) ^ BigInt(hashB)) & 0xffffffffffffffffn;
    let distance = 0;

    while (xor > 0n) {
      xor &= xor - 1n;
      distance++;
    }

    return distance;
  }

  /**
   * Check if a 64-bit SimHash is a near-duplicate against existing hashes
   */
  findNearDuplicate(simHash, maxDistance = this.maxHammingDistance) {
    if (!simHash) return null;

    for (const entry of this.seenSimHashes) {
      const distance = this.hammingDistance(simHash, entry.simHash);
      if (distance <= maxDistance) {
        return {
          duplicate: true,
          matchedUrl: entry.url,
          distance,
        };
      }
    }

    return null;
  }

  /**
   * Full 3-Level Deduplication Inspection
   * Checks Level 1 (URL), Level 2 (Exact SHA-256), and Level 3 (SimHash).
   * If unique, registers the entry.
   */
  checkAndRegister({ url, content = '', text = '', title = '' }) {
    const rawText = content || text || title || '';
    const canonicalUrl = this.normalizeUrl(url);

    // 1. Level 1: Canonical URL Check
    if (canonicalUrl && this.seenUrls.has(canonicalUrl)) {
      return {
        duplicate: true,
        level: 1,
        reason: 'canonical_url',
        canonicalUrl,
      };
    }

    // 2. Level 2: Exact SHA-256 Digest Check
    const exactHash = this.hashTextSha256(rawText);
    if (exactHash && this.seenExactHashes.has(exactHash)) {
      return {
        duplicate: true,
        level: 2,
        reason: 'exact_sha256',
        canonicalUrl,
        exactHash,
      };
    }

    // 3. Level 3: 64-bit SimHash Near-Duplicate Check
    const simHash = this.computeSimHash(rawText);
    if (simHash !== 0n) {
      const nearMatch = this.findNearDuplicate(simHash);
      if (nearMatch) {
        return {
          duplicate: true,
          level: 3,
          reason: 'simhash_near_duplicate',
          canonicalUrl,
          matchedUrl: nearMatch.matchedUrl,
          distance: nearMatch.distance,
        };
      }
    }

    // If all levels are unique, register into state
    if (canonicalUrl) {
      this.seenUrls.add(canonicalUrl);
    }
    if (exactHash) {
      this.seenExactHashes.add(exactHash);
    }
    if (simHash !== 0n) {
      this.seenSimHashes.push({
        simHash,
        url: canonicalUrl,
      });
    }

    return {
      duplicate: false,
      canonicalUrl,
      exactHash,
      simHash,
    };
  }

  /**
   * Reset internal deduplication caches
   */
  clear() {
    this.seenUrls.clear();
    this.seenExactHashes.clear();
    this.seenSimHashes = [];
  }
}
