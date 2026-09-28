# Specification: LENS Workstation v0.2.0 — Living Brain, Subagent Runtime & Deep Research Engine

## 1. Problem Statement
In v0.1.0, LENS Workstation established the Electron harness, local HTTP/WebSocket engine server, Monaco diff editor, sanitized terminal runner, and NSIS installer packaging. However, the application currently functions as a cosmetic shell because:
1. The default runtime provider (`createDefaultModelProvider`) returns mock canned strings rather than executing live LLM inference.
2. There is no in-UI Settings modal for developers to input and manage API credentials.
3. The engine lacks first-class provider integrations for critical AI developer gateways: **Kilo Gateway** (`api.kilo.ai`), **OpenCode** (`anomalyco/opencode`), and **Cline** (`cline/cline`).
4. Streaming tool calls over OpenAI and Kilo Gateway fail with JSON parsing errors due to fragmented argument delivery in SSE chunks.
5. The agent executes a single turn without autonomous multi-step reasoning (ReAct loop).
6. There is no live Deep Research Engine to autonomously plan queries, deduplicate web pages, safely scrape content, and synthesize verified citations without hallucination.
7. Subtasks cannot be delegated to observable background subagents as in Google Antigravity 2.0.

## 2. Solution
Build **LENS Workstation v0.2.0**, introducing the real living brain, subagent runtime, and autonomous deep research engine:
1. **First-Class Provider Gateway & DPAPI Security**: In-UI Settings modal with dedicated one-click profiles for **Kilo Gateway**, **OpenCode**, **Cline / OpenRouter**, **Google Gemini**, **Anthropic Claude**, **OpenAI**, **DeepSeek**, and **Local Ollama**. All API keys are encrypted at rest on Windows using `electron.safeStorage` (Windows DPAPI) with automatic fallback to `.env` / `process.env`.
2. **Stateful Streaming Tool Accumulator**: Production-ready stream accumulator in `engine/providers/` that aggregates partial JSON fragments across SSE chunks and supports both native function calling and Cline-style XML tool blocks.
3. **Multi-Step Autonomous ReAct Loop with Dual Autonomy**: Autonomous reasoning loop with thinking stream, automatic read/search execution, and configurable mode: "Autonomous (YOLO)" with instant Stop button vs "Supervised" with interactive Approve/Reject cards for file mutations and terminal commands. Includes sliding window tool output compaction and 80% context checkpointing.
4. **Antigravity-Style Subagent System**: Native `invoke_subagent` tool spawning isolated child tasks (`research`, `code_reviewer`, `general`). Renders an inline timeline widget in the chat stream with live `stateDetail` and deep-link navigation to a slide-out **Auxiliary Inspector Drawer** displaying the subagent's live `transcript.jsonl`, reasoning stream, and evidence quotes.
5. **State-of-the-Art Deep Research Engine**: 5-stage research pipeline based on Stanford STORM and Perplexity:
   - Perspective Simulation & Boolean Query Planning.
   - Multi-source retrieval & 3-level deduplication (Canonical URL, SHA-256 text hash, 64-bit SimHash).
   - SSRF-safe content extraction with `linkedom` DOM emulation, Readability, Turndown, and multi-tier scraping ladder (direct HTTP -> `r.jina.ai` markdown proxy -> graceful skip).
   - Local pure-TypeScript BM25 hybrid ranking (Arabic + English stemming) + RRF + MMR diversity.
   - Pre-allocated immutable citation brackets `[1]` with regex post-synthesis verification audit (zero hallucination).

---

## 3. User Stories

1. **US1 (Provider Hub & Settings Modal)**: As a developer, I want to open a Settings modal from the sidebar/topbar and select my provider (Kilo Gateway, OpenCode, Cline, Claude, Gemini, OpenAI, DeepSeek, Ollama) and enter my API keys, so that the agent connects to my preferred model.
2. **US2 (Kilo Gateway Integration)**: As a developer, I want to choose Kilo Gateway, enter my Kilo API key, and select from available models (e.g. `anthropic/claude-3-7-sonnet`, `deepseek/deepseek-chat`) fetched automatically from Kilo's `/models` endpoint.
3. **US3 (DPAPI Secure Storage)**: As a developer on Windows, I want my API keys encrypted locally using Windows DPAPI via Electron `safeStorage`, so that plain text credentials are never saved on disk.
4. **US4 (Fragmented Stream Assembly)**: As a developer, I want streaming tool calls from OpenAI, Kilo Gateway, and DeepSeek to execute cleanly without syntax errors, even when argument JSON arrives in small chunks.
5. **US5 (Multi-Step ReAct Loop)**: As a developer, I want the agent to reason, call tools, inspect outputs, and continue reasoning across multiple steps until my task is fully solved, without stopping after a single pass.
6. **US6 (Dual Autonomy Toggle)**: As a developer, I want to switch between "Autonomous" (runs terminal/file edits automatically with an instant stop button) and "Supervised" (requires approval before mutating actions) modes via a toggle in the UI.
7. **US7 (Sliding Window Context Compaction)**: As a developer, I want older tool execution results to be compacted into 1-line summaries during long tasks, so that the context window doesn't overflow or incur excessive token costs.
8. **US8 (Subagent Spawning)**: As a developer, I want the agent to invoke specialized subagents (`research`, `code_reviewer`, `general`) via `invoke_subagent` to handle background legwork concurrently.
9. **US9 (Inline Subagent Widget)**: As a developer, I want to see an interactive timeline card in the chat stream when a subagent is running, showing its role, live status (`stateDetail`), execution timer, and completion state.
10. **US10 (Auxiliary Inspector Drawer)**: As a developer, I want to click on a subagent card and have an Inspector Drawer slide open from the right, showing its live transcript, thoughts, search queries, and scraped text in real time.
11. **US11 (Deep Research Query Planning)**: As a developer asking a research question, I want the research engine to decompose my inquiry across technical, performance, and security perspectives into targeted Boolean queries.
12. **US12 (3-Level Deduplication & Safe Scraping)**: As a developer, I want web searches to automatically normalize URLs, deduplicate mirror sites (SHA-256 and SimHash), and safely scrape pages using Readability without SSRF risks.
13. **US13 (Zero-Config Hybrid Search)**: As a developer, I want web research to work out of the box using free search engines (DuckDuckGo / SearXNG / arXiv) without requiring paid API keys, with optional Tavily or Brave Search keys if configured.
14. **US14 (Zero-Hallucination Citations)**: As a developer, I want the synthesized research report to feature verified brackets `[1]` linked to exact quoted excerpts in an Evidence Drawer, with any hallucinated citation automatically purged by the engine.
15. **US15 (Arabic & English Research Support)**: As an Arabic or English speaking researcher, I want the local BM25 indexer to normalize Arabic text (Alef, Tashkeel, Taa Marbuta) and English text equally well.

---

## 4. Architectural Contracts & Engine Modules

### 4.1 Module Structure
```
engine/
├── core/
│   ├── AgentRuntime.mjs               # Core multi-step ReAct loop
│   ├── SubagentRuntime.mjs            # Isolated subagent runner & registry
│   ├── ContextCompactor.mjs           # Sliding window & checkpoint summarizer
│   └── EventBus.mjs                   # Internal event emitter (WebSocket relay)
├── providers/
│   ├── index.mjs                      # MultiProviderGateway factory
│   ├── StreamingToolAccumulator.mjs   # Robust SSE chunk JSON assembler
│   ├── KiloGatewayProvider.mjs        # Dedicated Kilo Gateway adapter
│   ├── OpenCodeBridgeProvider.mjs     # OpenCode & custom endpoint adapter
│   └── ClinePromptParser.mjs          # XML tool-tag regex parser
├── security/
│   ├── CredentialStore.mjs            # DPAPI encrypted key vault & .env loader
│   └── SsrGuard.mjs                   # DNS pre-flight private IP validator
├── research/
│   ├── DeepResearchOrchestrator.mjs   # 5-stage research pipeline
│   ├── QueryPlanner.mjs               # Multi-perspective Boolean decomposer
│   ├── DeduplicationEngine.mjs        # URL normalization, SHA-256 & SimHash
│   ├── ScrapingLadder.mjs             # Fast HTTP -> Jina reader -> fallback
│   ├── BilingualBM25.mjs              # Pure TypeScript BM25 (Arabic/English)
│   └── GroundingAudit.mjs             # Pre-allocated bracket validator & sanitizer
└── server/
    └── index.mjs                      # HTTP & WebSocket endpoints for UI
```

### 4.2 Frontend Components (React 18)
```
workstation/src/
├── components/
│   ├── SettingsModal.jsx              # Provider profiles & API keys dialog
│   ├── SubagentCard.jsx               # Inline timeline widget in Agent Canvas
│   ├── SubagentInspectorDrawer.jsx    # Slide-over live transcript & tool inspector
│   ├── AutonomyModeToggle.jsx         # Autonomous (YOLO) vs Supervised switch
│   └── EvidenceDrawer.jsx             # Grounded excerpts & source shelf viewer
```

---

## 5. Implementation Roadmap & Ticket Breakdown

- **Ticket 1 (#2.1)**: `StreamingToolAccumulator` & Provider Gateway Expansion (Kilo Gateway, OpenCode, Cline Bridge, fixed SSE argument parsing).
- **Ticket 2 (#2.2)**: `DPAPICredentialStore` & Settings Modal (Hardware-backed encrypted storage, provider profile dropdown, key inputs).
- **Ticket 3 (#2.3)**: Multi-Step Autonomous ReAct Loop with Dual Autonomy (YOLO vs Supervised, stop button, sliding window context compaction).
- **Ticket 4 (#2.4)**: `SubagentRuntime` & Event Bus (isolated async context, `invoke_subagent`, `transcript.jsonl` persistence, WebSocket event stream).
- **Ticket 5 (#2.5)**: Subagent Timeline Widget & Auxiliary Inspector Drawer UI (interactive timeline cards, deep-link navigation, live transcript stream).
- **Ticket 6 (#2.6)**: Deep Research Retrieval Plane & 3-Level Deduplication (Brave/Tavily/DDG search, canonical URL, SHA-256, 64-bit SimHash).
- **Ticket 7 (#2.7)**: SSRF-Safe Scraping Ladder & Bilingual BM25 Inverted Index (safe DNS, `linkedom`, Readability, Arabic/English Okapi BM25).
- **Ticket 8 (#2.8)**: Grounding Audit Engine & Verified Evidence Synthesis (pre-allocated brackets `[n]`, zero-hallucination regex audit, Evidence Drawer UI).
- **Ticket 9 (#2.9)**: End-to-End Integration, Parity Verification Suite & Version Bump to v0.2.0.
