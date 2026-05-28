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

The project is in the early local MVP phase.

The initial local product is being built as an npm workspace with:

- `apps/inspector-web`
- `apps/inspector-runtime`
- `packages/core`
- `packages/mcp-client`
- `packages/ui`

Implemented so far:

- a React/Vite MCP Inspector workbench UI
- a local TypeScript/Node.js Inspector Runtime API
- shared TypeScript contracts in `packages/core`
- runtime endpoints for health, connections, capabilities, tool calls, history,
  and replay shapes
- a mock-backed capability explorer for tools, resources, prompts, and schemas
- a structured JSON tool request editor and formatted/raw response viewer
- runtime status handling with fallback development data when the local runtime
  is unavailable
- draft connection profile UI for `stdio`, HTTP, and SSE, including env vars and
  headers at the UI level
- Docker Compose local development for the web UI and runtime

Important current limits:

- real MCP transport execution is not implemented yet
- `packages/mcp-client` currently defines interfaces but does not connect to MCP
  servers
- runtime tool calls are intentionally mocked
- draft connection profiles are local UI state only
- history and replay data are in memory only
- trace import/export and persistence are not implemented yet

## Development

Requirements:

- Node.js 24 LTS
- npm

Install dependencies:

```sh
npm install
```

Run all development scripts exposed by workspaces:

```sh
npm run dev
```

Typecheck all workspaces:

```sh
npm run typecheck
```

Development shortcuts are available through `dev.sh`:

```sh
./dev.sh server
./dev.sh runtime
./dev.sh local
./dev.sh docker:up
./dev.sh check
```

Local development reads optional overrides from `.env`. Start from the example
file when you need to change ports:

```sh
cp .env.example .env
```

### Docker Compose

The local Docker setup starts the MCP Inspector web UI and local runtime without
Postgres, Redis, Kubernetes, or hosted SaaS services.

Build and start the local stack:

```sh
./dev.sh docker:up
```

Pass Docker Compose arguments after the command when needed:

```sh
./dev.sh docker:up -d
```

Open the web UI:

```text
http://127.0.0.1:5000
```

The runtime API is exposed locally at:

```text
http://127.0.0.1:8787
```

Compose runs the runtime inside Docker and binds both services to localhost on
the host machine. For host-native `stdio` MCP servers that need to launch local
processes outside Docker, keep using the host runtime workflow:

```sh
./dev.sh runtime
```

or run both host-native services:

```sh
./dev.sh local
```

If the default ports are already in use, override them through `.env` or inline:

```sh
INSPECTOR_WEB_PORT=15000 INSPECTOR_RUNTIME_PORT=18787 ./dev.sh docker:up
```

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
- [Local Runtime API](docs/runtime-api.md)
- [Branding](docs/branding.md)
- [Product Decisions](docs/product-decisions.md)
- [Local Deployment](docs/local-deployment.md)
- [Visual Identity](docs/visual-identity.md)
