# Remote MCP Transports

MCP Inspector can use the local Inspector Runtime to connect to remote MCP
servers over Streamable HTTP and legacy HTTP+SSE transports.

Remote execution stays inside the runtime boundary. The web UI creates or
updates a connection profile with a `url` and optional auth `headers`; the
runtime stores those values in memory and passes headers only to the MCP SDK
transport layer.

List responses omit `headers` and `env` values, and tool call responses capture
only JSON-RPC protocol messages under `response.rawRequest` and
`response.rawResponse`. HTTP request headers are not included in raw protocol
metadata, traces, history responses, or exported profile shapes.

## Profile Shapes

Streamable HTTP profile:

```json
{
  "name": "Remote streamable MCP server",
  "transport": "http",
  "url": "https://mcp.example.test/mcp",
  "headers": {
    "authorization": "Bearer <token>"
  }
}
```

Legacy HTTP+SSE profile:

```json
{
  "name": "Remote SSE MCP server",
  "transport": "sse",
  "url": "https://mcp.example.test/sse",
  "headers": {
    "authorization": "Bearer <token>"
  }
}
```

## Runtime Endpoints

Start the local HTTP/SSE MCP test server:

```sh
./dev.sh remote:mcp
```

Discover capabilities for a remote connection:

```sh
curl http://127.0.0.1:8787/connections/remote-server/capabilities
```

Call a remote tool:

```sh
curl -X POST \
  http://127.0.0.1:8787/connections/remote-server/tools/start-notification-stream/call \
  -H 'content-type: application/json' \
  --data '{"input":{"interval":1,"count":1}}'
```

Successful remote tool call responses use the same shape as `stdio` calls:

- the Inspector request shape
- formatted MCP output under `response.output`
- raw JSON-RPC request and response data under `response.rawRequest` and
  `response.rawResponse`
- a trace entry for the in-memory runtime history

## Failure Handling

Remote failures use the existing JSON error shape:

```json
{
  "error": "MCP server startup failed: fetch failed"
}
```

The runtime returns compatible errors for invalid URLs, remote auth failures,
network failures, CORS-like fetch failures, timeouts, unsupported methods, and
tool execution failures.

## Validation Notes

Validated on May 29, 2026:

- `npm run typecheck`
- `npm run build`
- Started `@dr-w/inspector-runtime` on `127.0.0.1:18790`
- Started the SDK backwards-compatible MCP server on `127.0.0.1:3000`
- HTTP profile `http://127.0.0.1:3000/mcp` discovered real tools and executed
  `start-notification-stream`
- SSE profile `http://127.0.0.1:3000/sse` discovered real tools and executed
  `start-notification-stream`
- An unreachable HTTP profile returned a `502` runtime error
- A dummy auth header was omitted from `GET /connections`, `GET /history`,
  raw JSON-RPC request/response data, and local runtime/server logs
