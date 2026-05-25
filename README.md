# MCP Toolkit

MCP Toolkit is a developer-focused repository for tools in the Model Context Protocol
(MCP) ecosystem.

The first product is **MCP Inspector**, an open-source tool for inspecting,
debugging, and eventually securing MCP servers.

This repository is intentionally starting with structure and documentation only.
Runtime features, framework choices, hosted infrastructure, billing, and auth code
will be added later only when the product needs them.

## Product Focus

### MCP Inspector

MCP Inspector is intended to help developers:

- connect to MCP servers
- inspect tools, resources, and prompts
- call tools during development
- replay previous requests
- debug server behavior

The first milestone should stay narrow: **connect, inspect, call, replay**.

## Repository Structure

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

### Apps

Applications live in `apps/`.

- `apps/inspector-desktop/` is reserved for the local desktop version.
- `apps/inspector-web/` is reserved for the hosted web version.

### Packages

Shared packages live in `packages/`.

- `packages/mcp-client/` will wrap MCP communication.
- `packages/core/` will contain product and domain logic.
- `packages/ui/` will contain shared UI components.

### Docs

Project documentation lives in `docs/`.

- `docs/architecture.md` describes the intended high-level architecture.
- `docs/product-decisions.md` records early product decisions.

## Current Status

The project is in the planning and foundation phase.

There are no runtime features yet.

## Development Principles

- Keep the repository simple.
- Prefer clear documentation before implementation.
- Avoid early enterprise complexity.
- Do not add billing, auth, cloud, or gateway code yet.
- Reuse shared packages once real implementation begins.
- Keep the MVP focused on developer adoption.

## Related Documents

- [Vision](VISION.md)
- [Roadmap](ROADMAP.md)
- [Ideas](IDEAS.md)
- [Stack](STACK.md)
- [Architecture](docs/architecture.md)
- [Product Decisions](docs/product-decisions.md)
