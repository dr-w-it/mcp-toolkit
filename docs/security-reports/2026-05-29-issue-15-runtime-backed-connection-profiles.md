# Security Closeout Report: Issue 15 Runtime-Backed Connection Profiles

Date: 2026-05-29
Branch: codex/15-implement-runtime-backed-connection-profiles
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Runtime connection profile create/list/update API.
  - Runtime MCP connection cache invalidation on profile update.
  - Web UI connection create/edit form.
  - Runtime client fetch wrapper for state-changing profile requests.
  - Runtime API and local test server documentation.
- Files or commits reviewed:
  - `cd2c415 feat: add runtime-backed connection profiles`
  - `b517b56 feat: add editable connection profiles`
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/App.tsx`
  - `apps/inspector-web/src/localRuntimeClient.ts`
  - `packages/core/src/index.ts`
  - `docs/runtime-api.md`
  - `docs/test-mcp-servers.md`

## Result

Security readiness: CLEAR

## Findings

- [Low] Local runtime still accepts explicit local command profiles
  - Affected files:
    - `apps/inspector-runtime/src/server.ts`
    - `packages/mcp-client/src/index.ts`
  - Impact: Anyone able to reach the local runtime API can create or update a
    `stdio` profile that launches a local command.
  - Exploitability: Low in the current local development model because the
    runtime binds to `127.0.0.1` by default and the UI is local-first. This
    remains a sensitive trust boundary for future hosted, LAN, or desktop
    packaging modes.
  - Minimal fix: No blocking fix required for this issue. Keep runtime binding
    local, avoid widening CORS or host binding by default, and revisit local
    runtime authorization before exposing the runtime beyond localhost.

- [Low] Secret-bearing profile fields remain runtime-only and in memory
  - Affected files:
    - `apps/inspector-runtime/src/server.ts`
    - `docs/runtime-api.md`
  - Impact: `env` and `headers` can be supplied to profile create/update calls,
    but list and update responses intentionally omit them. Values remain inside
    the runtime process and are not persisted by this issue.
  - Exploitability: Low. The current implementation avoids echoing secrets to
    `GET /connections`, docs examples, and profile response bodies.
  - Minimal fix: No blocking fix required. Issue #20 should define the storage
    and redaction policy before any profile persistence writes secret-bearing
    fields to disk.

## Dependency Hygiene

- Manifests/lockfiles reviewed:
  - `package.json`
  - `package-lock.json`
  - workspace `package.json` files
- Dependency changes:
  - No dependency or lockfile changes in this issue.
- Audit commands and results:
  - `npm audit --audit-level=high`: found 0 vulnerabilities

## Validation

- Commands run:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm audit --audit-level=high`: passed
  - Runtime smoke test for `POST /connections`, `PUT /connections/:id`, and
    `GET /connections`: passed
  - Browser smoke test verified the edit form opens prefilled for the selected
    connection.
- Commands not run:
  - Full browser save flow was not completed through automation because the
    local browser automation driver failed typing actions with a virtual
    clipboard error. The save path was validated through the runtime API smoke
    test.

## Residual Risk

- Connection profiles and timeline/history remain in memory only until follow-up
  persistence issues are implemented.
- HTTP and SSE profiles can be created and edited as API/UI shapes, but remote
  HTTP/SSE transport execution is intentionally deferred.
- Future profile persistence must avoid writing `env` values or auth headers
  until a redaction and storage policy exists.
