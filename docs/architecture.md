# Architecture

This repository starts with a simple monorepo structure:

```text
apps/
  inspector-web/
  inspector-runtime/
packages/
  mcp-client/
  core/
  ui/
docs/
```

The goal is to keep user-facing applications separate from reusable product
logic while avoiding premature architecture.

## Apps

Applications live in `apps/`.

Apps are user-facing entry points. They should depend on shared packages for MCP
communication, product logic, and reusable UI when those packages exist.

### `apps/inspector-web`

Reserved for the primary web UI for MCP Inspector.

The web UI should support both local and future hosted usage. Web-first does not
mean cloud-first: the open-source product should be useful when run locally.

### `apps/inspector-runtime`

Reserved for the local Inspector Runtime/API.

The runtime should handle work a browser cannot safely or reliably do directly,
including local/stdin MCP transports, process management, environment variables,
auth headers, and private/local MCP server access.

Hosted concerns such as accounts, billing, multi-tenancy, and cloud
infrastructure should not be introduced yet.

## Packages

Shared logic lives in `packages/`.

Packages should be introduced gradually and stay focused on real reuse.

### `packages/mcp-client`

Wraps MCP communication.

This package should eventually provide the project-owned interface used by apps
to connect to MCP servers, inspect capabilities, call tools, and replay
requests.

### `packages/core`

Contains product and domain logic.

This package should eventually hold shared MCP Inspector concepts such as
inspection models, request history, replay behavior, and product-level types.

### `packages/ui`

Contains shared UI components.

This package should remain lightweight and should only grow once multiple apps
need shared interface elements.

## Docs

Documentation lives in `docs/`.

Architecture, product decisions, and future technical notes should be documented
here before they turn into implementation complexity.

## Proposed MVP Architecture

The first implementation should keep MCP Inspector web-first, locally runnable,
and modular.

At a high level:

```text
apps/inspector-web
  primary web UI for local and future hosted usage
  depends on packages/ui and packages/core

apps/inspector-runtime
  local API/runtime for MCP execution
  depends on packages/core and packages/mcp-client
  implemented first with TypeScript and Node.js

packages/mcp-client
  MCP transport adapters
  connection lifecycle
  capability discovery
  tool/resource/prompt operations
  raw request/response capture

packages/core
  inspector domain models
  request history
  replay/session logic
  trace import/export
  security insight models

packages/ui
  reusable UI components and inspector primitives
```

The web UI should not directly own MCP execution. Protocol details should live
in `packages/mcp-client`, product workflows should live in `packages/core`, and
shared interface primitives should live in `packages/ui` only once reuse is
real.

The core architectural rule is:

```text
Web UI != MCP execution
```

## Runtime Boundaries

### Web UI

The web UI should be the first product surface. It should provide the inspection,
debugging, request editing, response viewing, history, replay, and trace
workflows.

The same UI should be able to run against:

- a local Inspector Runtime
- a future hosted runtime
- a future gateway or SaaS backend, if the product needs one

The product should avoid separate local and SaaS frontends. `apps/inspector-web`
is the primary product UI; local and hosted modes should differ by runtime/API
target, not by duplicated frontend code.

### Local Inspector Runtime

The local runtime should support:

- local/stdin MCP server connections
- remote MCP server connections
- process lifecycle for local MCP servers
- environment variables
- auth headers
- recent connections
- request history and replay
- local trace import/export

The runtime gives the web UI access to capabilities that browsers cannot safely
provide on their own.

The first runtime implementation should use TypeScript and Node.js. This keeps
the local runtime close to the web UI, shared product models, and API contracts.
Python, Go, or Rust should be reserved for later components with clearer needs.

The runtime should be able to run in more than one local mode:

- container runtime: runs inside Docker for repeatable local/self-hosted usage
- host runtime: runs directly on the developer machine when host-native `stdio`
  MCP servers need to be launched outside Docker

The UI should not care which mode is active. It should talk to the same
Inspector Runtime API.

### Local Container Topology

The preferred local deployment direction is Docker Compose with focused
services:

```text
inspector-web
  serves the web UI

inspector-runtime
  exposes the local runtime API and manages MCP execution

storage
  optional local volume or SQLite-backed persistence

example-mcp-server
  optional demo/development MCP server
```

The initial local stack should avoid unnecessary infrastructure. Postgres,
Redis, queues, object storage, and Kubernetes should not be introduced until
they solve a concrete product problem.

### Hosted Mode

Hosted mode is optional. The project should not assume SaaS is required.

If hosted mode is added later, it may reuse the same web UI and product models
while replacing or complementing the local runtime with hosted infrastructure.

Hosted concerns should not leak into the MVP architecture early. Accounts,
billing, multi-tenancy, and cloud infrastructure should remain out of scope
until there is clear product need.

Future hosted architecture may introduce users, organizations, workspace
memberships, roles, billing, remote trace storage, collaboration, and audit
events. These concepts should remain outside the local MVP unless a concrete
workflow requires them.

### Desktop Wrapper

A desktop wrapper is optional. If needed later, it should package the same web UI
and local runtime rather than becoming the primary product architecture.

### Shared Packages

Shared packages should be designed around product boundaries rather than
framework convenience:

- `mcp-client`: how MCP communication works
- `core`: what MCP Inspector knows and records
- `ui`: how common inspector interfaces are rendered

This keeps the project able to support local, hosted, and optional desktop modes
without duplicating core behavior.

## Data Model Direction

The MVP should eventually define explicit models for:

- connections
- connection profiles
- MCP capabilities
- tools
- resources
- prompts
- schemas
- tool call requests
- tool call responses
- raw protocol messages
- history entries
- replay sessions
- traces
- security findings

These models should start simple and evolve from real inspector workflows.

## Security Analysis Direction

Security insights should be modeled as annotations over MCP capabilities,
requests, responses, and server metadata.

Early findings may include:

- missing authentication visibility
- dangerous or broad tool names
- unsafe tool descriptions
- secret-like values in responses
- over-permissive capabilities
- prompt injection indicators

Findings should initially be informational. Enforcement, policy engines, and
gateway controls belong to later phases.

## Future Gateway Boundary

A future MCP gateway may provide:

- authentication proxying
- policy enforcement
- rate limiting
- audit logs
- centralized observability
- governance controls

The gateway should be treated as a separate product boundary. The inspector
should be able to inspect and debug gateway-mediated MCP traffic, but the MVP
should not embed gateway architecture.

## Boundaries

The current architecture does not include:

- billing
- authentication systems
- hosted account management
- cloud infrastructure
- gateway services
- observability backends

Those areas may become relevant later, but they are outside the initial scope.

## Open Architecture Questions

Questions to resolve before implementation:

- What is the smallest useful API between `inspector-web` and
  `inspector-runtime`?
- Which MCP transports must be supported in the first milestone?
- Which flows require a containerized runtime, and which require a host runtime?
- How should local secrets and environment variables be stored or avoided?
- What trace format should import/export use?
- How much raw protocol detail should be exposed in the UI by default?
- Where should request history live for the first version?
- Which security checks are valuable enough for the first post-MVP release?
