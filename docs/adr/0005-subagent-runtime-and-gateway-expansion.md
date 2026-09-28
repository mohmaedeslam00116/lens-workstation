# ADR 0005: Subagent Runtime System, Provider Gateway Expansion (Kilo, OpenCode, Cline), and Credential Protection

## Status
Accepted

## Context
Following the implementation of the core desktop harness in v0.1.0, user requirements and primary-source architectural investigations (`docs/research/research-engine-and-gateways.md`) revealed critical operational gaps:
1. **Mock Default Provider**: The default runtime provider returned canned responses without connecting to real LLM engines, lacking an in-UI Settings modal for API keys.
2. **Provider Gateway Breadth**: Users require first-class support for modern AI routing gateways: **Kilo Gateway** (`api.kilo.ai`), **OpenCode** (`anomalyco/opencode`), and **Cline** (`cline/cline`), alongside direct models (Gemini, Claude, OpenAI, DeepSeek, and local Ollama).
3. **Streaming Tool Fragment Bug**: In OpenAI/Kilo SSE streaming, tool calls arrive in partial string fragments across multiple packets; premature `JSON.parse` invocations crash the stream.
4. **Credential Security**: Storing API keys in plain text risks leakage; Windows desktop applications must leverage hardware-backed DPAPI encryption.
5. **Subagent UX & Runtime (Antigravity Parity)**: Rather than isolating tasks into disjoint windows, autonomous deep operations (such as deep web research or code review) must spawn dedicated **Subagents** (`invoke_subagent`), rendering live timeline cards with deep-links (`lens://conversation/<subagent-id>`) and sliding an Auxiliary Inspector Drawer for real-time observability.
6. **Multi-Turn Context Management**: ReAct loops executing up to 30–50 steps suffer from token bloat; older tool outputs must be compressed while preserving model reasoning and user goals.

## Decision

### 1. Expanded Provider Hub & Streaming Tool Accumulator
- **Dedicated Provider Profiles**: The in-UI Settings modal exposes one-click profiles for:
  - **Kilo Gateway**: Pre-configured `https://api.kilo.ai/api/gateway/v1/chat/completions`, model namespacing (`anthropic/claude-3-7-sonnet`, `deepseek/deepseek-chat`), and automatic catalog discovery via `GET /models`.
  - **OpenCode**: Flexible base URL, custom headers, and `opencode.json` configuration compatibility.
  - **Cline Bridge**: Universal prompt parsing supporting both Anthropic/OpenAI native function calls and Cline-style XML `<tool_name><param>...</param></tool_name>` fallback blocks.
  - Direct providers: Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and local Ollama (`http://127.0.0.1:11434/v1`).
- **Stateful `StreamingToolAccumulator`**: Buffers partial `delta.tool_calls[i].arguments` fragments across SSE packets and validates complete JSON payloads before yielding `tool_call` turn events.

### 2. Windows DPAPI Credential Storage
- Credentials are encrypted at rest using Electron's `safeStorage` API backed by Windows Data Protection API (DPAPI).
- Persisted locally under `%APPDATA%\LENS\credentials.enc` with automatic loading fallback to workspace `.env` and `process.env`.

### 3. Dual-Autonomy ReAct Loop & Smart Context Compaction
- **Autonomous vs. Supervised Modes**:
  - *Read & Search Tools* (`view_file`, `list_files`, `grep_search`, `web_search`, `fetch_web_content`): Always execute automatically.
  - *Mutating & Terminal Tools* (`apply_diff`, `execute_command`): Controlled by a top-bar mode switch. In "Autonomous (YOLO)" mode, actions execute automatically up to a turn limit with an instant red Stop button; in "Supervised" mode, actions pause for developer approval cards.
- **Sliding Tool Output Window**: Retains system instructions, user prompt, and the 3 most recent tool call outputs in full. Older tool results are compacted into 1-line summary tokens (`[Tool read_file "x" returned 120 lines - analyzed]`), reducing prompt size by up to 70%.
- **Checkpoint Summarization**: When cumulative tokens reach 80% of model context limits, the loop synthesizes an in-line progress checkpoint to reset working memory.

### 4. Antigravity-Style Subagent System
- **`invoke_subagent` Tool**: Available to the primary agent loop with signature:
  `invoke_subagent({ typeName: "research" | "code_reviewer" | "general", role: string, prompt: string })`
- **Subagent Timeline Widget**: When invoked, the main chat timeline renders an interactive card showing the subagent's role, live spinning indicator with `stateDetail` (e.g., `searching: "Kilo Gateway"...`), and elapsed timer.
- **Auxiliary Inspector Drawer**: Clicking the widget slides open a dedicated side inspector drawer displaying the subagent's live `transcript.jsonl`, reasoning stream, search queries, and citation cards without navigating away from the main agent.
- **Core Archetypes Built-In**:
  - `research`: Autonomous deep web research engine.
  - `code_reviewer`: Change set and security auditor.
  - `general`: Parallel background file/test worker.
- **Process Isolation & Event Bus**: Each subagent runs in an isolated asynchronous context, emitting events (`subagent:started`, `subagent:step`, `subagent:done`, `subagent:failed`) over the internal WebSocket bus.

## Consequences
- Transforms LENS Workstation from a static UI shell into a living, multi-model agent environment.
- Eliminates JSON stream fragmentation errors when routing through Kilo Gateway and OpenAI.
- Ensures developer credentials remain cryptographically protected on Windows.
- Delivers complete subagent observability matching the Google Antigravity 2.0 desktop experience.
