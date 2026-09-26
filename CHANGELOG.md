# Changelog

All notable changes to **LENS Workstation** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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


