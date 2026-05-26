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
