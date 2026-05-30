# Security Closeout Report: Issue 17 Trace Import and Export

Date: 2026-05-29
Branch: codex/issue-17-trace-import-export
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Shared trace artifact types.
  - Runtime trace detail, export, and import endpoints.
  - Web timeline import/export controls and trace inspection.
  - Runtime API and trace format documentation.
- Files reviewed:
  - `packages/core/src/index.ts`
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/localRuntimeClient.ts`
  - `apps/inspector-web/src/App.tsx`
  - `apps/inspector-web/src/styles.css`
  - `docs/runtime-api.md`
  - `docs/trace-import-export.md`
  - `README.md`

## Result

Security readiness: CLEAR WITH DOCUMENTED LIMITS

## Findings

- [Info] Connection profile secrets are excluded from trace exports
  - Affected files: `apps/inspector-runtime/src/server.ts`, `docs/trace-import-export.md`
  - Impact: Trace artifacts include trace entries and captured Inspector request/response records, but do not include full connection profile records. Known secret-bearing profile fields `headers` and `env` are listed as excluded.
  - Exploitability: No direct export path for stored auth headers or environment variables was found in the changed code.
  - Minimal fix: None required.

- [Info] Captured MCP payloads can still contain user or server data
  - Affected files: `apps/inspector-runtime/src/server.ts`, `docs/trace-import-export.md`
  - Impact: Tool inputs, outputs, and raw JSON-RPC payloads are intentionally exported for debugging. These values may contain sensitive data supplied by the user or returned by an MCP server.
  - Exploitability: Expected local artifact behavior. Users should review trace files before sharing them.
  - Minimal fix: Documented in the trace artifact redaction notes and trace workflow guide.

- [Info] Imported traces are passive history entries
  - Affected files: `apps/inspector-runtime/src/server.ts`, `apps/inspector-web/src/App.tsx`
  - Impact: Imported entries receive new `imported-trace-*` IDs and can be inspected without connecting to the original MCP server. Import does not execute imported requests.
  - Exploitability: Low. Import accepts local JSON artifacts and stores them in runtime memory for inspection.
  - Minimal fix: None required.

## Dependency Hygiene

- Manifests/lockfiles reviewed: `package.json`, workspace package manifests.
- Dependency changes: none.
- Audit commands and results: not run; no dependency manifest or lockfile changes were introduced.

## Validation

- Commands run:
  - `npm run typecheck`
  - `npm run build`
- Manual/runtime validation:
  - Started `@dr-w/inspector-runtime` on `127.0.0.1:18789`.
  - `POST /traces/export` returned a versioned trace artifact with `headers` and `env` listed as excluded fields.
  - `POST /traces/import` accepted a minimal empty artifact.
  - `POST /traces/import` accepted an offline trace with request/response payloads and inserted it as `source: "imported"`.
  - `GET /history/imported-trace-002` returned the imported trace, request, and response without requiring a live MCP server.
  - Browser verification confirmed the runtime-backed timeline exposes enabled Import/Export controls and selected trace details render in the response viewer.
- Commands not run:
  - `npm audit`; no dependency changes were made.

## Residual Risk

- Trace files are local debugging artifacts and can contain sensitive tool inputs, tool outputs, resource contents, and raw protocol payloads. Users should review exported JSON before sharing.
- Trace imports are in memory only. Future persistence work should keep the same no-profile-secrets export boundary and may need deeper content redaction options.
