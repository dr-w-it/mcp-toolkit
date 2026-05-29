# Security Closeout Report: Issue 16 Remote HTTP and SSE MCP Transports

Date: 2026-05-29
Branch: codex/16-add-remote-http-and-sse-mcp-transports
Base: main
Reviewer: Codex

## Scope

- Changed areas reviewed:
  - Remote MCP transport selection and connection setup.
  - Runtime request, response, history, and trace handling.
  - Auth header handling for HTTP and SSE profiles.
  - Developer helper command for the SDK HTTP/SSE test server.
  - Sidebar connection composer layout for remote profiles.
- Files reviewed:
  - `packages/mcp-client/src/index.ts`
  - `apps/inspector-runtime/src/server.ts`
  - `apps/inspector-web/src/styles.css`
  - `dev.sh`
  - `README.md`
  - `docs/runtime-api.md`
  - `docs/test-mcp-servers.md`
  - `docs/remote-mcp-transports.md`

## Result

Security readiness: CLEAR

## Findings

- [Info] Remote auth headers remain runtime-local
  - Affected files: `packages/mcp-client/src/index.ts`, `apps/inspector-runtime/src/server.ts`
  - Impact: HTTP/SSE auth headers are passed into the MCP SDK transport as request headers, but are not copied into public connection responses, traces, history, or raw JSON-RPC request/response payloads.
  - Exploitability: No direct exposure found in the changed code.
  - Minimal fix: None required.

- [Info] Remote URL execution remains explicit per profile
  - Affected files: `apps/inspector-runtime/src/server.ts`, `packages/mcp-client/src/index.ts`
  - Impact: Remote connections require a user-supplied HTTP or HTTPS URL and invalid URL errors are mapped to client errors.
  - Exploitability: This is expected MCP client behavior. The runtime can initiate requests to configured remote URLs, so users should continue to avoid untrusted production credentials in local test profiles.
  - Minimal fix: None required for this issue.

## Dependency Hygiene

- Manifests/lockfiles reviewed: `package.json`, `package-lock.json`, workspace package manifests.
- Dependency changes: none.
- Audit commands and results: not run; no dependency manifest or lockfile changes were introduced.

## Validation

- Commands run:
  - `npm run typecheck`
  - `npm run build`
  - `npm run typecheck --workspace @dr-w/inspector-web`
  - `npm run build --workspace @dr-w/inspector-web`
  - `bash -n dev.sh`
- Manual/runtime validation:
  - Started the SDK backwards-compatible MCP server on `127.0.0.1:3000`.
  - Started `@dr-w/inspector-runtime` on `127.0.0.1:18790`.
  - HTTP profile `http://127.0.0.1:3000/mcp` discovered real tools and executed `start-notification-stream`.
  - SSE profile `http://127.0.0.1:3000/sse` discovered real tools and executed `start-notification-stream`.
  - Unreachable HTTP profile returned a `502` runtime error.
  - Dummy auth header was absent from `GET /connections`, `GET /history`, raw JSON-RPC data, and local runtime/server logs.
  - Browser layout verification confirmed the HTTP connection composer no longer overlaps the timeline.
- Commands not run:
  - `npm audit`; no dependency changes were made.

## Residual Risk

- Remote MCP servers are user-configured endpoints. They can observe headers intentionally supplied for that profile and can return arbitrary MCP tool metadata and tool results.
- Connection profiles remain in memory only. Future persistence work must keep a clear redaction/storage policy for auth headers and environment values.
