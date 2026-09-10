# LENS Workstation

> **Research, in focus.** | **نظرة أعمق. فهم أوضح.**
>
> Autonomous Developer Research & Coding Agent Harness

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-29-blueviolet.svg)](https://www.electronjs.org/)
[![Monaco Editor](https://img.shields.io/badge/editor-Monaco-blue.svg)](https://microsoft.github.io/monaco-editor/)
[![CodeRabbit](https://img.shields.io/badge/reviewed_by-CodeRabbit-orange.svg)](https://coderabbit.ai)

---

## What is LENS Workstation?

**LENS Workstation** is an autonomous desktop environment designed for software engineers. It fuses deep technical internet research (live web documentation, RFCs, GitHub issues, release notes) with an autonomous coding agent harness (Monaco Editor, multi-file atomic diff reviewer, sandboxed terminal, and 1-click transaction rollback).

Unlike generic AI coding assistants or heavy VS Code forks, LENS Workstation provides a purpose-built, lightweight desktop runtime with a **Privileged Policy Layer**:
- **Dual-Loop Architecture**: High-trust technical research synthesizes an immutable, typed `EvidenceBundle` (`contentIsUntrusted: true`) to inform code generation without exposing the agent to prompt-injection vulnerabilities.
- **Reversible Atomic Modifications**: Multi-file patches are presented as atomic change sets with base-hash validation and 1-click transaction undo.
- **Sandboxed Process Terminal**: Child processes execute in a strictly sanitized environment with guaranteed cross-platform process-tree termination (no orphaned background daemons).
- **Classic 3-Column Workstation**: Modern dark IDE with Monaco multi-tab editor, git status badges, collapsible terminal, and evidence shelf.

---

## Architectural Topology

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        LENS Desktop Workstation                        │
│                                                                        │
│  ┌──────────────────┐  ┌────────────────────────┐  ┌────────────────┐  │
│  │   File Explorer  │  │  Monaco Editor & Diff  │  │  Agent Sidecar │  │
│  │                  │  │                        │  │                │  │
│  │  • Git status    │  │  • Multi-tab editing   │  │  • Task Stepper│  │
│  │  • Workspace tree│  │  • Side-by-side Diffs  │  │  • Grant Status│  │
│  │  • Hash badge    │  │  • Pre-write SHA-256   │  │  • Atomic Apply│  │
│  └──────────────────┘  └────────────────────────┘  └────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Bottom Drawer: Terminal & Evidence Shelf            │  │
│  │   • Sandboxed Process Terminal (Zero-Leakage Sanitized Env)      │  │
│  │   • Evidence Shelf (Untrusted Claims with Exact Source Links)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────▲─────────────────────┘
                                                   │ IPC / Typed Ports
┌──────────────────────────────────────────────────▼─────────────────────┐
│                    Privileged Native Engine Core                       │
│                                                                        │
│  ┌────────────────────────┐                  ┌──────────────────────┐  │
│  │  Loop 1: Research      │                  │  Loop 2: Coding Loop │  │
│  │                        │                  │                      │  │
│  │  • Okapi BM25 Indexer  │  EvidenceBundle  │  • Headless Agent    │  │
│  │  • ScraperPool         ├─────────────────►│  • Hexagonal Ports   │  │
│  │  • Claims Synthesis    │  [Untrusted Data]│  • Atomic Rollback   │  │
│  └────────────────────────┘                  └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Core Tenets

1. **Least Privilege & Prompt Injection Defense**:
   External web research is always classified as untrusted data (`contentIsUntrusted: true`). External content cannot autonomously escalate execution capabilities.
2. **Atomic & Reversible**:
   Every change set verified against base file SHA-256 hashes. If any file fails, the transaction aborts cleanly. Every applied patch can be reverted with 1-click.
3. **Guaranteed Termination**:
   Process-tree termination via Windows Job Objects / `taskkill /T /F` and Unix process groups (`SIGKILL` on negative PID) ensures 0 orphaned daemons on cancellation.
4. **Bilingual Parity**:
   Full native support for both Arabic and English interfaces and typography (Inter & Cairo).

---

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
