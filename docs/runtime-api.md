# Local Runtime API

The Inspector Runtime API is the first stable contract between
`apps/inspector-web` and `apps/inspector-runtime` for local mode.

The contract is local-first and account-free. It does not introduce users,
organizations, workspaces, billing, hosted sessions, or SaaS-only concepts.

## Base Assumptions

- The local runtime binds to `127.0.0.1` by default.
- The web UI chooses the runtime base URL through local development or
  deployment configuration.
- Responses use JSON with `Content-Type: application/json`.
- Request and response TypeScript shapes live in `packages/core`.
- Timestamps are ISO 8601 strings.

## Health

```http
GET /health
```

Response type: `RuntimeHealthResponse`

```json
{
  "ok": true,
  "service": "inspector-runtime",
  "mode": "local"
}
```

## Connections

```http
GET /connections
```

Response type: `ListConnectionsResponse`

```json
{
  "connections": [
    {
      "id": "local-filesystem",
      "name": "Local filesystem server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      "createdAt": "2026-05-26T08:30:00.000Z",
      "updatedAt": "2026-05-26T08:30:00.000Z"
    }
  ]
}
```

Connection profiles may include `args`, `url`, `headers`, and `env` when the
transport needs them. Local mode should keep these values local to the runtime.
List responses omit `headers` and `env` values so secrets are not echoed back to
the browser after profile creation.

```http
POST /connections
Content-Type: application/json
```

Request type: `CreateConnectionProfileRequest`

```json
{
  "name": "Local filesystem server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-filesystem ./"
}
```

Response type: `CreateConnectionProfileResponse`

```json
{
  "connection": {
    "id": "local-filesystem-server",
    "name": "Local filesystem server",
    "transport": "stdio",
    "command": "npx -y @modelcontextprotocol/server-filesystem ./",
    "createdAt": "2026-05-29T10:30:00.000Z",
    "updatedAt": "2026-05-29T10:30:00.000Z"
  }
}
```

Invalid profile shapes return JSON errors with a `details` array:

```json
{
  "error": "Invalid connection profile",
  "details": ["command is required for stdio profiles"]
}
```

```http
PUT /connections/:connectionId
Content-Type: application/json
```

Request type: `UpdateConnectionProfileRequest`

```json
{
  "name": "Everything test server",
  "transport": "stdio",
  "command": "npx -y @modelcontextprotocol/server-everything"
}
```

Response type: `UpdateConnectionProfileResponse`

```json
{
  "connection": {
    "id": "local-filesystem-server",
    "name": "Everything test server",
    "transport": "stdio",
    "command": "npx -y @modelcontextprotocol/server-everything",
    "createdAt": "2026-05-29T10:30:00.000Z",
    "updatedAt": "2026-05-29T10:45:00.000Z"
  }
}
```

Updating a profile keeps its `id` stable and closes any currently open MCP
connection for that profile so the next capability discovery or tool call uses
the updated settings.

## Capabilities

```http
GET /connections/:connectionId/capabilities
```

Response type: `GetConnectionCapabilitiesResponse`

```json
{
  "connectionId": "local-filesystem",
  "tools": [
    {
      "name": "read_file",
      "description": "Read a file from an allowed local directory.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string"
          }
        },
        "required": ["path"]
      }
    }
  ],
  "resources": [],
  "prompts": []
}
```

Capabilities describe what the connected MCP server exposes. The response keeps
tools, resources, and prompts grouped under a single connection id so the web UI
can render a consistent inspector view.

## Tool Calls

```http
POST /connections/:connectionId/tools/:toolName/call
Content-Type: application/json
```

Request type: `ExecuteToolCallRequest`

```json
{
  "input": {
    "path": "./README.md"
  }
}
```

Response type: `ExecuteToolCallResponse`

```json
{
  "request": {
    "id": "request-002",
    "connectionId": "local-filesystem",
    "toolName": "read_file",
    "input": {
      "path": "./README.md"
    },
    "createdAt": "2026-05-27T10:15:00.000Z"
  },
  "response": {
    "requestId": "request-002",
    "status": "success",
    "output": {
      "content": [
        {
          "type": "text",
          "text": "MCP Toolkit is a developer-focused repository..."
        }
      ]
    },
    "rawRequest": {
      "jsonrpc": "2.0",
      "id": 3,
      "method": "tools/call",
      "params": {
        "name": "read_file",
        "arguments": {
          "path": "./README.md"
        }
      }
    },
    "rawResponse": {
      "jsonrpc": "2.0",
      "id": 3,
      "result": {
        "content": [
          {
            "type": "text",
            "text": "MCP Toolkit is a developer-focused repository..."
          }
        ]
      }
    },
    "durationMs": 1,
    "completedAt": "2026-05-27T10:15:00.001Z"
  },
  "trace": {
    "id": "trace-003",
    "connectionId": "local-filesystem",
    "operation": "tools/call read_file",
    "status": "success",
    "startedAt": "2026-05-27T10:15:00.000Z",
    "durationMs": 1,
    "requestId": "request-002"
  }
}
```

For `stdio` connections, the runtime launches the configured local MCP server
process. For HTTP and SSE connections, the runtime connects to the configured
remote URL and passes optional auth headers only to the transport layer. All
transports preserve raw JSON-RPC request/response data for the response viewer
without including HTTP headers or environment values.

## History

```http
GET /history
```

Response type: `ListHistoryResponse`

```json
{
  "traces": [
    {
      "id": "trace-002",
      "connectionId": "local-filesystem",
      "operation": "tools/call read_file",
      "status": "success",
      "startedAt": "2026-05-26T08:41:12.000Z",
      "durationMs": 118,
      "requestId": "request-001"
    }
  ]
}
```

History entries are runtime-local traces. A trace can include `requestId` when
the operation can be replayed.

## Replay

```http
POST /replay
Content-Type: application/json
```

Request type: `ReplayToolCallRequest`

```json
{
  "requestId": "request-001"
}
```

Response type: `ReplayToolCallResponse`

```json
{
  "replayedFromRequestId": "request-001",
  "request": {
    "id": "request-001",
    "connectionId": "local-filesystem",
    "toolName": "read_file",
    "input": {
      "path": "./README.md"
    },
    "createdAt": "2026-05-26T08:41:12.000Z"
  },
  "response": {
    "requestId": "request-001",
    "status": "success",
    "output": {
      "content": "MCP Toolkit is a developer-focused repository..."
    },
    "durationMs": 118,
    "completedAt": "2026-05-26T08:41:12.118Z"
  },
  "trace": {
    "id": "trace-003",
    "connectionId": "local-filesystem",
    "operation": "replay read_file",
    "status": "success",
    "startedAt": "2026-05-26T08:42:00.000Z",
    "durationMs": 118,
    "requestId": "request-001"
  }
}
```

Replay starts from a previous request id and returns the original request shape,
the new response, and the trace created by the replay operation.

## Error Shape

Runtime endpoints should return this minimal error shape until richer domain
errors are needed:

```json
{
  "error": "Replayable request not found"
}
```

Use appropriate HTTP status codes for transport-level failures such as invalid
JSON, missing records, or unsupported endpoints.
