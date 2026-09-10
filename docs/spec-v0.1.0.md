## Problem Statement

LENS Workstation exists today only as architectural decision records and a single React prototype component. There is no runnable application — no Electron shell, no local engine server, no agent loop, no Monaco editor integration, no terminal, and no LLM provider connectivity. A developer cannot open the application, type a prompt, and observe an autonomous agent researching, proposing code changes, or executing sandboxed commands.

## Solution

Build the foundational v0.1.0 of LENS Workstation: a fully functional Electron desktop application following the Antigravity 2.0 pattern (ADR-0004) where a thin Electron Shell loads the React UI from a Local Engine Server over HTTP, with real-time agent streaming over WebSocket. The developer can open the app, select a workspace, choose an LLM provider, type a prompt, watch the agent think and execute read-only tools autonomously, and review proposed file changes in a Monaco Diff Editor before approving or rejecting them.

## User Stories

1. As a developer, I want to launch LENS Workstation and see the Agent Canvas with a prompt input box, so that I can start an autonomous coding session immediately.
2. As a developer, I want to select and switch between workspace projects from the left sidebar, so that the agent operates on the correct codebase.
3. As a developer, I want to choose my preferred LLM provider (Gemini, Claude, OpenAI, DeepSeek, or Ollama) and enter my API key in Settings, so that I can use any model I trust.
4. As a developer, I want to type a prompt and see the agent's chain-of-thought stream in real time with a collapsible thinking block and elapsed timer, so that I understand the agent's reasoning.
5. As a developer, I want read-only tool calls (view_file, grep_search, find_by_name, list_dir) to execute automatically and render as compact expandable cards in the Agent Canvas, so that inspection does not interrupt my flow.
6. As a developer, I want mutating actions (propose_diff, run_command) to pause execution and open the Auxiliary Workstation Pane with a human-in-the-loop checkpoint, so that I maintain full control over filesystem and terminal mutations.
7. As a developer, I want to review proposed file changes in the Monaco Diff Editor (side-by-side view) within the Changes/Diffs tab of the Auxiliary Pane, so that I can inspect exactly what the agent wants to modify.
8. As a developer, I want to make small inline tweaks directly in the Monaco Diff Editor before clicking Approve, so that I can fix minor issues without re-prompting the agent.
9. As a developer, I want a single atomic [Approve & Apply] button that applies the entire multi-file change set with SHA-256 pre-write validation, so that partial corrupt states are impossible.
10. As a developer, I want a persistent [Undo Last Transaction] button that instantly reverts the last applied change set using the RollbackManifest, so that mistakes are trivially reversible.
11. As a developer, I want to see terminal command output in the Terminal tab of the Auxiliary Pane, with the sanitized environment variables listed before execution, so that I can verify no secrets leak.
12. As a developer, I want to cancel a running terminal command and have the entire process tree terminated (including child processes), so that no orphaned daemons consume resources.
13. As a developer, I want external research evidence displayed in the Evidence & Docs tab with visible [External Evidence - Untrusted] badges on every claim, so that I never confuse agent-generated content with verified facts.
14. As a developer, I want to click any evidence citation in the Agent Canvas and have it navigate to the exact excerpt in the Evidence & Docs tab, so that I can verify the source.
15. As a developer, I want to use @file and @folder mentions in the prompt input to attach workspace context, so that the agent receives targeted information.
16. As a developer, I want to use /research and /review slash commands to trigger specialized agent workflows, so that I can delegate complex multi-step tasks.
17. As a developer, I want the application to support both Arabic (RTL) and English (LTR) interfaces with seamless switching, so that I can work in my preferred language.
18. As a developer, I want the active CapabilityGrant level (READ_ONLY_INSPECTION vs MUTATING_FILE_WRITE) to be prominently displayed in the header bar, so that I always know the agent's current permission scope.
19. As a developer, I want my session history persisted under .lens/sessions/ so that I can resume previous research and coding sessions.
20. As a developer, I want the Local Engine Server to start automatically when I launch the Electron app and shut down cleanly when I close it, so that there are no orphaned server processes.

## Implementation Decisions

### Architecture (from ADR-0001 through ADR-0004)

- **Antigravity 2.0 Pattern**: Electron is a thin shell that opens a BrowserWindow pointing to http://127.0.0.1:PORT. The Local Engine Server (Node.js/TypeScript) serves the static React build AND exposes REST + WebSocket API endpoints. preload.js exposes Electron-specific globals (storage, notifications, dialogs, shell) to the renderer.

- **Dual-Loop Orchestration**: The DualLoopOrchestrator coordinates Research Loop (BM25, web scraping, evidence synthesis) and Coding Loop (repo inspection, change set generation, approval gates, transaction execution). The handoff is an immutable EvidenceBundle marked contentIsUntrusted: true.

- **Hexagonal Agent Core**: The AgentRuntime in engine/core/ depends only on typed port interfaces (RepoInspectionPort, ResearchRetrievalPort, TelemetryPort, CancellationPort). Zero imports from Electron or VS Code APIs.

- **TurnLifecycle**: Each agent turn follows: User Prompt -> Streaming Thought -> Autonomous Tool Calls (read-only auto-execute) -> Human-in-the-Loop Checkpoint (mutating actions) -> Reactive Wakeup (subagent/task completion).

### Module Topology

- **engine/core/**: AgentRuntime, TurnLifecycle state machine, tool registry, typed port interfaces.
- **engine/research/**: BM25 indexer, ScraperPool, EvidenceBundle synthesis, Stratified On-Demand Claims.
- **engine/filesystem/**: AtomicChangeSet applicator, SHA-256 pre-write validation, RollbackManifest generator, RepoSnapshotHash calculator.
- **engine/terminal/**: SanitizedProcessRunner (child_process.spawn with strict allowlist env), CrossPlatformProcessTreeTerminator (taskkill /T /F on Windows, negative PID SIGKILL on Unix).
- **engine/providers/**: Unified multi-provider LLM router with normalized streaming interface (Gemini, Claude, OpenAI, DeepSeek, Ollama).
- **engine/server/**: Local HTTP + WebSocket server serving React static build and API endpoints.
- **workstation/electron/**: Electron main process, preload.js, BrowserWindow lifecycle.
- **workstation/src/**: React 18 UI — AgentCanvas, AuxiliaryWorkstationPane (Changes/Diffs, Terminal, Evidence, Artifacts tabs), LeftSidebar, PromptInput with @mentions and /commands.

### Security Boundaries

- CapabilityGrant system enforces READ_ONLY_INSPECTION as default. MUTATING_FILE_WRITE and RESTRICTED_TERMINAL_COMMAND require explicit user approval per-action.
- Environment sanitization uses strict allowlist (PATH, SYSTEMROOT, TEMP, TMP, LANG, SHELL only). All API keys, SSH sockets, and cloud tokens are stripped before spawning child processes.
- Agent-driven commands use child_process.spawn with shell: false and structured string[] arguments. No raw shell string concatenation.

### Prototype Decision

The interactive React prototype (WorkstationView.tsx, Variant A: Classic 3-Column IDE) was built in the previous repository. The layout decisions from Variant A are superseded by ADR-0002 (Antigravity/Codex Agent Canvas pattern), but the security UX elements (atomic approval cards, untrusted evidence badges, undo transaction buttons) carry forward directly.

## Testing Decisions

### Testing Philosophy
- Test external behavior through the four architectural seams, not internal implementation details.
- Tests must be deterministic with zero network dependencies (mock all LLM providers and web scrapers).
- Use Node.js built-in test runner (node --test) with zero external test framework dependencies.

### Testing Seams

1. **Agent Core via Typed Ports (Primary Seam)**: Test the complete AgentRuntime turn lifecycle by injecting mock port implementations. Verify: tool call sequencing, thinking stream emission, human-in-the-loop checkpoint triggering for mutating tools, cancellation propagation, and multi-turn state management.

2. **Local Engine Server API Contract**: Test REST and WebSocket endpoints directly against the running server (no Electron). Verify: session creation, prompt submission, streaming event delivery, change set proposal/approval/rejection API, and terminal command lifecycle.

3. **Atomic Filesystem Transactions**: Test AtomicChangeSet and RollbackManifest against temporary workspace directories. Verify: SHA-256 pre-write validation rejects stale files, multi-file atomic application succeeds or fails cleanly, rollback restores exact original state byte-for-byte.

4. **Sanitized Terminal Execution**: Test SanitizedProcessRunner and CrossPlatformProcessTreeTerminator. Verify: sensitive environment variables are absent from child process, process tree termination kills all descendants, timeout enforcement works correctly.

## Out of Scope

- Tree-sitter AST parsing for syntax-aware chunking (future enhancement).
- MCP (Model Context Protocol) server registry and community extensions.
- Cloud-hosted or SaaS deployment — LENS Workstation is strictly a local desktop application.
- Kernel-level sandboxing (Landlock, seccomp, Seatbelt) — we use sanitized environment allowlists and process-tree termination instead (see ADR-0004 trade-off).
- Mobile or tablet form factors.
- Plugin marketplace or extension API.
- Git operations beyond status badge display (no auto-commit, no push).

## Further Notes

- This spec covers **v0.1.0** — the minimum viable autonomous agent workstation. It must be possible to: launch the app, connect to an LLM, prompt the agent, watch it think and inspect files, review proposed diffs in Monaco, approve/reject changes atomically, and undo transactions.
- All four ADRs (0001-0004) are binding architectural constraints for this implementation.
- Bilingual Arabic/English parity is a first-class requirement, not a follow-up. RTL layout and Cairo typography must work from day one.
- The Local Engine Server must be testable and usable without Electron (browser-accessible at http://127.0.0.1:PORT) per the Antigravity 2.0 pattern.
