# Architecture

This repository starts with a simple monorepo structure:

```text
apps/
  inspector-desktop/
  inspector-web/
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

### `apps/inspector-desktop`

Reserved for the desktop/local version of MCP Inspector.

The desktop version should prioritize local development workflows and direct
inspection of MCP servers.

### `apps/inspector-web`

Reserved for a future hosted web version of MCP Inspector.

The web version is not part of the first implementation pass. Hosted concerns
such as accounts, billing, multi-tenancy, and cloud infrastructure should not be
introduced yet.

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

## Boundaries

The current architecture does not include:

- billing
- authentication systems
- hosted account management
- cloud infrastructure
- gateway services
- observability backends

Those areas may become relevant later, but they are outside the initial scope.
