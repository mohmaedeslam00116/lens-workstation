# ADR 0002: Antigravity & Codex-Style Autonomous Agent Harness Architecture

## Status
Accepted

## Context
Traditional AI coding tools (such as Cursor or GitHub Copilot in VS Code) treat the code editor as the primary surface, confining the AI assistant to a secondary chat panel on the side. 

In contrast, modern autonomous developer harnesses—exemplified by **Google Antigravity 2.0** and **OpenAI Codex App**—invert this paradigm:
1. The **Agent Canvas & Task Stepper** is the central primary surface where the user prompts, plans, reviews autonomous tool actions, inspects research claims, and grants execution permissions.
2. The **Auxiliary Workstation Pane** (Monaco Diff Viewer, sandboxed terminal stream, evidence drawer, and artifacts) operates in concert with the agent loop, automatically opening or focusing when file diffs, command executions, or research evidence require review.
3. The developer operates primarily as an architect and reviewer, guiding high-level intent, verifying research grounding, and approving atomic change sets.

## Decision
We adopt the **Antigravity 2.0 / Codex Harness Architecture** as the foundational operational and interface model for LENS Workstation:

### 1. Unified Interface Surfaces
- **Left-Hand Control Sidebar**:
  - Workspace / Project switcher.
  - Active and historical session threads (`.lens/sessions/`).
  - Project file tree with Git status badges.
  - Capability grant settings & security policy panel.
  - Skills and MCP tool manager.
- **Central Agent Canvas**:
  - Live token streaming for model responses, chain-of-thought (`thinking`), and plan execution.
  - Interactive, compact tool execution cards (`view_file`, `search_web`, `run_command`, `propose_diff`).
  - Rich markdown formatting with LaTeX (KaTeX) and Mermaid diagrams.
  - `@mention` auto-complete for files, folders, past sessions, and tools.
  - `/slash` command shortcuts.
- **Auxiliary Workstation Pane (Right / Split Pane)**:
  - Tabbed interface containing:
    1. `Changes / Diffs`: Monaco Diff Editor with side-by-side / inline review, SHA-256 pre-check, and inline quick tweaks before approving.
    2. `Terminal`: Live ANSI terminal stream (`node-pty` for user, sanitized `child_process` for agent).
    3. `Evidence & Docs`: Live citation viewer for external research claims marked `[contentIsUntrusted: true]`.
    4. `Artifacts`: Interactive markdown artifacts, walkthroughs, and inspection reports.

### 2. Operational & Execution Model
- **Turn-Based Agent Loop with Reactive Streaming**:
  - Model generates structured tool calls.
  - Read-only tools (`view_file`, `grep_search`, `read_url_content`) execute automatically under `READ_ONLY_INSPECTION` grant and render compact collapsibles.
  - Mutating tools (`propose_diff`, `run_command`) trigger human-in-the-loop checkpoints:
    - Code modifications open in the Auxiliary Monaco Diff tab with `[Approve & Apply]` / `[Reject]`.
    - Terminal executions display sanitized env and command parameters with `[Run Command]` / `[Cancel]`.
- **Atomic Reversible Transactions**:
  - Every applied patch writes a `.lens/transactions/tx-<id>.json` manifest for 1-click rollback.
- **Subagent & Background Task Orchestration**:
  - The harness supports spawning specialized subagents (e.g., background research agents) and scheduling background tasks (timers/cron) with reactive notification wakeup.

## Consequences
- **Positive**:
  - Eliminates the cognitive clutter of traditional IDEs when working with autonomous agents.
  - Places autonomous technical research and code verification at the center of the developer experience.
  - Guarantees complete safety and reversibility through human-in-the-loop checkpoints.
  - Mirrors the proven UX patterns of Antigravity 2.0 and OpenAI Codex.
- **Negative**:
  - Requires building a dedicated tabbed auxiliary pane system and multi-stream IPC bridge between the Electron engine and React renderer.
