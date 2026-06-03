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

## Theme

```http
GET /theme
```

Response type: `RuntimeThemeResponse`

```json
{
  "activeTheme": {
    "id": "default",
    "name": "MCP Toolkit Default",
    "tokens": {
      "--color-background": "#0f1115",
      "--color-surface": "#171b21",
      "--color-accent": "#3abff8"
    }
  },
  "availableThemes": [
    {
      "id": "default",
      "name": "MCP Toolkit Default",
      "tokens": {
        "--color-background": "#0f1115",
        "--color-surface": "#171b21",
        "--color-accent": "#3abff8"
      }
    }
  ],
  "diagnostics": [],
  "themesPath": "/absolute/path/to/apps/inspector-web/.mcp-inspector/theme"
}
```

The default theme is internal to the application runtime and is always
available as `default`. It is not read from the local custom theme directory or
from the directory configured by `INSPECTOR_THEMES_PATH`.

Custom themes are local workbench personalization. The runtime reads `*.json`
theme files from `apps/inspector-web/.mcp-inspector/theme` by default. Set
`INSPECTOR_THEMES_PATH` before starting the runtime to use a different local
directory. Relative theme paths are resolved from `apps/inspector-web`:

```sh
INSPECTOR_THEMES_PATH=.mcp-inspector/theme ./dev.sh local
```

Set `INSPECTOR_THEME` to select the active theme by stable id:

```sh
INSPECTOR_THEME=high-contrast ./dev.sh local
```

If `INSPECTOR_THEME` is missing, empty, `default`, unknown, or points to an
invalid custom theme, the runtime returns the internal default theme. Theme
loading diagnostics are returned as non-fatal warnings so invalid local files do
not prevent startup.

Theme files must define a stable lowercase id, a display name, and a complete
`tokens` object for the semantic CSS token set returned by the default theme:

```json
{
  "id": "high-contrast",
  "name": "High Contrast",
  "tokens": {
    "--color-background": "#000000",
    "--color-panel": "#000000",
    "--color-panel-muted": "#050505",
    "--color-surface": "#101010",
    "--color-surface-elevated": "#181818",
    "--color-border": "#6b7280",
    "--color-text": "#ffffff",
    "--color-text-muted": "#cbd5e1",
    "--color-text-secondary": "#e5e7eb",
    "--color-text-subtle": "#94a3b8",
    "--color-text-strong": "#ffffff",
    "--color-accent": "#38bdf8",
    "--color-accent-contrast": "#001018",
    "--color-accent-soft": "rgba(56, 189, 248, 0.16)",
    "--color-accent-softer": "rgba(56, 189, 248, 0.2)",
    "--color-accent-border": "rgba(56, 189, 248, 0.72)",
    "--color-success": "#22c55e",
    "--color-success-soft": "rgba(34, 197, 94, 0.18)",
    "--color-warning": "#f59e0b",
    "--color-warning-soft": "rgba(245, 158, 11, 0.16)",
    "--color-warning-softer": "rgba(245, 158, 11, 0.12)",
    "--color-warning-border": "rgba(245, 158, 11, 0.72)",
    "--color-warning-border-muted": "rgba(245, 158, 11, 0.55)",
    "--color-danger": "#ef4444",
    "--color-danger-soft": "rgba(239, 68, 68, 0.18)",
    "--color-code-background": "#000000",
    "--color-code-text": "#dbeafe",
    "--color-selection": "rgba(56, 189, 248, 0.22)",
    "--color-focus-ring": "rgba(56, 189, 248, 0.22)",
    "--color-schema-accent": "#a78bfa"
  }
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

Connection profile metadata is persisted locally by default so profile ids stay
stable across Inspector Runtime restarts. The default storage file is
`.mcp-inspector/connections.json`; set `INSPECTOR_CONNECTIONS_PATH` before
starting the runtime to use a different JSON file path. Relative connection
profile paths are resolved from `apps/inspector-runtime`:

```sh
INSPECTOR_CONNECTIONS_PATH=.mcp-inspector/connections.json ./dev.sh local
```

The runtime stores profile ids, names, transports, commands, args, URLs, and
timestamps. It does not store stdio `env` values or HTTP/SSE `headers`, so
profiles that require those secret values need them re-entered after a runtime
restart. The built-in `local-filesystem` development profile is added by the
runtime and is not written to the profile file. To reset persisted profiles,
stop the runtime and delete the configured connection profile file.

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

Local history persistence is opt-in. Set `INSPECTOR_HISTORY_PATH` to a JSON
file path before starting the runtime to keep history across runtime restarts.
Relative history paths are resolved from `apps/inspector-runtime`:

```sh
INSPECTOR_HISTORY_PATH=.mcp-inspector/history.json ./dev.sh local
```

When enabled, the runtime stores trace entries, tool call requests, tool call
responses, timing, connection ids, tool names, inputs, outputs, replay metadata,
and raw request/response payloads needed for timeline inspection and replay. It
does not store connection profile `env` values or HTTP/SSE `headers`, so
secrets used to connect to MCP servers are not written to the history file.
Replay after a restart requires the referenced connection profile id to exist in
the runtime.

To reset persisted history, stop the runtime and delete the configured JSON
file. Unset `INSPECTOR_HISTORY_PATH` to return to process-only history.

```http
GET /history/:traceId
```

Response type: `GetTraceResponse`

```json
{
  "trace": {
    "id": "trace-002",
    "connectionId": "local-filesystem",
    "operation": "tools/call read_file",
    "status": "success",
    "startedAt": "2026-05-26T08:41:12.000Z",
    "durationMs": 118,
    "requestId": "request-001"
  },
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
  }
}
```

Trace detail responses expose captured request/response records when the runtime
has them. Imported traces can be inspected through the same endpoint without
requiring the original MCP server to be available.

## Trace Import and Export

```http
POST /traces/export
Content-Type: application/json
```

Request type: `ExportTraceRequest`

```json
{
  "traceIds": ["trace-002"]
}
```

Response type: `ExportTraceResponse`

```json
{
  "trace": {
    "version": 1,
    "source": "mcp-inspector",
    "exportedAt": "2026-05-29T12:00:00.000Z",
    "redaction": {
      "excludedConnectionFields": ["headers", "env"],
      "notes": [
        "Connection profile secrets are not included in trace exports.",
        "Tool inputs, outputs, and raw MCP protocol payloads are exported as captured and may contain data returned or entered during local debugging."
      ]
    },
    "entries": [
      {
        "trace": {
          "id": "trace-002",
          "connectionId": "local-filesystem",
          "operation": "tools/call read_file",
          "status": "success",
          "startedAt": "2026-05-26T08:41:12.000Z",
          "durationMs": 118,
          "requestId": "request-001"
        }
      }
    ]
  }
}
```

Omit `traceIds` and `requestIds` to export the full in-memory history. Provide
`traceIds` or `requestIds` to export selected entries.

```http
POST /traces/import
Content-Type: application/json
```

Request type: `ImportTraceRequest`

```json
{
  "trace": {
    "version": 1,
    "source": "mcp-inspector",
    "exportedAt": "2026-05-29T12:00:00.000Z",
    "redaction": {
      "excludedConnectionFields": ["headers", "env"],
      "notes": []
    },
    "entries": []
  }
}
```

Response type: `ImportTraceResponse`

```json
{
  "imported": [],
  "traces": []
}
```

Imported trace entries are inserted into the runtime history with new
`imported-trace-*` IDs, `source: "imported"`, and `importedAt` timestamps so the
timeline can distinguish them from live runtime entries.

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
    "requestId": "request-003",
    "replayedFromRequestId": "request-001"
  }
}
```

Replay starts from a previous request id, reuses the original tool input exactly,
executes through the same real runtime tool-call path as a new call, and returns
the new request, the new response, and the trace created by the replay
operation. Replayed calls preserve captured raw JSON-RPC request/response data
when the selected transport exposes it to the runtime.

## Error Shape

Runtime endpoints return a JSON error body with a stable human-readable
`error`. Newer endpoints also include a machine-readable `code`; clients should
keep treating `error` as the compatibility field.

```json
{
  "error": "Replayable request not found",
  "code": "replay_request_not_found"
}
```

Validation errors may include string `details`:

```json
{
  "error": "Invalid connection profile",
  "code": "invalid_connection_profile",
  "details": ["command is required for stdio profiles"]
}
```

Tool call responses and traces may include `errorCode` when a real MCP call
returns an error result or fails during execution:

```json
{
  "response": {
    "requestId": "request-004",
    "status": "error",
    "error": "MCP tool returned an error result",
    "errorCode": "mcp_tool_result_error",
    "durationMs": 14,
    "completedAt": "2026-05-30T12:00:00.014Z"
  }
}
```

Known runtime error codes include `invalid_json`, `connection_not_found`,
`tool_not_found`, `replay_request_not_found`, `mcp_startup_failed`,
`mcp_connection_closed`, `timeout`, `schema_validation_failed`,
`mcp_transport_failed`, `invalid_tool_input`, and `unknown_runtime_error`. Use
appropriate HTTP status codes for transport-level failures such as invalid JSON,
missing records, or unsupported endpoints.
