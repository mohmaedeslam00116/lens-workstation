# CONTEXT.md — Ubiquitous Domain Model

## Core Domain Concepts

### LENS Workstation
The autonomous developer research and coding agent harness. An Electron desktop application inspired by Google Antigravity 2.0 and OpenAI Codex, combining an autonomous agent canvas, Monaco multi-file diff reviewer, sandboxed terminal, deep web research retrieval, and an autonomous coding agent loop.

### AgentCanvas
The primary central interactive surface in LENS Workstation where developer prompts, agent thinking (`thought` streams), action plans, subagent reports, and inline tool execution cards are rendered in real time.

### AuxiliaryWorkstationPane
The secondary collapsible/expandable multi-tab surface operating beside the Agent Canvas:
- **`Changes / Diffs`**: Multi-file Monaco Diff Editor for inspecting and tweaking proposed change sets before approval.
- **`Terminal`**: Live process execution stream with sanitized environment controls and process-tree lifecycle monitoring.
- **`Evidence & Docs`**: Live research claims and documentation citations, visually labeled as `[contentIsUntrusted: true]`.
- **`Artifacts`**: Interactive markdown documents, execution plans, and architecture diagrams.

### TurnLifecycle
The deterministic execution loop of an agent turn:
1. **User Prompt & Mentions**: Input with `@` context attachments and `/` slash commands.
2. **Streaming Thought & Plan**: Model emits real-time chain-of-thought and structured plan.
3. **Autonomous Tool Calls**: Model calls typed tools with live card updates.
4. **Human-In-The-Loop Checkpoint**: If a tool mutates files or runs shell commands, execution halts for developer approval or guidance.
5. **Reactive Wakeup**: Asynchronous tasks, subagents, or user approvals trigger immediate turn resumption without polling.

### Privileged Policy Layer
The authoritative security evaluation engine that governs all tool execution, filesystem mutations, and terminal invocations. External research data is classified as untrusted (`contentIsUntrusted: true`). Untrusted content cannot grant, elevate, or synthesize execution capabilities.

### EvidenceBundle
An immutable, versioned, cryptographic data artifact produced by the Research Loop (`Loop 1`) and handed off to the Coding Loop (`Loop 2`).
- Contains verified claims, exact quotations, API signatures, source URLs, and SHA-256 integrity digests.
- Marked with `contentIsUntrusted: true` to enforce strict isolation against prompt injection.

### Stratified On-Demand Claims
An architectural mechanism to prevent context window bloat and prompt-injection vectors. The Coding Loop receives a high-level claims index and queries detailed excerpts on-demand per task via `get_evidence_detail(claimId)`.

### CapabilityGrant
A bounded, policy-evaluated permission ticket authorizing a specific action or class of actions:
- `READ_ONLY_INSPECTION`: File reads, AST parsing, Ripgrep, and directory listing.
- `MUTATING_FILE_WRITE`: Atomic, hash-validated change sets.
- `RESTRICTED_TERMINAL_COMMAND`: Fixed executable, structured arguments, sanitized environment, timeout, and process-tree termination.

### AtomicChangeSet
A proposed modification spanning one or more workspace files, presented as a unified multi-file diff:
- **Pre-Write Validation**: Base file SHA-256 hash must match disk state.
- **All-or-Nothing Application**: Either all files are updated cleanly or none are modified.
- **Rollback Snapshot**: Persisted manifest enabling instant 1-click rollback.

### RollbackManifest
A persistent JSON manifest stored in `<workspace>/.lens/transactions/tx-<id>.json` recording transaction metadata (id, timestamp, files modified, base SHA-256 hashes, target SHA-256 hashes, and inverse diffs) enabling instant reversal.

### RepoSnapshotHash
A cryptographic hash representing the clean state of the workspace files. Verified before proposing or applying changes to detect out-of-band developer edits and prevent stale-plan merge collisions.

### ProjectSession
A unified workspace container persisted under `<workspace>/.lens/sessions/` that links technical research sessions with multiple downstream coding sessions.

### DualLoopOrchestrator
The runtime supervisor coordinating:
1. **Research Loop (Loop 1)**: Web scraping, BM25 retrieval, document ranking, and evidence claims synthesis.
2. **Coding Loop (Loop 2)**: Repo inspection, change set generation, user approval gates, transaction execution, and terminal verification.

### SubagentRuntime
The isolated asynchronous sub-process and context runner executing delegated tasks (such as `research`, `code_reviewer`, or `general`). Operates with its own lifecycle, session transcript (`transcript.jsonl`), and WebSocket event emitter without blocking the primary agent loop.

### SubagentTimelineWidget
An interactive timeline card rendered within the Agent Canvas stream upon invocation of `invoke_subagent`. Displays real-time role identity, active tool status (`stateDetail`), execution timer, and deep-link navigation to the subagent's inspector.

### AuxiliaryInspectorDrawer
A slide-over diagnostic and observation panel appearing on the right side of the interface when inspecting an active or completed subagent. Renders the live transcript stream, reasoning steps, tool invocations, scraped contents, and extracted citations.

### StreamingToolAccumulator
A stateful chunk accumulator residing in the `MultiProviderGateway` that buffers fragmented SSE streaming arguments from OpenAI and Kilo Gateway, resolving complete tool invocations and preventing JSON parsing syntax errors.

### DPAPICredentialStore
A secure local credential vault utilizing Electron `safeStorage` (backed by Windows Data Protection API) to encrypt API keys at rest in `%APPDATA%\LENS\credentials.enc` with automatic environment variable fallback.

### SlidingToolWindowCompactor
A context management subsystem within the ReAct loop that keeps the initial task and the 3 most recent tool results in full detail, while compressing older tool outputs into 1-line semantic summaries to prevent context exhaustion.

### MultiTierExtractionLadder
A fault-tolerant web scraping pipeline executing a 3-tier fallback sequence: Tier 1 fast HTTP fetch with `linkedom` DOM emulation; Tier 2 markdown reader proxy (`r.jina.ai`) upon 403/Cloudflare blocks; Tier 3 graceful bypass.

### BilingualBM25Index
A pure TypeScript in-memory inverted index implementing Okapi BM25 scoring with native text normalization for both Arabic (diacritic, tatweel, Alef, and Taa Marbuta normalization) and English.

### ZeroHallucinationGroundingAudit
A post-synthesis deterministic audit pass that cross-references all bracketed citations `[n]` against the pre-allocated immutable `GroundedExcerpt` pool, stripping or re-grounding any unverified claims before presentation.

