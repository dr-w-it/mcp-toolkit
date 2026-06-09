# Security Closeout Report: Issue 28 Interactive OAuth

Date: 2026-06-09
Branch: codex/28-interactive-oauth
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Interactive OAuth authorization for Streamable HTTP MCP connections.
  - Runtime OAuth callback handling and HTML success/failure responses.
  - SDK-backed OAuth provider state, dynamic client registration metadata,
    token storage, refresh reuse, and PKCE verifier handling.
  - Runtime and MCP client structured OAuth diagnostics.
  - Redaction of OAuth codes, verifiers, tokens, refresh tokens, client secrets,
    and ID tokens in runtime diagnostics.
  - Response viewer rendering limits added after OAuth test responses exposed a
    formatted JSON UI freeze.
  - OAuth callback URL documentation and runtime callback override.
- Files or commits reviewed:
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/App.tsx`
  - `apps/inspector-web/src/styles.css`
  - `docs/remote-mcp-transports.md`
  - `docs/runtime-api.md`
  - `packages/mcp-client/src/index.ts`
  - `7219bda feat: add interactive OAuth for HTTP MCP servers`
  - `88e5398 fix: prevent formatted response viewer freezes`
  - `e457759 fix: preserve OAuth PKCE state during polling`

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
  - `git diff --check main..HEAD`
  - `npm audit --json`
  - Manual OAuth test against a local protected Streamable HTTP MCP server,
    including dynamic registration, browser callback, token exchange, and
    capability discovery after authorization.
  - Manual regression test showing the earlier PKCE mismatch was fixed by
    isolating pending OAuth provider state from capability polling.
  - Manual response viewer regression test confirming large formatted JSON
    results no longer freeze the page.
- Commands not run:
  - Docker Compose OAuth test was deferred because host-to-container callback
    and MCP server base URL behavior need a separate environment pass.
  - No automated browser test suite exists for the OAuth browser callback flow.

## Residual Risk

- OAuth client registrations, tokens, refresh tokens, discovery state, and PKCE
  verifier state remain runtime-memory only and are cleared on runtime restart.
- Structured OAuth diagnostics intentionally expose sanitized origins, paths,
  query parameter names, and non-reversible short fingerprints for correlation.
  Operators should still avoid putting secrets in URL paths or nonstandard
  parameter names.
- The local runtime remains account-free and intended for localhost development.
  Deployments that bind the runtime beyond localhost need an additional
  protection layer.
- Docker-based OAuth testing needs care when the target MCP server runs on the
  host, because `localhost` inside the runtime container is not the host
  machine.
