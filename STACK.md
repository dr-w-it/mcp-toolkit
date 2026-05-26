# Stack

The stack is not finalized.

This repository should avoid framework commitments until implementation work
requires them. Early decisions should keep the web UI, local runtime, and any
future hosted surfaces able to share MCP and product logic.

## Current Commitments

- Use a monorepo layout.
- Keep user-facing applications in `apps/`.
- Keep shared logic in `packages/`.
- Keep documentation in `docs/`.
- Do not add billing, auth, cloud, or gateway code yet.

## Likely Direction

These are not final decisions, but they are the strongest current candidates for
the first implementation pass:

- TypeScript for shared product code
- React for user interfaces
- npm workspaces for the initial monorepo workflow
- Vite for the first web UI and local development loop
- Node.js and TypeScript for the local Inspector Runtime
- Fastify, Hono, or another small HTTP framework for the runtime API
- SQLite or local files for local history, traces, settings, and connection
  profiles
- Docker Compose for repeatable local/self-hosted deployment
- Next.js only if the hosted web product needs server-side routing,
  documentation, or hosted application concerns
- Tauri only if a desktop wrapper becomes useful later

The first implementation should optimize for a fast web-first local developer
tool, shared logic across local and hosted modes, and low operational
complexity.

## Intended Packages

### `packages/mcp-client`

Wraps MCP communication behind a project-owned interface.

This package should eventually isolate protocol details from the applications.
It should own connection setup, capability discovery, tool invocation, request
replay primitives, and transport-specific adapters.

### `packages/core`

Contains shared product and domain logic for MCP Inspector.

Examples may eventually include request history models, replay logic, inspection
state, trace import/export, security insight models, and product-level types.

### `packages/ui`

Contains shared UI components once there is a real UI implementation.

This package should remain empty or minimal until the first app needs shared UI.

## Future Backend Direction

Hosted backend services are not part of the MVP. The MVP may still need a local
Inspector Runtime because a browser-only application cannot reliably spawn local
MCP servers, manage stdio transports, or inspect private local services.

Auth, user management, organizations, billing, remote trace storage, and audit
logs are future hosted concerns. They should not be introduced into local mode.

Local deployment should use Docker Compose where it improves repeatability, but
the architecture should still allow the runtime to run directly on the host for
host-native `stdio` MCP servers.

The initial runtime and any first cloud API should use TypeScript/Node.js to
keep the frontend, API contracts, product models, and MCP logic in one language.
Go or Rust may become appropriate later for gateway, proxy, or hardened
connector components, but they should not be introduced for the first local
inspector.

If later phases require a gateway, auth layer, hosted observability, or team
collaboration, possible backend choices include:

- Go for gateway/auth/observability services where concurrency and operational
  simplicity matter
- Python for analysis-heavy tooling if security or trace analysis benefits from
  the ecosystem

Choose backend technology only after the open-source inspector has clear product
traction and concrete hosted requirements.

## Principles

- Prefer simple tooling.
- Prefer shared logic over duplicated behavior.
- Avoid infrastructure before there is a product need.
- Avoid enterprise architecture during the MVP.
- Prefer Docker Compose over Kubernetes for local/self-hosted MVP deployment.
- Keep local and hosted modes able to share MCP client, core models, and UI
  patterns.
- Keep the web UI separate from MCP execution.
- Keep one primary product frontend for both local and hosted modes.
- Avoid a plugin system until real extension needs appear.
