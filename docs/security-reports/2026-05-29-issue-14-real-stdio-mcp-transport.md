# Security Closeout Report: Issue 14 Real Stdio MCP Transport

Date: 2026-05-29
Branch: codex/14-real-stdio-mcp-transport
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - `packages/mcp-client` stdio transport adapter
  - `apps/inspector-runtime` MCP discovery, tool call, replay, and error paths
  - `apps/inspector-web` runtime error message handling
  - `package.json` and `package-lock.json` dependency changes
  - Runtime/API documentation for stdio MCP behavior
- Files or commits reviewed:
  - `93cf340 feat: add real stdio MCP transport`

## Result

Security readiness: CLEAR

## Findings

- [None] No blocking security findings were identified.
  - Affected files: none
  - Impact: none
  - Exploitability: none
  - Minimal fix: none

## Dependency Hygiene

- Manifests/lockfiles reviewed:
  - `packages/mcp-client/package.json`
  - `package-lock.json`
- New dependency:
  - `@modelcontextprotocol/sdk`
- Audit commands and results:
  - `npm audit --audit-level=high`
  - Result: found 0 vulnerabilities

## Validation

- Commands run:
  - `npm run typecheck`
  - `npm run build`
  - `npm audit --audit-level=high`
  - Runtime smoke test on `127.0.0.1:18815`
  - `GET /connections/local-filesystem/capabilities`
  - `POST /connections/local-filesystem/tools/list_allowed_directories/call`
  - Invalid command startup failure check through `packages/mcp-client`
- Commands not run:
  - No separate unit test suite exists in the repository yet.

## Residual Risk

- Local `stdio` MCP execution intentionally launches a command from an explicit
  runtime connection profile. This is sensitive by design and should remain
  local-only.
- Environment variables stay inside the runtime process, and stderr is drained
  without logging. Future user-created profiles must keep the same no-secret-log
  behavior.
- Raw request/response data is returned to the UI and kept in in-memory history.
  This can include tool inputs and outputs. It is not persisted yet, but future
  persistence or trace export work needs a redaction policy before storing or
  sharing this data.
- The default filesystem server is launched through `npx -y`, which may install
  or update the server package at runtime. Pinning or preset management should
  be considered before treating default profiles as reproducible release assets.
