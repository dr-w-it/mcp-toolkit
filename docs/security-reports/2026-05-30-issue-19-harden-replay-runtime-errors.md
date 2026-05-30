# Security Closeout Report: Issue 19 Harden Replay Runtime Errors

Date: 2026-05-30
Branch: feature/19-harden-real-tool-call-replay-and-runtime-error-surfaces
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Shared runtime error response and tool response contracts.
  - MCP client error classification for real tool execution.
  - Runtime JSON error responses, tool input validation, and replay execution.
  - Web runtime client error parsing and response viewer rendering.
  - Runtime API documentation for replay and structured errors.
- Files or commits reviewed:
  - `packages/core/src/index.ts`
  - `packages/mcp-client/src/index.ts`
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/localRuntimeClient.ts`
  - `apps/inspector-web/src/App.tsx`
  - `docs/runtime-api.md`

## Result

Security readiness: CLEAR

## Findings

- [None] No blocking security findings identified.
  - Affected files: none.
  - Impact: none.
  - Exploitability: none.
  - Minimal fix: none.

## Dependency Hygiene

- Manifests/lockfiles reviewed:
  - No package manifest or lockfile changes.
- Audit commands and results:
  - `npm audit --omit=dev`: found 0 vulnerabilities.

## Validation

- Commands run:
  - `npm run typecheck`
  - `npm run build`
  - `npm audit --omit=dev`
  - `git diff --check`
  - Runtime smoke test with local SDK HTTP MCP test server, Inspector Runtime on `127.0.0.1:18789`, successful tool call, successful `/replay`, `invalid_tool_input` failure, and `replay_request_not_found` failure.
- Commands not run:
  - No full browser UI smoke test was run during closeout because the issue acceptance criteria were covered through runtime API checks and the TypeScript/Vite build.

## Residual Risk

- Raw MCP request and response payloads remain intentionally visible in tool call and replay responses for local debugging. They may contain sensitive data entered into or returned by an MCP server.
- Runtime error messages may include details returned by MCP transports or servers. The new `code` and `errorCode` fields make these errors easier to classify, but they do not redact third-party server messages.
- The runtime remains local-first and account-free. There is no new authentication, authorization, or multi-tenant boundary in this change.
