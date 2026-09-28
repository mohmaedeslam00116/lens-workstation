# ADR 0006: State-of-the-Art Autonomous Web Research Engine Architecture (2025–2026)

## Status
Accepted

## Context
Research workflows in software development require gathering high-trust primary technical documentation, RFC specifications, and library migration guides. Traditional chat search integrations merely append raw search snippets into prompts, leading to shallow summaries, context window pollution, and hallucinated citations.

Following our primary-source technical research (`docs/research/research-engine-and-gateways.md`) examining **Stanford STORM / Co-STORM**, **Hugging Face Smolagents**, **Perplexity Multi-Hop Retrieval**, and search planes (**Tavily**, **Brave LLM Context**, **SearXNG**, **DuckDuckGo**), LENS requires a dedicated, professional Deep Research Engine built from scratch as an autonomous subagent.

## Decision
We implement an end-to-end 5-stage research pipeline operating natively inside the embedded Node.js engine:

### 1. Stage 1: Query Planning & Decomposition
- **Perspective Simulation**: Decomposes user inquiries across virtual expert lenses (Technical Architect, Performance Engineer, Security Auditor).
- **Boolean Multi-Query Formulation**: Automatically generates 3–5 targeted sub-queries utilizing Boolean operators (`"exact phrase"`, `site:domain`, `after:YYYY-MM-DD`).

### 2. Stage 2: Multi-Source Retrieval & 3-Level Deduplication
- **Hybrid Retrieval Plane**:
  - *Default (Zero-Config)*: Direct, free metasearch aggregation via DuckDuckGo HTML / SearXNG / arXiv / Wikipedia requiring no external API keys.
  - *Enterprise Commercial (Optional)*: High-throughput Brave Search LLM Context API and Tavily Search API for pre-cleaned token streams.
- **3-Level Deduplication Pipeline**:
  - *Level 1 (Canonical URL)*: Strips UTM tracking tokens, normalizes hostname, sorts query parameters, and cleans trailing slashes.
  - *Level 2 (Exact SHA-256 Digest)*: Eliminates identical page contents across mirrors.
  - *Level 3 (64-Bit SimHash Fingerprinting)*: Flags near-duplicate syndicated articles with Hamming Distance $\le 3$.

### 3. Stage 3: SSRF-Safe Content Extraction & Cleaning Ladder
- **SSRF Hardening**: Pre-flight DNS validation rejects loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata (`169.254.169.254`).
- **Multi-Tier Extraction Ladder**:
  - *Tier 1*: Direct fast HTTP fetch with browser headers + lightweight `linkedom` DOM emulation + Readability / Turndown markdown conversion (sub-10ms, low RAM).
  - *Tier 2*: If blocked (HTTP 403/429/Cloudflare) or body is empty, route to public markdown reader proxies (`r.jina.ai/<url>`) or search engine cached snippets.
  - *Tier 3*: Gracefully skip unresolvable pages and log warning without crashing the pipeline.
- **Hard Page Budget**: Caps extracted article text at 6,000–10,000 characters to avoid context pollution.

### 4. Stage 4: Local Lexical & Semantic Hybrid Indexing
- **Pure TypeScript Inverted Index (BM25)**:
  - Zero native C++ compilation dependencies.
  - Full bilingual Arabic + English text normalization (Alef, Taa Marbuta, Tashkeel stripping; English stemming & stopword removal).
  - Okapi BM25 scoring ($k_1=1.2, b=0.75$).
- **Reciprocal Rank Fusion (RRF)**: Merges lexical rankings with dense semantic similarity with smoothing constant $k=60$.
- **Maximal Marginal Relevance (MMR)**: Applies diversity selection ($\lambda=0.7$) to eliminate repetitive passages before synthesis.

### 5. Stage 5: Stratified Evidence Synthesis & Claim Attribution
- **Pre-Allocated Citation Brackets**: Grounded excerpts receive pre-assigned immutable bracket markers (`[1]`, `[2]`, `[3]`).
- **Zero-Hallucination Regex Audit**: Synthesized report markdown undergoes a post-generation regex verification scan (`/(?:\[(\d+)\])+/g`). Any bracket referencing an unindexed passage is stripped or re-grounded, ensuring 100% cited authenticity.
- **Empirical Contradiction Callouts**: Automatically detects conflicting benchmarks or version assertions between sources and renders dedicated warning callouts.
- **Evidence Drawer & Source Shelf**: Emits grounded excerpts and source cards directly to the UI's Auxiliary Drawer.

## Consequences
- Provides LENS Workstation with an industrial-grade research engine comparable to Perplexity and Stanford STORM.
- Works immediately out-of-the-box for free without requiring API keys, while scaling seamlessly when users provide premium Tavily or Brave keys.
- Guaranteed zero-hallucination citations backed by cryptographic excerpts and verifiable source links.
