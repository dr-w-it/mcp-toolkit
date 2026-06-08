# Security Closeout Report: Issue 29 Remote Capability Failures

Date: 2026-06-08
Branch: codex/29-surface-remote-capability-failures
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Runtime error classification for remote MCP connection startup and
    capability discovery failures.
  - Runtime structured diagnostics for connection and capability discovery.
  - Sanitized remote target URL handling in logs.
  - Web UI state separation between runtime health failures and selected
    connection capability discovery failures.
  - Runtime API error code documentation for authentication and transport
    categories.
- Files or commits reviewed:
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/App.tsx`
  - `apps/inspector-web/src/styles.css`
  - `docs/remote-mcp-transports.md`
  - `docs/runtime-api.md`
  - `packages/core/src/index.ts`
  - `4f0cb91 fix: surface remote capability discovery failures`

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
  - No package manifests or lockfiles changed.
- Audit commands and results:
  - `npm audit --json`: found 0 vulnerabilities.

## Validation

- Commands run:
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - `npm audit --json`
  - Runtime smoke test with an unreachable HTTP MCP profile returning `502`
    and `mcp_transport_failed`.
  - Runtime smoke test with a local HTTP server returning `401` and
    `WWW-Authenticate`, producing `authentication_required`.
  - Log and temporary storage search for a dummy authorization header value.
- Commands not run:
  - No automated browser test suite exists for this UI state.
  - No real external OAuth provider was exercised in this issue; interactive
    OAuth is tracked separately in issue 28.

## Residual Risk

- Authentication challenge detection is intentionally conservative and based on
  SDK error classes plus safe message/status inspection. Some upstream servers
  may still return unusual failure shapes until issue 28 adds the full OAuth
  flow.
- Runtime diagnostics include sanitized target URLs with query, hash, username,
  and password removed. Path segments remain visible because they are needed for
  debugging MCP endpoints; operators should avoid putting secrets in URL paths.
- The local runtime remains account-free and local-first. Deployments that bind
  the runtime beyond localhost still need an additional protection layer.
