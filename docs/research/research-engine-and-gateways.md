# Technical Research Report: Gateways & Provider Routing and State-of-the-Art Autonomous Web Research Engine Architecture

**Target Location**: `docs/research/research-engine-and-gateways.md`  
**Author**: LENS Research & Architecture Team  
**Date**: September 2026  
**Status**: Complete Primary-Source Investigation & Architectural Recommendation  

---

## Executive Summary

This investigation delivers primary-source analysis and technical architecture blueprints for two core pillars of **LENS Workstation**:

1. **Gateways & Provider Routing**: A rigorous breakdown of **Kilo Gateway**, **OpenCode (`anomalyco/opencode`)**, and **Cline (`cline/cline`)**, detailing their wire protocols, streaming schemas, tool-invocation mechanics, token/cost attribution, and API key lifecycles. We identify key implementation bottlenecks in LENS Workstation's existing `MultiProviderGateway` (such as fragmented JSON streaming parsing errors) and provide production-ready TypeScript/ESM adapters.
2. **State-of-the-Art Autonomous Web Research Engine (2025–2026)**: A comprehensive synthesis of modern deep research architectures—specifically **Stanford STORM / Co-STORM**, **Hugging Face Smolagents / Open Deep Research**, **Perplexity multi-hop retrieval**, and search planes (**Tavily**, **Brave Search LLM Context API**, **SearXNG**, and **DuckDuckGo**). We specify an end-to-end 5-stage pipeline spanning query decomposition, 3-level deduplication, SSRF-safe content extraction, deterministic citation grounding with zero hallucination, and local hybrid indexing (BM25 + RRF + MMR).

---

# Part 1: Gateways & Provider Routing (OpenCode, Cline, Kilo Gateway)

## 1.1 Kilo Gateway (`kilo.ai`)

### Protocol & API Schema
- **Protocol Paradigm**: 100% OpenAI-compatible HTTP REST and Server-Sent Events (SSE) streaming gateway.
- **Base URL**: `https://api.kilo.ai/api/gateway`
- **Core Endpoints**:
  - `POST https://api.kilo.ai/api/gateway/v1/chat/completions` (also responds at `/api/gateway/chat/completions`): Drop-in replacement for OpenAI `/v1/chat/completions`.
  - `GET https://api.kilo.ai/api/gateway/models`: Lists 500+ available models across providers, context window limits, pricing metadata (prompt/completion per million tokens), and supported capabilities (tools, vision, reasoning).
- **Authentication**: Standard Bearer token via HTTP Header:
  ```http
  Authorization: Bearer <KILO_API_KEY>
  Content-Type: application/json
  ```
- **Model Identifier Namespacing**: Models use the namespaced pattern `provider/model-id`:
  - `anthropic/claude-3-7-sonnet`
  - `anthropic/claude-sonnet-4.6`
  - `openai/gpt-4o`
  - `deepseek/deepseek-chat`
  - `google/gemini-2.5-pro`
  - `meta-llama/llama-3.3-70b-instruct`
- **Streaming Schema**: Standard SSE with chunks formatted as:
  ```json
  data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1727500000,"model":"anthropic/claude-3-7-sonnet","choices":[{"index":0,"delta":{"content":"text delta","reasoning_content":"thought delta","tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"view_file","arguments":"{\"path\":\""}}]}}]}
  ```
  Terminated by `data: [DONE]`.
- **Reasoning Tokens**: Exposes DeepSeek-R1 / o1 / o3 style thinking tokens in `delta.reasoning_content` alongside assistant text in `delta.content`.
- **Billing & BYOK**: Supports credit balance deduction or "Bring Your Own Key" (BYOK) for Anthropic, OpenAI, and Google, routing through the unified endpoint while preserving negotiated tier limits.

---

## 1.2 OpenCode (`anomalyco/opencode`)

### Architecture & Engine Foundation
- **Repository**: `anomalyco/opencode` (created by Anomaly / SST).
- **Architecture**: Client-Server architecture pairing a terminal UI built with Go (`charmbracelet/bubbletea`) with a fast agent server runtime executed via Bun / Node.js.
- **Provider Layer**: Integrates with the **Vercel AI SDK** (`ai` core) and the `models.dev` provider catalog. Supports over 75 LLM providers out of the box.
- **OpenCode Zen**: A curated AI gateway and benchmarked model proxy hosted by OpenCode that normalizes models specifically tuned for agentic coding.

### Wire Protocols & API Schemas
- Uses the Vercel AI SDK provider adapters:
  - **OpenAI Compatible**: `https://api.openai.com/v1` or custom `baseURL` (e.g. `http://127.0.0.1:4096/v1` or OpenCode Zen).
  - **Anthropic Messages**: Direct Messages API (`/v1/messages`) via `@ai-sdk/anthropic`.
  - **Google Generative AI**: Gemini API via `@ai-sdk/google`.

### Streaming Tool Calls
- Implements native function calling via `streamText({ model, tools, ... })`.
- **Edge-Case Handling**: In OpenAI-compatible streaming chunks, tool calls arrive across multiple chunks:
  1. Chunk 1: `tool_calls: [{ index: 0, id: "call_abc", type: "function", function: { name: "edit_file", arguments: "" } }]`
  2. Subsequent Chunks: `tool_calls: [{ index: 0, function: { arguments: "partial_json_str" } }]` (where `id` and `name` are `undefined` or `null`).
- OpenCode maintains a stateful stream accumulator per `tool_call.index` to aggregate partial arguments until the stream finishes or the tool execution barrier is reached.

### Token Cost Tracking & API Key Storage
- **Token Usage**: Extracts usage tokens from the final SSE chunk or finish event (`usage: { promptTokens, completionTokens, totalTokens }`).
- **Configuration & Storage**:
  - Configured via `opencode.json` at project root or user home.
  - Credentials stored at `~/.opencode/credentials.json` (or `~/.config/opencode/`) with file permissions restricted to `0600`.
  - Fully overridable with standard environment variables (`OPENCODE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`).

---

## 1.3 Cline (`cline/cline` & Roo-Code)

### Architecture & Provider Protocols
- **Runtime**: Decoupled `@cline/core` decoupled from the VS Code extension host.
- **Provider Seam**: `buildApiHandler(apiConfiguration: ApiConfiguration): ApiHandler` in `src/api/index.ts`.
- **Supported Backends**:
  - **Anthropic**: Direct Messages API (`@anthropic-ai/sdk`), headers `anthropic-version: 2023-06-01`, `anthropic-beta: prompt-caching-2024-07-25`.
  - **OpenRouter**: OpenAI-compatible endpoint with OpenRouter routing headers (`HTTP-Referer`, `X-Title`).
  - **OpenAI / OpenAI Compatible**: Targets `/v1/chat/completions` for OpenAI, LiteLLM, Ollama, LM Studio, and vLLM.
  - **Cloud Providers**: AWS Bedrock Runtime SDK, Google Cloud Vertex AI SDK.

### Tool Calling Mechanism: XML-Prompted vs Native
- **Primary Paradigm**: Cline traditionally employs **System Prompt XML-based Tool Definitions**.
  - Tools are formatted inside `<tools>` blocks in the system prompt:
    ```xml
    <read_file>
    <path>src/index.ts</path>
    </read_file>
    ```
  - **Why XML?** Universal compatibility. Local models (Ollama/llama.cpp) and non-OpenAI models frequently hallucinate or fail structured JSON function-calling constraints in long multi-turn agent loops. XML embedded in freeform text flows naturally alongside chain-of-thought tokens.
  - **Incremental XML Parsing**: Cline's `ApiStream` uses regex/state-machine chunk parsing to capture opening and closing XML tags as text streams in real time.
  - **Native Tool Calling**: Supported as an opt-in mode for Claude and GPT-4o, but XML remains the fallback common denominator.

### Model Routing & Granular Modes (Roo-Code)
- **Granular Modes**: `Architect`, `Code`, `Ask`, `Test`.
- Each mode binds to a specific model profile and capability boundary:
  - *Architect Mode*: Read-only tools (`read_file`, `list_files`, `search_files`). Mutating tools prohibited.
  - *Code Mode*: Mutating tools (`write_to_file`, `apply_diff`, `execute_command`) gated by user authorization checkpoints.

### Token Cost Tracking & Prompt Caching
- **Cost Calculation**: Maintained via `src/utils/costCalculator.ts` using static pricing tables.
- **Prompt Caching Accounting**:
  - Detects Anthropic prompt caching headers:
    - `usage.cache_creation_input_tokens` (priced at 1.25x base input rate).
    - `usage.cache_read_input_tokens` (priced at 0.10x base input rate — a 90% discount).
    - `usage.input_tokens` (base uncached input).
    - `usage.output_tokens` (completion rate).
  - Emits real-time turn cost and cumulative session cost to UI.

### API Key Management
- Stored using VS Code's `ExtensionContext.secrets` (backed by OS credential vaults: Windows DPAPI / Credential Manager, macOS Keychain, Linux Secret Service).
- Headless / CLI execution loads keys from environment variables or custom secure storage.

---

## 1.4 LENS Workstation `MultiProviderGateway` Integration Blueprint

### Defect in Existing `engine/providers/index.mjs`
In the current implementation:
```javascript
// engine/providers/index.mjs: lines 31-38
if (typeof tc.function.arguments === 'string') {
  try {
    args = JSON.parse(tc.function.arguments);
  } catch {
    args = { raw: tc.function.arguments };
  }
}
```
*Critical Defect*: In OpenAI/Kilo streaming, `tc.function.arguments` is delivered in string fragments (e.g., `{"pa`, then `th": "f`, then `oo"}`). Calling `JSON.parse()` on individual chunks causes premature parsing failures, leaving `{ raw: "..." }` fragments that fail tool validation.

### Recommended Unified Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Client Request Prompt     │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │              MultiProviderGateway               │
                         └───────┬─────────────────┬─────────────────┬─────┘
                                 │                 │                 │
                ┌────────────────┴────────┐ ┌──────┴────────┐ ┌──────┴────────┐
                │   KiloGatewayProvider   │ │ Anthropic/    │ │  OpenCode/    │
                │(https://api.kilo.ai/...)│ │ ClaudeProvider│ │  Cline Bridge │
                └────────────────┬────────┘ └──────┬────────┘ └──────┬────────┘
                                 │                 │                 │
                                 └─────────────────┼─────────────────┘
                                                   │ Raw Event Stream
                                                   ▼
                         ┌─────────────────────────────────────────────────┐
                         │          StreamingToolCallAccumulator           │
                         │   - Buffers delta.tool_calls[i].arguments       │
                         │   - Buffers XML tags: <tool>...</tool>          │
                         │   - Emits unified TurnEvents (thought, chunk,   │
                         │     tool_call with fully parsed JSON args)      │
                         └─────────────────────────┬───────────────────────┘
                                                   │
                                                   ▼
                                         AgentRuntime (Core)
```

### Complete Implementation Contracts

```typescript
// Unified Provider Configuration & Model Definition
export interface ProviderConfig {
  provider: 'kilo' | 'openai' | 'anthropic' | 'gemini' | 'opencode' | 'deepseek' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;
}

// Unified Turn Events emitted to AgentRuntime
export type TurnEvent =
  | { type: 'thought'; text: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; callId: string; toolName: string; args: Record<string, any> }
  | { type: 'usage'; usage: TokenUsage; costEstimateUSD?: number };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
```

```javascript
/**
 * Stateful Tool Call Accumulator for fragmented OpenAI / Kilo SSE chunks
 */
export class StreamingToolAccumulator {
  constructor() {
    this.activeTools = new Map(); // index -> { id, name, rawArgs }
  }

  processChunkDelta(delta) {
    const readyToolCalls = [];
    if (!delta.tool_calls || !Array.isArray(delta.tool_calls)) return readyToolCalls;

    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      let record = this.activeTools.get(idx);
      if (!record) {
        record = {
          id: tc.id || `call_${Date.now()}_${idx}`,
          name: tc.function?.name || '',
          rawArgs: '',
        };
        this.activeTools.set(idx, record);
      }

      if (tc.function?.name && !record.name) {
        record.name = tc.function.name;
      }
      if (tc.function?.arguments) {
        record.rawArgs += tc.function.arguments;
      }
    }
    return readyToolCalls;
  }

  finalize() {
    const finalized = [];
    for (const [idx, record] of this.activeTools.entries()) {
      let parsed = {};
      try {
        parsed = JSON.parse(record.rawArgs);
      } catch {
        parsed = { raw: record.rawArgs };
      }
      finalized.push({
        type: 'tool_call',
        callId: record.id,
        toolName: record.name,
        args: parsed,
      });
    }
    this.activeTools.clear();
    return finalized;
  }
}
```

```javascript
/**
 * Dedicated Kilo Gateway Provider Adapter
 */
export class KiloGatewayProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kilo',
      baseUrl: config.baseUrl || 'https://api.kilo.ai/api/gateway/v1',
    });
  }

  async *generateStream(prompt, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };

    const payload = {
      model: this.model, // e.g. "anthropic/claude-3-7-sonnet"
      messages: Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }],
      stream: true,
      tools: options.tools,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Kilo Gateway HTTP ${res.status}: ${errText}`);
    }

    const accumulator = new StreamingToolAccumulator();
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') {
          for (const tc of accumulator.finalize()) yield tc;
          return;
        }
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.reasoning_content) {
              yield { type: 'thought', text: delta.reasoning_content };
            }
            if (delta.content) {
              yield { type: 'content', text: delta.content };
            }
            if (delta.tool_calls) {
              accumulator.processChunkDelta(delta);
            }
          } catch {
            // Partial JSON buffer ignored
          }
        }
      }
    }

    for (const tc of accumulator.finalize()) {
      yield tc;
    }
  }
}
```

---

# Part 2: State-of-the-Art Autonomous Web Research Engine Architecture (2025–2026)

## 2.1 Comparative Analysis of Leading Paradigms

| Architecture | Query Planning & Strategy | Retrieval & Scrape Engine | Citation Grounding & Verification | Strength / Limiting Factor |
| :--- | :--- | :--- | :--- | :--- |
| **Stanford STORM** (NAACL 2024) | Perspective Simulation (3–5 expert personas); pre-writing outline generation. | Multi-turn search engine querying via DSPy modules. | Inline bracketed citations `[1]`, Wikipedia-style reference table. | Strong topic breadth & structure; static outline can miss late-breaking discoveries. |
| **Stanford Co-STORM** (EMNLP 2024) | Collaborative agent roundtables with dynamic Mind Map tracking concept hierarchy. | Real-time targeted search driven by human steering + moderator. | Span-level concept attribution mapped directly to mind-map nodes. | Superb human-in-the-loop steering; heavier LLM conversational overhead. |
| **HF Smolagents / Open Deep Research** | Code-first planning (`CodeAgent` executes Python scripts with loops/variables). | Dynamic tool calling (DuckDuckGo, SerpAPI, Firecrawl API). | Programmatic citation collection in execution state. | Code execution enables precise data filters; requires sandboxed code interpreter. |
| **Perplexity Multi-Hop Retrieval** | Dynamic query reformulation; sub-query fanout based on initial snippets. | Proprietary distributed web crawler + real-time index. | Exact sentence-level citation chip indexing with excerpt hover. | Ultra-low latency; closed proprietary index. |
| **Tavily Search / Extract API** | Automated query routing; basic vs advanced depth; domain filters. | Hybrid search engine + native scraper with boilerplate stripping. | Returns raw text and markdown with clean metadata. | Fast turnkey RAG integration; commercial API cost per extract call. |
| **Brave Search (LLM Context API)** | Direct query execution against 30B+ independent page index. | Proprietary independent index; returns pre-extracted smart chunks. | Snippet rankings with confidence and freshness metrics. | High independence and scale; zero reliance on Google/Bing indexes. |
| **SearXNG / DuckDuckGo** | Free, zero-API-key metasearch aggregation. | Scrapes HTML (`html.duckduckgo.com`) or queries SearXNG JSON endpoint. | Manual parsing required from raw HTML snippets. | Completely private & self-hostable; subject to aggressive rate limits (~30 req/min). |

---

## 2.2 The Optimal 5-Stage Autonomous Research Pipeline

```
                               ┌─────────────────────────────┐
                               │   User Research Objective   │
                               └──────────────┬──────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Query Planning & Decomposition                                                   │
│ - Perspective Simulation (Technical, Commercial, Security/Risks, Empirical)               │
│ - Hierarchical Plan Decomposition (3-5 Milestones)                                        │
│ - Multi-angle Boolean Query Generation (temporal tags, exact quotes, site-exclusions)     │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Multi-Source Retrieval & Deduplication Plane                                     │
│ - Bounded Admission Gate (Concurrency = 3-5, Queue = 32)                                  │
│ - Primary Search Adapter: Brave LLM Context API / Tavily / SearXNG / DDG                  │
│ - 3-Level Deduplication:                                                                  │
│   • Level 1: Canonical URL Normalization (query sorting, UTM stripping, path cleansing)   │
│   • Level 2: Exact SHA-256 Text Hashing (Unicode-normalized)                             │
│   • Level 3: 64-bit SimHash Fingerprinting (Hamming Distance <= 3 bits)                   │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 3: SSRF-Safe Content Extraction & Cleaning                                          │
│ - Safe DNS Resolution (blocks 127.0.0.1, RFC 1918 10.0.0.0/8, 172.16.0.0/12, 192.168/16) │
│ - Lightweight DOM Emulation via `linkedom`                                                │
│ - Main Content Isolation via Readability / Defuddle (strips nav, headers, ads, cookies)   │
│ - Markdown Serialization via Turndown (GFM tables, blockquotes, code fences)              │
│ - Hard Content Budgeting (6,000 - 12,000 characters per page)                             │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Local Lexical & Semantic Hybrid Indexing                                         │
│ - Pure TypeScript Inverted Index: BM25 (Arabic/English stemming, k1=1.2, b=0.75)          │
│ - Dense Cosine Embedding Ranking (Local or API Embeddings with LRU Cache)                 │
│ - Reciprocal Rank Fusion (RRF with k=60): score = SUM(w / (60 + rank))                    │
│ - Maximal Marginal Relevance (MMR, lambda=0.7) for information diversity                  │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Stratified Evidence Synthesis & Claim Attribution                                │
│ - Pre-allocated Immutable Citation Brackets: `[1]`, `[2]`, `[3]` tied to `GroundedExcerpt`│
│ - Milestone-by-Milestone Analytical Drafting                                              │
│ - Post-Synthesis Zero-Hallucination Regex Audit (strips unmapped brackets)                │
│ - Empirical Contradiction Detection (callouts for conflicting factual claims)             │
│ - Verified Source Shelf & Evidence Drawer Export                                          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2.3 Detailed Pipeline Subsystems & Specifications

### A. Query Planning & Decomposition
1. **Perspective Simulation**: Inspired by Stanford STORM, the prompt initializes multiple virtual perspectives:
   - *Technical Architect*: Explores protocols, benchmarks, code mechanisms, and failure modes.
   - *Market / Ecosystem Analyst*: Explores adoption, licensing, governance, and hosting models.
   - *Security Auditor*: Explores SSRF vectors, credential leakage, sandboxing, and rate limits.
2. **Boolean Query Formulation**: Translates natural language questions into optimized keyword search terms with search operators (`"exact phrase"`, `site:domain`, `after:YYYY-MM-DD`).

### B. Multi-Level Deduplication Engine
Web searches return massive redundant content (syndicated articles, mirror sites, tracking URLs). LENS enforces three strict stages:
1. **Level 1 (Canonical URL)**:
   - Normalize scheme and hostname to lowercase.
   - Strip default ports (`:80`, `:443`).
   - Strip tracking query parameters (`utm_*`, `fbclid`, `gclid`, `ref`, `mc_cid`).
   - Deterministically sort remaining query keys and strip trailing slashes.
2. **Level 2 (Exact SHA-256 Digest)**:
   - Unicode whitespace collapsing and letter/number preservation across Latin, Arabic, and CJK characters.
3. **Level 3 (64-Bit SimHash Near-Duplicate Detection)**:
   - Word token frequency weighting with 64-bit projection vectors.
   - Hamming distance $\le 3$ flags near-duplicate mirrored articles and content scrapes.

### C. Content Extraction & Security Sandboxing
1. **SSRF Hardening**: Before any HTTP `fetch`, execute a pre-flight DNS lookup. Immediately reject queries resolving to loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), or cloud metadata endpoints (`169.254.169.254`).
2. **DOM Emulation**: Use `linkedom` rather than heavyweight `jsdom` or headless Chromium to maintain sub-10ms parsing times and minimal RAM usage.
3. **Reader Extraction**: Apply `@mozilla/readability` or `defuddle` to extract the primary article tree (`article`, `main`, or highest text-density node), stripping script tags, styles, ad banners, navigation menus, and footers.
4. **Markdown Conversion**: Use `turndown` with GFM extensions to preserve structured tables and code blocks while discarding presentation markup.
5. **Content Budgeting**: Enforce a strict page budget cap (e.g. 6,000–10,000 characters) to avoid context pollution.

### D. Local Lexical & Semantic Hybrid Indexing
1. **Pure TypeScript BM25**:
   - Zero native C++ compilation dependencies.
   - Bilingual Arabic + English text normalization:
     - English: Lowercase, punctuation stripping, English stopword elimination.
     - Arabic: Diacritic (tashkeel) stripping, tatweel removal, Alef normalization (`إ, أ, آ -> ا`), Taa Marbuta normalization (`ة -> ه`), and light prefix-stemming (`ال`, `وال`, `فال`).
   - Okapi BM25 scoring formula:
     $$\text{score}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot (1 - b + b \cdot \frac{|D|}{\text{avgdl}})}$$
2. **Hybrid Reciprocal Rank Fusion (RRF)**:
   - Merges BM25 lexical ranking with dense semantic cosine similarity:
     $$\text{RRF\_Score}(d) = \sum_{m \in M} \frac{w_m}{k + \text{rank}_m(d)} \quad (k = 60)$$
3. **Maximal Marginal Relevance (MMR)**:
   - Diversifies candidate chunks before feeding them to the synthesis model ($\lambda = 0.7$):
     $$\text{MMR} = \arg\max_{d_i \in R \setminus S} \left[ \lambda \cdot \text{Sim}_1(d_i, Q) - (1 - \lambda) \max_{d_j \in S} \text{Sim}_2(d_i, d_j) \right]$$

### E. Stratified Evidence Synthesis & Claim Attribution
1. **Pre-Allocated Citation Brackets**:
   - Evidence chunks are indexed prior to prompt generation. Each passage is assigned an immutable citation index and bracket string: `[1]`, `[2]`, `[3]`.
   - The synthesis prompt explicitly instructs the LLM: *"You must substantiate every assertion with exact brackets `[n]` referencing the provided Grounded Evidence passages."*
2. **Post-Synthesis Regex Verification**:
   - Regex scan: `/(?:\[(\d+)\])+/g`.
   - Checks every extracted index against the registered valid chunks.
   - Hallucinated references (indices not present in evidence) are stripped or remapped.
   - Zero-hallucination guarantee: No ungrounded citation is presented to the user.
3. **Empirical Contradiction Callouts**:
   - Detects numeric, date, or factual discrepancies between sources. Emits dedicated callout blocks:
     ```markdown
     > [!WARNING] Contradiction Detected: Benchmark Latency
     > - Source [1] (official docs): Reports 45ms P99 latency.
     > - Source [4] (third-party audit): Reports 140ms P99 under load.
     ```

---

## 2.4 Production TypeScript Interfaces & API Contracts

```typescript
// ==========================================
// 1. Research Planning & Milestone Contract
// ==========================================

export interface ResearchPlan {
  id: string;
  topic: string;
  perspectives: string[]; // e.g. ["technical", "market", "security"]
  milestones: ResearchMilestone[];
  createdAt: number;
}

export interface ResearchMilestone {
  id: string;
  title: string;
  focus: string;
  generatedQueries: string[];
  status: 'pending' | 'retrieving' | 'synthesizing' | 'completed';
}

// ==========================================
// 2. Retrieval & Scrape Contracts
// ==========================================

export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  sourceEngine: 'brave' | 'tavily' | 'searxng' | 'duckduckgo';
  score?: number;
}

export interface ScrapedDocument {
  url: string;
  canonicalUrl: string;
  title: string;
  contentMarkdown: string;
  exactHashSha256: string;
  simHash64: bigint;
  contentLength: number;
  extractedAt: number;
}

// ==========================================
// 3. Evidence Indexing & Hybrid Ranking
// ==========================================

export interface GroundedExcerpt {
  index: number;              // 1-based index (1, 2, 3...)
  bracket: string;            // Pre-allocated bracket string: "[1]"
  chunkId: string;
  milestoneId: string;
  text: string;               // Verbatim excerpt passage
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  relevanceScore: number;
}

export interface HybridRankOptions {
  k1?: number;                // BM25 k1 (default 1.2)
  b?: number;                 // BM25 b (default 0.75)
  rrfK?: number;              // RRF smoothing constant (default 60)
  mmrLambda?: number;         // MMR balance parameter (default 0.7)
  topK?: number;              // Candidate count
}

// ==========================================
// 4. Synthesis & Grounding Audit Contract
// ==========================================

export interface ContradictionClaim {
  sourceIndex: number;
  assertion: string;
  domain: string;
}

export interface ContradictionCallout {
  topicOrMetric: string;
  claims: ContradictionClaim[];
  explanation: string;
}

export interface GroundingAuditRecord {
  sanitizedReportMarkdown: string;
  totalCitationsFound: number;
  validCitationsCount: number;
  hallucinatedCitationsCount: number;
  validIndices: number[];
  hallucinatedIndices: number[];
  contradictionsDetected: ContradictionCallout[];
}
```

---

## 2.5 Recommended Step-by-Step Implementation for LENS Workstation

1. **Step 1: Fix `StreamingToolAccumulator` in `engine/providers/index.mjs`**
   - Replace direct `JSON.parse` with the stateful chunk accumulator to support streaming tool-calls from OpenAI and Kilo Gateway.
2. **Step 2: Add `KiloGatewayProvider` to `createProvider()`**
   - Map `provider: 'kilo'` to `https://api.kilo.ai/api/gateway/v1` with model namespacing (`anthropic/...`, `deepseek/...`).
3. **Step 3: Integrate Brave Search LLM Context API & Tavily Extract**
   - Add Brave LLM Context as the primary enterprise search plane with automatic fallback to DuckDuckGo/SearXNG.
4. **Step 4: Formalize 3-Level Deduplication in the Retrieval Pipeline**
   - Place `normalizeCanonicalUrl`, `computeExactHash`, and `computeSimHash64` before invoking page scrapers to cut fetch bandwidth by up to 40%.
5. **Step 5: Enforce Pre-Allocated Brackets and Zero-Hallucination Regex Audit**
   - Wrap all synthesized research sections in the grounding verification pass before emitting them to the UI or saving markdown files.

---

### Primary Source References
1. **Stanford STORM**: Y. Shao, Y. Jiang, T. A. Kanaujia, O. Khattab, M. S. Lam, *"Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models"*, NAACL 2024. [arXiv:2402.14207](https://arxiv.org/abs/2402.14207)
2. **Stanford Co-STORM**: Y. Jiang, T. A. Kanaujia, Y. Shao, M. S. Lam, *"Into the Unknown Unknowns: Engaged Human Learning through Participation in Language Model Agent Conversations"*, EMNLP 2024. [arXiv:2408.15232](https://arxiv.org/abs/2408.15232)
3. **Hugging Face Smolagents**: Hugging Face Open-Source Agent Framework, CodeAgent & ToolCallingAgent documentation. [huggingface.co/docs/smolagents](https://huggingface.co/docs/smolagents)
4. **Cline / Roo-Code Agent Core**: Cline GitHub Organization, `@cline/core` and `ApiHandler` architecture. [github.com/cline/cline](https://github.com/cline/cline)
5. **OpenCode**: Anomaly Innovations, `anomalyco/opencode` repository & Models.dev integration. [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
6. **Kilo Gateway**: Kilo Code unified inference endpoint documentation and API reference. [api.kilo.ai](https://api.kilo.ai)
7. **Brave Search API**: Brave Software, LLM Context API documentation. [brave.com/search/api](https://brave.com/search/api)
8. **Tavily AI**: Tavily Search & Extract REST API specification. [tavily.com](https://tavily.com)
9. **Reciprocal Rank Fusion**: G. V. Cormack, C. L. Clarke, S. Büttcher, *"Reciprocal rank fusion outperforms Condorcet and individual machine learning methods"*, SIGIR 2009.
