# Local Deployment

MCP Inspector should be web-first and locally runnable.

The preferred local deployment direction is Docker Compose, with a small number
of focused services. This should make the product easy to run from the
open-source repository without requiring hosted SaaS.

## Recommended Local Topology

```text
inspector-web
  serves the web UI
  talks to inspector-runtime

inspector-runtime
  local API/runtime for MCP execution
  manages MCP connections, calls, replay, history, and traces

storage
  initially optional
  prefer a local volume or SQLite before introducing a database service

example-mcp-server
  optional development/demo service
```

The initial local stack should avoid unnecessary infrastructure. Do not add
Postgres, Redis, queues, object storage, or service discovery until there is a
clear product need.

## Docker Compose Role

Docker Compose should be used for:

- repeatable local setup
- local demo environments
- development against known MCP servers
- self-hosted single-machine usage
- future smoke tests for the local stack

Docker Compose should not imply cloud-first architecture or Kubernetes-first
architecture.

The repository includes a minimal Compose stack for local development:

```sh
./dev.sh docker:up
```

The stack starts:

- `inspector-web` on `http://127.0.0.1:5000`
- `inspector-runtime` on `http://127.0.0.1:8787`

Both services bind to localhost on the host machine. The runtime listens on
`0.0.0.0` inside its container so Docker can publish the port, but the published
port remains local-only.

The web UI uses `http://127.0.0.1:8787` as its runtime URL because browser
requests originate from the developer machine, not from the Docker network.

When default ports are unavailable, copy `.env.example` to `.env` and change
`INSPECTOR_WEB_PORT` or `INSPECTOR_RUNTIME_PORT`. The web service uses the
runtime port value to build its browser-visible runtime URL.

For host-native local development, the same values can be set inline:

```sh
INSPECTOR_WEB_PORT=15000 INSPECTOR_RUNTIME_PORT=18787 VITE_INSPECTOR_RUNTIME_URL=http://127.0.0.1:18787 ./dev.sh local
```

## MCP Transport Considerations

Docker is a good fit for remote MCP servers and containerized local MCP servers.

It is more complicated for host-native `stdio` MCP servers because a container
cannot freely start arbitrary processes on the host. For this reason, the
architecture should allow more than one runtime mode:

- container runtime: runs inside Docker and connects to remote or containerized
  MCP servers
- host runtime: runs directly on the developer machine when host-native `stdio`
  servers are required

The UI should not care which runtime mode is used. It should only talk to the
Inspector Runtime API.

## Persistence

Local persistence should start simple.

Prefer:

- runtime-managed local files
- SQLite
- Docker volumes

Avoid early:

- required Postgres
- required Redis
- required external object storage
- hosted-only trace storage

## Security

The local runtime should default to local-only access.

Recommended safeguards:

- bind to `127.0.0.1` by default
- generate a local runtime token when needed
- avoid exposing the runtime API on public interfaces by default
- keep secrets and environment values local

Do not introduce user accounts or hosted authentication for local mode.
