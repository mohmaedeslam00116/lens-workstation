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
