# Test MCP Servers

This document lists MCP servers that are useful for testing MCP Inspector during
local development.

Prefer reference servers from the official
[`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers)
repository when validating Inspector behavior. They are maintained as examples
and test fixtures for MCP clients and servers, not as production-ready services.

## Recommended First Profiles

### Everything

Use this when testing Inspector UI coverage across tools, resources, prompts,
schemas, and protocol features.

```text
npx -y @modelcontextprotocol/server-everything
```

Connection profile:

```json
{
  "name": "Everything test server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-everything"
}
```

This is the best general-purpose test server because it is explicitly designed
to exercise MCP protocol features.

### Filesystem

Use this when testing real local tool execution against a controlled directory.

```text
npx -y @modelcontextprotocol/server-filesystem ./
```

Connection profile:

```json
{
  "name": "Local filesystem server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-filesystem ./"
}
```

Keep the allowed directory narrow. For local repository testing, `./` is useful;
for safer manual testing, create a scratch directory and point the server there.

### Memory

Use this when testing stateful tool calls without granting filesystem access to
the project tree.

```text
npx -y @modelcontextprotocol/server-memory
```

Connection profile:

```json
{
  "name": "Memory test server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-memory"
}
```

## Additional Reference Servers

These are useful once the basic `stdio` flow is working.

### Sequential Thinking

Use this for testing longer structured tool inputs and responses.

```json
{
  "name": "Sequential thinking test server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-sequential-thinking"
}
```

### Time

Use this for small, low-risk tool calls around time and timezone conversion.

```json
{
  "name": "Time test server",
  "transport": "stdio",
  "command": "uvx mcp-server-time"
}
```

### Fetch

Use this only when network access is acceptable for the test.

```json
{
  "name": "Fetch test server",
  "transport": "stdio",
  "command": "uvx mcp-server-fetch"
}
```

### Git

Use this for repository inspection workflows. Point it at a local test
repository rather than a sensitive working tree when possible.

```json
{
  "name": "Git test server",
  "transport": "stdio",
  "command": "uvx mcp-server-git --repository ./"
}
```

## Create Through The Runtime API

For HTTP and SSE testing, start the SDK remote transport test server:

```sh
./dev.sh remote:mcp
```

It listens on `http://127.0.0.1:3000/mcp` for Streamable HTTP and
`http://127.0.0.1:3000/sse` for legacy HTTP+SSE.

With `./dev.sh local` running, create a profile directly:

```sh
curl -sS -X POST http://127.0.0.1:8787/connections \
  -H 'content-type: application/json' \
  --data '{
    "name": "Everything test server",
    "transport": "stdio",
    "command": "npx -y @modelcontextprotocol/server-everything"
  }'
```

Then list profiles:

```sh
curl -sS http://127.0.0.1:8787/connections
```

## Notes

- `npx -y` may download packages the first time a profile is used.
- `uvx` examples require `uv` to be installed.
- Do not put production credentials in test profiles.
- HTTP and SSE profiles execute through the local Inspector Runtime. Prefer
  local or disposable remote MCP servers when validating auth headers.
- Keep test servers local-first unless the validation specifically needs a
  remote endpoint.
