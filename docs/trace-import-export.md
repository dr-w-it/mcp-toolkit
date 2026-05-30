# Trace Import and Export

MCP Inspector trace files are local JSON artifacts for moving debugging history
between runtime sessions. They are intended for local inspection and manual
sharing, not hosted collaboration or cloud storage.

## Format

Trace files use a versioned envelope:

```json
{
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
          "content": "..."
        },
        "rawRequest": {
          "jsonrpc": "2.0",
          "id": "request-001",
          "method": "tools/call"
        },
        "rawResponse": {
          "jsonrpc": "2.0",
          "id": "request-001",
          "result": {}
        },
        "durationMs": 118,
        "completedAt": "2026-05-26T08:41:12.118Z"
      }
    }
  ]
}
```

The `entries` array is the import/export unit. Each entry must include a
`trace`. It may include the matching Inspector `request` and `response` when
the runtime captured them.

## Redaction Boundary

Trace exports do not include complete connection profile records. Known
secret-bearing connection fields are excluded:

- `headers`
- `env`

HTTP/SSE auth headers and stdio environment variables remain runtime-local.
Raw JSON-RPC payloads are still exported because they are the debugging
artifact developers need to inspect. Users should avoid exporting traces that
contain sensitive tool inputs, tool outputs, resource contents, or protocol
payloads they are not prepared to share.

## Runtime Workflow

Export:

```http
POST /traces/export
Content-Type: application/json
```

```json
{
  "traceIds": ["trace-002"]
}
```

Import:

```http
POST /traces/import
Content-Type: application/json
```

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

Imported entries receive new `imported-trace-*` IDs, `source: "imported"`, and
an `importedAt` timestamp. They can be inspected from the timeline without a
live MCP server because the file carries the captured trace/request/response
data.

## Smoke Test

1. Start the local runtime and web UI with `./dev.sh local`.
2. Execute a tool call so `/history` includes at least one trace with a
   `requestId`.
3. Click `Export` in the timeline and save the JSON file.
4. Restart the runtime or open a fresh runtime session.
5. Click `Import`, select the saved JSON file, and confirm the timeline shows
   `imported` entries.
6. Select an imported entry and confirm its trace, request, response, and raw
   protocol payloads are inspectable without reconnecting to the original MCP
   server.
