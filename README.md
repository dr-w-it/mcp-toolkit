# MCP Toolkit

MCP Toolkit is a developer-focused repository for tools in the Model Context Protocol
(MCP) ecosystem.

MCP Toolkit lives under **dr-w**, a personal engineering and devtools lab for
open-source, developer-first infrastructure experiments.

The first product is **MCP Inspector**, an open-source tool for inspecting,
debugging, and eventually securing MCP servers.

The long-term goal is not to build another AI wrapper, chatbot platform, or
prompt playground. MCP Toolkit aims to become foundational developer
infrastructure for understanding, debugging, securing, and operating MCP servers
and agent ecosystems.

This repository is intentionally starting with structure and documentation
before runtime features. Framework choices, hosted infrastructure, billing,
authentication, and gateway code should be added later only when the product
needs them.

Think:

- Postman for MCP
- DevTools for MCP
- developer-first MCP utilities
- eventually, infrastructure for MCP authentication, governance, and
  observability

## Product Focus

### MCP Inspector

MCP Inspector is intended to help developers:

- connect to MCP servers
- inspect tools, resources, and prompts
- call tools during development
- replay previous requests
- debug server behavior

The first milestone should stay narrow: **connect, inspect, call, replay**.

Initial MCP Inspector capabilities may include:

- local/stdin and remote server connections
- recent connection management
- environment variable and auth header support
- tool, resource, prompt, schema, and capability inspection
- structured tool execution
- formatted and raw request/response views
- request history, replay, timeline, and trace import/export

## Repository Structure

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

### Apps

Applications live in `apps/`.

- `apps/inspector-web/` is reserved for the primary web UI.
- `apps/inspector-runtime/` is reserved for the local runtime/API that lets the
  web UI inspect local and private MCP servers. The first runtime implementation
  should use TypeScript and Node.js.

MCP Inspector should be web-first, not necessarily cloud-first. Developers
should be able to run it locally from the open-source repository. A SaaS version
may exist later, but the product should not require SaaS to be useful.

The same `inspector-web` product UI should support local and possible future
hosted modes by changing the runtime/API target, not by forking the frontend.
Local usage should not require accounts or hosted authentication.

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

## Strategic Positioning

MCP Toolkit is not:

- a generic AI chatbot platform
- a low-code AI builder
- an agent marketplace
- another prompt playground
- a hype-driven AI wrapper
- an enterprise orchestration platform
- a Kubernetes-first runtime platform
- a hosted AI automation suite

MCP Toolkit is:

- a developer-first toolkit for MCP servers
- a debugging and inspection surface for MCP interactions
- a local-first workflow for understanding MCP behavior
- a future home for security insights and production-readiness checks
- a possible foundation for later authentication, gateway, policy, and
  observability layers

## Development Principles

- Keep the repository simple.
- Prefer clear documentation before implementation.
- Avoid early enterprise complexity.
- Do not add billing, auth, cloud, or gateway code yet.
- Keep the web UI separate from MCP execution.
- Reuse shared packages once real implementation begins.
- Keep the MVP focused on developer adoption.

## Related Documents

- [Vision](VISION.md)
- [Roadmap](ROADMAP.md)
- [Ideas](IDEAS.md)
- [Stack](STACK.md)
- [Architecture](docs/architecture.md)
- [Branding](docs/branding.md)
- [Product Decisions](docs/product-decisions.md)
- [Local Deployment](docs/local-deployment.md)
- [Visual Identity](docs/visual-identity.md)
