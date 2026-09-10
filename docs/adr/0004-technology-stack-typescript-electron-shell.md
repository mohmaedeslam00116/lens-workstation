# ADR 0004: Technology Stack — TypeScript Full Stack + Electron Shell (Antigravity 2.0 Pattern)

## Status
Accepted

## Context
After investigating the real architectures of leading autonomous coding agent harnesses:

| Product | Core Language | Desktop Runtime | UI | Open Source? |
|---|---|---|---|---|
| **Antigravity 2.0** | TypeScript | Electron Shell + Local HTTP Server | React | No |
| **OpenAI Codex CLI** | Rust (100+ crates) | Native binary + JSON-RPC | Ratatui TUI | Yes |
| **Claude Code** | TypeScript | Node.js CLI | Ink (React for Terminal) | No |
| **Cline / Kilo Code** | TypeScript | VS Code Extension | React webview | Yes |

Key finding: Antigravity 2.0 uses Electron purely as a display shell. The React UI is served
over HTTP from a local Language Server process, not bundled inside app.asar. This decouples
the rendering layer from the engine completely.

## Decision
We adopt the **Antigravity 2.0 pattern**: TypeScript Full Stack with Electron Shell serving
a React UI from a local engine server.

### Canonical Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Language** | TypeScript (Full Stack) | Single type system across engine + UI; shared interfaces |
| **Desktop Shell** | Electron 29+ | Cross-platform native windowing; proven with Monaco + xterm.js |
| **UI Framework** | React 18 | Component model for Agent Canvas + Auxiliary Pane; RTL support |
| **Styling** | Tailwind CSS 4 | Utility-first; native rtl variant for Arabic parity |
| **Icons** | Lucide React | Lightweight, tree-shakeable, consistent |
| **Build** | Vite 6 + electron-vite | Fast HMR; parallel main/renderer builds |
| **Code Editor** | Monaco Editor (@monaco-editor/react) | VS Code-grade syntax, diff, and completions |
| **Terminal (Interactive)** | xterm.js + node-pty | Full PTY for developer terminal tabs |
| **Terminal (Agent)** | child_process.spawn (shell: false) | Structured execution with sanitized env |
| **LLM Providers** | Gemini, Claude, OpenAI, DeepSeek, Ollama | Unified multi-provider routing |
| **IPC / Protocol** | Local HTTP Server + WebSocket | Engine serves UI; real-time streaming via WS |
| **Package Manager** | npm | Standard Node.js ecosystem |
| **Test Runner** | Node.js built-in (node --test) | Zero-dependency, fast |
| **License** | Apache 2.0 | Permissive open-source |

### Architecture Pattern (Antigravity 2.0 Style)

The Electron process is a thin shell. It opens a BrowserWindow pointing to
http://127.0.0.1:PORT served by the Local Engine Server (Node.js).

The preload.js script exposes Electron-specific globals:
- electronStorage (persist settings)
- electronNotifications (OS alerts)
- electronDialogs (file picker, etc.)
- electronShell (open external links)

The Local Engine Server (Node.js) contains:
- Agent Core (Tool Loop) and Research Engine
- Filesystem (Atomic Transactions) and Terminal (Sandbox)
- Serves: React UI (static build) + API (REST endpoints + WebSocket streaming)

## Consequences
- **Positive**:
  - Mirrors the exact production pattern of Google Antigravity 2.0.
  - Engine and UI are fully decoupled: the engine can be tested, debugged, and
    even accessed from a browser without the Electron shell.
  - Single language (TypeScript) across the entire codebase.
  - Mature ecosystem for every layer (Monaco, xterm.js, node-pty).
- **Negative**:
  - No kernel-level sandboxing like Codex (Rust + Landlock/seccomp). We rely on
    sanitized environment allowlists and process-tree termination instead.
  - Electron bundles Chromium, resulting in larger installer size (~150MB).\n