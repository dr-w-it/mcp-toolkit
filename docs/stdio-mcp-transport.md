# Stdio MCP Transport

MCP Inspector can use the local Inspector Runtime to connect to `stdio` MCP
servers. The runtime launches the process from an explicit local connection
profile and keeps environment values inside the runtime process.

The default development profile is:

```text
npx -y @modelcontextprotocol/server-filesystem ./
```

The runtime maps discovered MCP tools, resources, and prompts into the shared
`packages/core` capability types and executes tool calls through
`packages/mcp-client`.

## Runtime Endpoints

Discover capabilities for a connection:

```sh
curl http://127.0.0.1:8787/connections/local-filesystem/capabilities
```

Call a tool:

```sh
curl -X POST \
  http://127.0.0.1:8787/connections/local-filesystem/tools/list_allowed_directories/call \
  -H 'content-type: application/json' \
  --data '{"input":{}}'
```

Successful tool call responses include:

- the Inspector request shape
- formatted MCP output under `response.output`
- raw JSON-RPC request and response data under `response.rawRequest` and
  `response.rawResponse`
- a trace entry for the in-memory runtime history

## Failure Handling

Runtime failures use the existing JSON error shape:

```json
{
  "error": "MCP server startup failed: spawn /bad-command ENOENT"
}
```

The runtime returns compatible errors for unsupported transports, invalid
commands, startup failures, process exits, request timeouts, and tool execution
failures.

## Validation Notes

Validated on May 29, 2026:

- `npm run typecheck`
- `npm run build`
- Started `@dr-w/inspector-runtime` on `127.0.0.1:18815`
- `GET /connections/local-filesystem/capabilities` discovered real tools from
  `@modelcontextprotocol/server-filesystem`
- `POST /connections/local-filesystem/tools/list_allowed_directories/call`
  executed a real MCP tool call and returned formatted output plus raw
  JSON-RPC request/response data
- `packages/mcp-client` returned `McpConnectionStartupError` for an invalid
  local command path
