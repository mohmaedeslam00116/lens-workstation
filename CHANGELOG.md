# Changelog

All notable changes to **LENS Workstation** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **SSRF-Safe Scraping Ladder & Bilingual BM25 Inverted Index (`SsrfGuard.mjs`, `ScrapingLadder.mjs`, `BilingualBM25.mjs`)** (#29): Pre-flight DNS validation guard blocking loopback, RFC 1918 private networks, link-local, and cloud metadata IPs (169.254.169.254) with IPv4 CIDR range matching and IPv6 prefix blocking. 3-tier content extraction ladder: Tier 1 direct HTTP fetch with linkedom DOM emulation, @mozilla/readability article isolation, and Turndown GFM markdown serialization with hard page budget (2,000-12,000 chars); Tier 2 automatic fallback to Jina reader proxy (r.jina.ai) on HTTP 403/429/Cloudflare blocks; Tier 3 graceful skip with structured failure metadata. Pure TypeScript bilingual inverted index with Okapi BM25 scoring (k1=1.2, b=0.75), Arabic normalization (tashkeel/tatweel/Alef/Taa Marbuta stripping, light prefix-stemming), English Porter-like stemming and stopword removal, Reciprocal Rank Fusion (RRF k=60) for multi-ranker merging, and Maximal Marginal Relevance (MMR lambda=0.7) diversity selection.
- **Deep Research Retrieval Plane & 3-Level Deduplication Engine (`QueryPlanner.mjs`, `DeduplicationEngine.mjs`, `SearchPlane.mjs`)** (#28): Multi-perspective Boolean research query planner (Technical, Performance, Security simulation), zero-config web retrieval adapters (DuckDuckGo, SearXNG, arXiv), commercial search adapters (Brave Search LLM Context API, Tavily Search API), bounded-concurrency search plane supervisor with automatic fallback, and comprehensive 3-level deduplication engine (Level 1 Canonical URL with tracking parameter stripping, Level 2 exact Unicode-normalized SHA-256 digest, and Level 3 64-bit SimHash near-duplicate detection with Arabic morphological normalization).
- **Subagent Timeline Widget & Auxiliary Inspector Drawer UI (`SubagentCard.tsx`, `SubagentInspectorDrawer.tsx`)** (#27): Interactive timeline cards rendered directly inside the Agent Canvas for spawned subagents, featuring archetype badges (research, code reviewer, general), animated live spinner, real-time elapsed timer, live stateDetail updates, direct stop button, and deep-link navigation (`lens://conversation/<id>`). Slide-over auxiliary inspector drawer streaming live `transcript.jsonl` entries (thoughts, tool invocations, execution results, assistant synthesis, errors) with 1-click URI copying, stop subagent action, and bilingual English LTR / Arabic RTL layout.
- **SubagentRuntime & EventBus Isolation Engine (`SubagentRuntime.mjs`, `EventBus.mjs`)** (#26): Spawn and coordinate isolated child agent contexts (`research`, `code_reviewer`, `general`) with scoped toolsets and permission isolation (read-only for research/reviewers, preventing mutation leaks). Structured streaming session persistence to `transcript.jsonl` with tool call tracking, native `invoke_subagent` main agent tool, REST endpoints (`GET /api/subagents`, `GET /api/subagents/:id`, `GET /api/subagents/:id/transcript`, `POST /api/subagents/:id/kill`), and WebSocket real-time lifecycle event broadcasting.
- **Multi-Step Autonomous ReAct Loop (`AgentRuntime.mjs`)** (#25): Multi-turn reasoning loop cycling through model thoughts, tool calls, and tool results up to configurable `maxTurns` (default 30) with clean termination.
- **Dual Autonomy Governance (YOLO vs Supervised)** (#25): Configurable execution modes allowing autonomous execution of mutating actions in YOLO mode or interactive approval checkpoints in Supervised mode.
- **Instant Stop / Cancel Preemption** (#25): WebSocket `stop_turn` / `cancel_turn` and REST `POST /api/turn/cancel` handlers with reactive CancellationToken aborting turns immediately.
- **Sliding Tool Window Compactor (`ContextCompactor.mjs`)** (#25): Retains system prompt and initial task, preserves 3 most recent tool results in full, compresses older tool outputs to 1-line summaries, and triggers checkpoint summary at 80% model token limit.
- **Autonomy Mode UI Controls (`AutonomyModeToggle.tsx`)** (#25): In-UI toggle switch and instant animated STOP button integrated into `Header` and `PromptInput` with full English/Arabic localization.
- **Hardware-Backed Credential Storage (`DPAPICredentialStore.mjs`)** (#24): Windows DPAPI encryption via `safeStorage` at rest with masked API key exposure and `.env` fallback.
- **Provider Settings Modal (`SettingsModal.tsx`)** (#24): Dialog for switching between providers (Kilo, OpenCode, Cline, Gemini, Claude, OpenAI, DeepSeek, Ollama) and entering API keys.
- **Streaming Tool Accumulator & Gateway Expansion** (#23): Stateful SSE chunk assembler for OpenAI and Kilo Gateway, dedicated Kilo Gateway provider with catalog discovery, OpenCode bridge, and Cline XML parser.

## [0.1.0] - 2026-09-28

### Added
- Initial project scaffolding for **LENS Workstation** (Autonomous Developer Research & Coding Agent Harness).
- Strict CodeRabbit security and architectural policy configuration (`.coderabbit.yaml`).
- Operational guidelines and agent standards (`AGENTS.md`).
- Ubiquitous domain terminology and boundary models (`CONTEXT.md`).
- Architecture Decision Records (`docs/adr/0001` through `docs/adr/0004`).
- Scaffolded modern dual-environment build toolchain (Vite 5, TypeScript 5.3, Tailwind CSS, PostCSS, React 18, Electron 29).
- Dual TypeScript configuration (`tsconfig.json` for frontend DOM, `tsconfig.node.json` for Node.js engine and Electron).
- Added zero-dependency Node.js test suite runner (`node --test`) with automated smoke testing.
- Created root HTML shell, initial React 18 App entry, and hexagonal engine core types (`engine/core/types.ts`).
- Implemented Local Engine Server (`engine/server/index.mjs`) hosting HTTP REST endpoints (`/health`, `/api/workspace`), SPA static asset serving with fallback routing, and WebSocket RPC streaming on `/ws` with broadcast event dispatch.
- Implemented decoupled Agent Core loop (`engine/core/runtime.mjs`) with `TurnLifecycle` state machine, hexagonal ports (`RepoInspectionPort`, `TelemetryPort`, `CancellationPort`), standard read-only inspection tools, and human-in-the-loop approval checkpoints for mutating operations.
- Implemented Multi-Provider LLM Streaming Gateway (`engine/providers/index.mjs`) normalizing streaming tokens, reasoning thoughts, and structured tool calls across Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and Ollama.
- Implemented Electron desktop shell (`workstation/electron/main.ts`) supervising local `EngineServer` lifecycle, native `BrowserWindow` windowing, and secure context-isolated preload bridge (`workstation/electron/preload.ts`) exposing `electronDialogs`, `electronStorage`, `electronNotifications`, and `electronShell` APIs.
- Implemented Sanitized Terminal execution engine (`engine/terminal/runner.mjs`) with strict environment variable allowlist stripping credentials and secrets, total output byte truncation safeguards, and cross-platform process-tree termination (`engine/terminal/tree-killer.mjs`).
- Implemented Atomic Filesystem & Rollback Engine (`engine/filesystem/engine.mjs`) featuring pre-write SHA-256 integrity validation, all-or-nothing multi-file atomic transactions, persistent `.lens/transactions/tx-<id>.json` rollback manifests, and 1-click byte-for-byte state reversion.
- Implemented React 18 Workstation UI (`workstation/src/`) featuring central Agent Canvas, collapsible thinking blocks, tool execution cards with human-in-the-loop approval checkpoints, PromptInput dock with @mentions and /slash commands, and collapsible Auxiliary Pane with Monaco Diff Editor (`@monaco-editor/react`), live terminal output, evidence tabs, and bilingual English LTR / Arabic RTL layout.
- Wired complete end-to-end subsystem integration (`engine/server/index.mjs`) connecting Agent Core runtime, scoped WorkspaceInspectionPort, SanitizedProcessRunner, AtomicTransactionEngine, and WebSocket client communication.
- Implemented `WorkspaceInspectionPort` (`engine/core/inspection.mjs`) enforcing strict workspace root scoping, path traversal defenses, text preview slicing, and exclusion of build artifacts.
- Created end-to-end system integration test suite (`test/workstation/e2e-integration.test.mjs`) verifying WebSocket connection handshakes, autonomous inspection turns (`/plan`), human-in-the-loop tool checkpoints with live streaming terminal logs (`/test`), diff preview proposing with atomic transaction application, and 1-click byte-for-byte filesystem rollback (`/rollback`).
- Configured electron-builder desktop packaging pipeline and verified production unpacked Windows build generation (`dist-installer/win-unpacked/LENS Workstation.exe`).

