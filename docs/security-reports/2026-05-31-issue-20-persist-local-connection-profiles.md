# Security Closeout Report: Issue 20 Persist local connection profiles

Date: 2026-05-31
Branch: feature/20-persist-local-connection-profiles
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Local Inspector Runtime connection profile persistence.
  - Profile create/update save and rollback behavior.
  - Public connection response redaction.
  - Frontend connection selection and capability loading state.
  - Documentation for storage path, reset behavior, and secret handling.
- Files or commits reviewed:
  - `6c25740 feat: persist local connection profiles`
  - `apps/inspector-runtime/src/connectionProfileStore.ts`
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/App.tsx`
  - `README.md`
  - `docs/runtime-api.md`

## Result

Security readiness: CLEAR

## Findings

- [Info] Profile persistence stores only non-secret metadata
  - Affected files:
    - `apps/inspector-runtime/src/connectionProfileStore.ts`
    - `apps/inspector-runtime/src/server.ts`
  - Impact: The new persistence path stores profile ids, names, transports,
    commands, args, URLs, and timestamps. The store strips `env` and `headers`
    before serialization, and file validation rejects persisted profile entries
    that contain those fields.
  - Exploitability: No direct secret disclosure path was found in the changed
    profile persistence flow. A local user with access to the configured
    connection profile file can read non-secret connection metadata and local
    command/URL shapes.
  - Minimal fix: None required for this issue.

- [Info] Public connection responses continue to omit secret-bearing fields
  - Affected files:
    - `apps/inspector-runtime/src/server.ts`
  - Impact: `GET /connections`, create responses, and update responses continue
    to pass through `toPublicConnectionProfile`, which omits `env` and
    `headers` before returning profiles to the browser.
  - Exploitability: No response path added by this change was found that echoes
    stored or submitted `env` values or HTTP/SSE headers.
  - Minimal fix: None required for this issue.

- [Info] Connection selection refresh fix does not introduce frontend XSS sinks
  - Affected files:
    - `apps/inspector-web/src/App.tsx`
  - Impact: The UI state fix keeps selected connection id and capability loading
    aligned after refresh. The changed code updates React state only and does
    not introduce raw HTML rendering, direct DOM injection, dynamic code
    execution, browser storage, or cross-window messaging.
  - Exploitability: No frontend injection sink was found in the changed code.
  - Minimal fix: None required for this issue.

## Dependency Hygiene

- Manifests/lockfiles reviewed:
  - `package.json`
  - `package-lock.json`
- Audit commands and results:
  - `npm audit`: found 0 vulnerabilities

## Validation

- Commands run:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm audit`: passed, found 0 vulnerabilities
  - Runtime smoke test with `INSPECTOR_CONNECTIONS_PATH`: passed
  - UI refresh regression smoke test with runtime and Vite local servers:
    passed
- Commands not run:
  - No separate test suite is defined in `package.json`.

## Residual Risk

- Persisted connection profiles are local developer artifacts. They can still
  reveal non-secret metadata such as MCP server names, local command paths,
  arguments, and remote URLs to anyone who can read the configured profile file.
- Profiles requiring stdio environment values or HTTP/SSE auth headers must have
  those secret values re-entered after runtime restart because this issue
  intentionally does not define encrypted or redacted secret persistence.
- The configured `INSPECTOR_CONNECTIONS_PATH` is trusted local configuration.
  The runtime resolves and writes that path without sandboxing it to a specific
  directory, matching the existing `INSPECTOR_HISTORY_PATH` local-dev model.
