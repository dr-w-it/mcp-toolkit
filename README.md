# MCP Toolkit

MCP Toolkit is a local-first MCP workbench for debugging, replaying, and
securing Model Context Protocol (MCP) server interactions.

MCP Toolkit lives under **dr-w**, a personal engineering and devtools lab for
open-source, developer-first infrastructure experiments.

The initial product direction is **MCP Toolkit / MCP Workbench**: open-source
local tooling for repeatable MCP debugging, saved requests, local traces,
replay, security review, and production-readiness checks.

The long-term goal is not to build another AI wrapper, chatbot platform, or
prompt playground. MCP Toolkit aims to become foundational developer
infrastructure for understanding, debugging, securing, and operating MCP servers
and agent ecosystems.

This repository is intentionally starting with structure and documentation
before runtime features. Framework choices, hosted infrastructure, billing,
authentication, and gateway code should be added later only when the product
needs them.

Think:

- local MCP workbench
- repeatable request and replay tooling for MCP
- trace and audit tooling for MCP server interactions
- developer-first MCP utilities
- eventually, infrastructure for MCP authentication, governance,
  production-readiness, and observability

## Product Focus

### MCP Workbench

MCP Toolkit is intended to help developers:

- connect to MCP servers
- inspect tools, resources, and prompts
- call tools during development
- save useful requests
- replay previous requests
- debug server behavior
- review security and production-readiness risks

The first milestone should stay narrow: **connect, inspect, call, save,
replay, review**.

Initial MCP Workbench capabilities may include:

- local/stdin and remote server connections
- recent connection management
- environment variable and auth header support
- tool, resource, prompt, schema, and capability inspection
- structured tool execution
- saved requests
- formatted and raw request/response views
- request history, replay, trace timeline, and trace import/export
- trace diff and response comparison
- security review panel
- secret redaction
- risky tool detection
- sanitized trace export
- local audit report

The `inspector-web` and `inspector-runtime` package names are retained as local
module names for now. They should not define the public product positioning.

## Why not just use the official MCP Inspector?

The official MCP Inspector is the default and recommended visual testing tool
for MCP servers. It is the right starting point for general MCP server
inspection and can be run with:

```sh
npx @modelcontextprotocol/inspector
```

MCP Toolkit is intended to be complementary, not a replacement. The project is
focused on repeatable workflows, saved requests, local traces, replay, security
review, and production-readiness.

The goal is not to win on generic inspection. The goal is to provide deeper
local debugging and security-oriented workflows for developers who need
auditability, trace comparison, sanitized exports, and local review artifacts.

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

MCP Toolkit should be web-first, not necessarily cloud-first. Developers should
be able to run it locally from the open-source repository. A SaaS version may
exist later, but the product should not require SaaS to be useful.

The same `inspector-web` workbench UI should support local and possible future
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
- `docs/remote-mcp-transports.md` documents HTTP and SSE runtime transports.
- `docs/trace-import-export.md` documents the local trace artifact format and
  import/export workflow.
- `docs/test-mcp-servers.md` lists MCP servers useful for local workbench
  testing.

## Current Status

The project is in the early local MVP phase.

The initial local product is being built as an npm workspace with:

- `apps/inspector-web`
- `apps/inspector-runtime`
- `packages/core`
- `packages/mcp-client`
- `packages/ui`

Implemented so far:

- a React/Vite MCP Toolkit workbench UI
- a local TypeScript/Node.js runtime API in `apps/inspector-runtime`
- shared TypeScript contracts in `packages/core`
- runtime endpoints for health, connections, capabilities, tool calls, history,
  and replay shapes
- real `stdio` MCP discovery and tool execution through the local runtime
- real HTTP and SSE MCP discovery and tool execution through the local runtime
- a structured JSON tool request editor and formatted/raw response viewer
- runtime status handling with fallback development data when the local runtime
  is unavailable
- runtime-backed persisted connection profiles for creating, listing,
  selecting, and editing `stdio`, HTTP, and SSE shapes
- local runtime handling for profile env vars and auth headers without echoing
  secret values in list responses
- optional file-backed local request history and replay records
- local trace import/export for captured history artifacts
- runtime-selected UI themes with an internal default theme and optional local
  custom themes from `apps/inspector-web/.mcp-inspector/theme`
- Docker Compose local development for the web UI and runtime

Important current limits:

- connection profile persistence stores local metadata only and does not store
  profile env vars or auth headers
- history and replay persistence is opt-in through `INSPECTOR_HISTORY_PATH`
- trace exports and persisted history may include sensitive tool inputs,
  outputs, or raw MCP payloads entered or returned during debugging

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
./dev.sh remote:mcp
./dev.sh docker:up
./dev.sh check
```

Local development reads optional overrides from `.env`. Start from the example
file when you need to change ports:

```sh
cp .env.example .env
```

To persist local request history and replay records across runtime restarts, set
`INSPECTOR_HISTORY_PATH` to a local JSON file path before starting the runtime:

```sh
INSPECTOR_HISTORY_PATH=.mcp-inspector/history.json ./dev.sh local
```

The file stores trace entries plus captured request and response records. It
does not store connection profile `env` values or HTTP/SSE `headers`. To reset
persisted history, stop the runtime and delete the configured JSON file, or
unset `INSPECTOR_HISTORY_PATH` to return to process-only history.

Connection profile metadata persists by default in
`.mcp-inspector/connections.json`. Set `INSPECTOR_CONNECTIONS_PATH` to use a
different local JSON file. The file stores profile ids, names, transports,
commands, args, URLs, and timestamps, but it does not store stdio `env` values
or HTTP/SSE `headers`. To reset persisted profiles, stop the runtime and delete
the configured profile file.

Relative `INSPECTOR_CONNECTIONS_PATH` and `INSPECTOR_HISTORY_PATH` values are
resolved from `apps/inspector-runtime`. Relative `INSPECTOR_THEMES_PATH` values
are resolved from `apps/inspector-web`.

### Docker Compose

The local Docker setup starts the MCP Toolkit web UI and local runtime without
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
INSPECTOR_WEB_PORT=15000 INSPECTOR_RUNTIME_PORT=18787 VITE_INSPECTOR_RUNTIME_URL=http://127.0.0.1:18787 ./dev.sh local
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
- [Stdio MCP Transport](docs/stdio-mcp-transport.md)
- [Branding](docs/branding.md)
- [Product Decisions](docs/product-decisions.md)
- [Local Deployment](docs/local-deployment.md)
- [Visual Identity](docs/visual-identity.md)
