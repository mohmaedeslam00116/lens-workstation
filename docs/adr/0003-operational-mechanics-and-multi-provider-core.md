# ADR 0003: Operational Mechanics — Thinking Stream, Semantic Mentions, Subagents & Multi-Provider Core

## Status
Accepted

## Context
Following ADR-0002, LENS Workstation requires concrete operational semantics to mirror the execution flow and capabilities of Google Antigravity 2.0 and OpenAI Codex:
1. Real-time chain-of-thought streaming with structured tool execution cards.
2. Semantic contextual mentions (`@file`, `@folder`, `@terminal`, `@docs`, `@git`) and workflow slash commands (`/research`, `/review`, `/test`).
3. Subagent spawning (`invoke_subagent`) and background task scheduling with reactive notification wakeups.
4. Unified multi-provider LLM routing (Gemini, Anthropic Claude, OpenAI, DeepSeek, Ollama local models).

## Decision
We establish the following execution mechanics:

### 1. Autonomous Streaming & Thought-to-Action Pipeline
- **Chain-of-Thought Streaming**: Internal reasoning tokens stream into a collapsible thinking block with live elapsed timer.
- **Autonomous Read-Only Progression**: Non-mutating tools (`view_file`, `grep_search`, `find_by_name`, `read_url_content`) execute automatically under `READ_ONLY_INSPECTION` grants, logging compact, expandable visual cards.
- **Human-in-the-Loop Interruption Gates**: Mutating actions (`propose_diff`, `run_command`) trigger an immediate pause, opening the Auxiliary Workstation Pane for developer review (`[Approve & Apply]`, `[Reject]`, `[Prompt Tweak]`).

### 2. Semantic Context Mentions & Slash Command Engine
- `@` trigger opens an inline autocomplete menu indexing:
  - `@file`, `@folder` (workspace paths).
  - `@terminal` (recent stdout/stderr digests).
  - `@docs` (external web and RFC citations).
  - `@git` (current diff and branch state).
- `/` trigger launches specialized sub-workflows (`/research`, `/review`, `/test`, `/goal`).

### 3. Native Subagent & Background Scheduling Engine
- Main agent can invoke specialized subagents (e.g. `research_agent`) that run concurrently in the background without blocking the UI.
- Background tasks (delayed timers, recurring monitors) emit reactive wakeups back into the session context without polling loops.

### 4. Unified Multi-Provider Routing
- A normalized provider interface maps tool calls, token streaming, and thinking blocks across:
  - Google Gemini (Gemini 1.5/2.0 Flash & Pro with native thinking).
  - Anthropic Claude (Claude 3.5 Sonnet / Haiku with thinking blocks).
  - OpenAI (GPT-4o, o1, o3-mini).
  - DeepSeek (DeepSeek-V3, DeepSeek-R1).
  - Local Ollama (Qwen 2.5 Coder, DeepSeek-Coder, Llama 3) for offline private development.

## Consequences
- Guarantees complete operational parity with Antigravity 2.0 and OpenAI Codex.
- Supports both cloud enterprise models and fully air-gapped/offline local models.
