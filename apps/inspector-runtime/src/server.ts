import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  CapabilitySummary,
  ConnectionProfile,
  ExecuteToolCallRequest,
  ExecuteToolCallResponse,
  JsonObject,
  JsonValue,
  ListConnectionsResponse,
  ListHistoryResponse,
  ReplayToolCallRequest,
  ReplayToolCallResponse,
  RuntimeHealthResponse,
  ToolCallRequest,
  ToolCallResponse,
  TraceEntry,
} from "@dr-w/core";

const port = Number.parseInt(process.env["INSPECTOR_RUNTIME_PORT"] ?? "8787", 10);
const host = process.env["INSPECTOR_RUNTIME_HOST"] ?? "127.0.0.1";
const allowedWebOriginPattern = /^http:\/\/(?:127\.0\.0\.1|localhost):517\d$/;

const connections: ConnectionProfile[] = [
  {
    id: "local-filesystem",
    name: "Local filesystem server",
    transport: "stdio",
    command: "npx @modelcontextprotocol/server-filesystem ./",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const capabilities: CapabilitySummary = {
  connectionId: "local-filesystem",
  tools: [
    {
      name: "read_file",
      description: "Read a file from an allowed local directory.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
    },
  ],
  resources: [],
  prompts: [],
};

const traces: TraceEntry[] = [
  {
    id: "trace-001",
    connectionId: "local-filesystem",
    operation: "runtime/health",
    status: "success",
    startedAt: new Date().toISOString(),
    durationMs: 1,
  },
  {
    id: "trace-002",
    connectionId: "local-filesystem",
    operation: "tools/call read_file",
    status: "success",
    startedAt: new Date().toISOString(),
    durationMs: 14,
    requestId: "request-001",
  },
];

const toolCallRequests = new Map<string, ToolCallRequest>();
const toolCallResponses = new Map<string, ToolCallResponse>();

const sampleToolCallRequest: ToolCallRequest = {
  id: "request-001",
  connectionId: "local-filesystem",
  toolName: "read_file",
  input: { path: "./README.md" },
  createdAt: new Date().toISOString(),
};

const sampleToolCallResponse: ToolCallResponse = {
  requestId: sampleToolCallRequest.id,
  status: "success",
  output: {
    content: "MCP Toolkit is a developer-focused repository...",
  },
  rawRequest: {
    id: sampleToolCallRequest.id,
    connectionId: sampleToolCallRequest.connectionId,
    toolName: sampleToolCallRequest.toolName,
    input: sampleToolCallRequest.input,
    createdAt: sampleToolCallRequest.createdAt,
  },
  rawResponse: {
    content: [
      {
        type: "text",
        text: "MCP Toolkit is a developer-focused repository...",
      },
    ],
  },
  durationMs: 14,
  completedAt: new Date().toISOString(),
};

toolCallRequests.set(sampleToolCallRequest.id, sampleToolCallRequest);
toolCallResponses.set(sampleToolCallRequest.id, sampleToolCallResponse);

function getAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;

  if (origin && allowedWebOriginPattern.test(origin)) {
    return origin;
  }

  return "http://127.0.0.1:5173";
}

function sendJson(request: IncomingMessage, response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body, null, 2));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMockToolOutput(toolName: string, input: JsonValue): JsonValue {
  if (toolName === "read_file") {
    const path = isJsonObject(input) ? input["path"] : undefined;

    if (typeof path !== "string") {
      throw new Error("read_file requires a string path");
    }

    return {
      content: `Mock contents for ${path}`,
      path,
    };
  }

  return {
    echo: input,
    toolName,
  };
}

function createToolCall(
  connectionId: string,
  toolName: string,
  input: JsonValue,
): ExecuteToolCallResponse {
  const startedAt = new Date();
  const requestNumber = toolCallRequests.size + 1;
  const request: ToolCallRequest = {
    id: `request-${requestNumber.toString().padStart(3, "0")}`,
    connectionId,
    toolName,
    input,
    createdAt: startedAt.toISOString(),
  };

  let output: JsonValue | undefined;
  let error: string | undefined;

  try {
    output = getMockToolOutput(toolName, input);
  } catch (toolError) {
    error =
      toolError instanceof Error ? toolError.message : "Mock tool execution failed";
  }

  const completedAt = new Date();
  const durationMs = Math.max(1, completedAt.getTime() - startedAt.getTime());
  const response: ToolCallResponse = {
    requestId: request.id,
    status: error ? "error" : "success",
    output,
    error,
    rawRequest: {
      jsonrpc: "2.0",
      id: request.id,
      method: "tools/call",
      params: {
        arguments: input,
        name: toolName,
      },
    },
    rawResponse: error
      ? {
          error: {
            code: -32602,
            message: error,
          },
          id: request.id,
          jsonrpc: "2.0",
        }
      : {
          id: request.id,
          jsonrpc: "2.0",
          result: output ?? null,
        },
    durationMs,
    completedAt: completedAt.toISOString(),
  };
  const trace: TraceEntry = {
    id: `trace-${(traces.length + 1).toString().padStart(3, "0")}`,
    connectionId,
    operation: `tools/call ${toolName}`,
    status: response.status,
    startedAt: request.createdAt,
    durationMs,
    requestId: request.id,
    error,
  };

  toolCallRequests.set(request.id, request);
  toolCallResponses.set(request.id, response);
  traces.unshift(trace);

  return {
    request,
    response,
    trace,
  };
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(request, response, 400, { error: "Missing request URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(request, response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "GET" && url.pathname === "/health") {
    const body: RuntimeHealthResponse = {
      ok: true,
      service: "inspector-runtime",
      mode: "local",
    };

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "GET" && url.pathname === "/connections") {
    const body: ListConnectionsResponse = { connections };

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "GET" && url.pathname === "/connections/local-filesystem/capabilities") {
    sendJson(request, response, 200, capabilities);
    return;
  }

  const toolCallMatch = url.pathname.match(
    /^\/connections\/([^/]+)\/tools\/([^/]+)\/call$/,
  );

  if (request.method === "POST" && toolCallMatch) {
    const connectionId = decodeURIComponent(toolCallMatch[1] ?? "");
    const toolName = decodeURIComponent(toolCallMatch[2] ?? "");
    const connection = connections.find((item) => item.id === connectionId);
    const tool = capabilities.tools.find((item) => item.name === toolName);

    if (!connection) {
      sendJson(request, response, 404, { error: "Connection not found" });
      return;
    }

    if (!tool) {
      sendJson(request, response, 404, { error: "Tool not found" });
      return;
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(request, response, 400, { error: "Invalid JSON request body" });
      return;
    }

    const toolCallRequest = body as Partial<ExecuteToolCallRequest>;
    const toolCallResponse = createToolCall(
      connection.id,
      tool.name,
      toolCallRequest.input ?? {},
    );

    sendJson(request, response, 200, toolCallResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/history") {
    const body: ListHistoryResponse = { traces };

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/replay") {
    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(request, response, 400, { error: "Invalid JSON request body" });
      return;
    }

    const replayRequest = body as Partial<ReplayToolCallRequest>;

    if (!replayRequest.requestId || !toolCallRequests.has(replayRequest.requestId)) {
      sendJson(request, response, 404, { error: "Replayable request not found" });
      return;
    }

    const originalRequest = toolCallRequests.get(replayRequest.requestId);
    const originalResponse = toolCallResponses.get(replayRequest.requestId);

    if (!originalRequest || !originalResponse) {
      sendJson(request, response, 404, { error: "Replayable request not found" });
      return;
    }

    const trace: TraceEntry = {
      id: `trace-${(traces.length + 1).toString().padStart(3, "0")}`,
      connectionId: originalRequest.connectionId,
      operation: `replay ${originalRequest.toolName}`,
      status: "success",
      startedAt: new Date().toISOString(),
      durationMs: originalResponse.durationMs,
      requestId: originalRequest.id,
    };

    const replayResponse: ReplayToolCallResponse = {
      replayedFromRequestId: originalRequest.id,
      request: originalRequest,
      response: {
        ...originalResponse,
        completedAt: new Date().toISOString(),
      },
      trace,
    };

    traces.unshift(trace);
    sendJson(request, response, 200, replayResponse);
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Inspector Runtime listening on http://${host}:${port}`);
});
