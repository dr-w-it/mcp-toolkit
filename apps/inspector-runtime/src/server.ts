import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ConnectionProfile,
  ExecuteToolCallRequest,
  ExecuteToolCallResponse,
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
import {
  createMcpClient,
  InvalidMcpCommandError,
  McpConnectionClosedError,
  McpConnectionStartupError,
  UnsupportedMcpTransportError,
  type McpConnection,
} from "@dr-w/mcp-client";

const port = Number.parseInt(process.env["INSPECTOR_RUNTIME_PORT"] ?? "8787", 10);
const host = process.env["INSPECTOR_RUNTIME_HOST"] ?? "127.0.0.1";
const webPort = process.env["INSPECTOR_WEB_PORT"] ?? "5000";
const allowedWebOrigins = new Set(
  (
    process.env["INSPECTOR_WEB_ORIGINS"] ??
    `http://127.0.0.1:${webPort},http://localhost:${webPort}`
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const connections: ConnectionProfile[] = [
  {
    id: "local-filesystem",
    name: "Local filesystem server",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const traces: TraceEntry[] = [
  {
    id: "trace-001",
    connectionId: "local-filesystem",
    operation: "runtime/health",
    status: "success",
    startedAt: new Date().toISOString(),
    durationMs: 1,
  },
];

const toolCallRequests = new Map<string, ToolCallRequest>();
const toolCallResponses = new Map<string, ToolCallResponse>();
const mcpClient = createMcpClient();
const mcpConnections = new Map<string, McpConnection>();

function getAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;

  if (origin && allowedWebOrigins.has(origin)) {
    return origin;
  }

  return allowedWebOrigins.values().next().value ?? `http://127.0.0.1:${webPort}`;
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

async function getMcpConnection(profile: ConnectionProfile): Promise<McpConnection> {
  const existingConnection = mcpConnections.get(profile.id);

  if (existingConnection) {
    return existingConnection;
  }

  const connection = await mcpClient.connect(profile);
  mcpConnections.set(profile.id, connection);
  return connection;
}

function closeMcpConnection(connectionId: string) {
  const connection = mcpConnections.get(connectionId);
  mcpConnections.delete(connectionId);
  void connection?.close().catch(() => undefined);
}

async function createToolCall(
  connectionId: string,
  toolName: string,
  input: JsonValue,
): Promise<ExecuteToolCallResponse> {
  const startedAt = new Date();
  const requestNumber = toolCallRequests.size + 1;
  const request: ToolCallRequest = {
    id: `request-${requestNumber.toString().padStart(3, "0")}`,
    connectionId,
    toolName,
    input,
    createdAt: startedAt.toISOString(),
  };
  const connection = connections.find((item) => item.id === connectionId);

  if (!connection) {
    throw new Error("Connection not found");
  }

  const mcpConnection = await getMcpConnection(connection);
  const response = await mcpConnection.callTool(toolName, input, request.id);
  const trace: TraceEntry = {
    id: `trace-${(traces.length + 1).toString().padStart(3, "0")}`,
    connectionId,
    operation: `tools/call ${toolName}`,
    status: response.status,
    startedAt: request.createdAt,
    durationMs: response.durationMs,
    requestId: request.id,
    error: response.error,
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

function getRuntimeError(error: unknown) {
  if (error instanceof UnsupportedMcpTransportError) {
    return { status: 400, message: error.message };
  }

  if (error instanceof InvalidMcpCommandError) {
    return { status: 400, message: error.message };
  }

  if (error instanceof McpConnectionStartupError) {
    return { status: 502, message: `MCP server startup failed: ${error.message}` };
  }

  if (error instanceof McpConnectionClosedError) {
    return { status: 502, message: error.message };
  }

  if (error instanceof Error && /timeout/i.test(error.message)) {
    return { status: 504, message: error.message };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Runtime request failed",
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

  const capabilitiesMatch = url.pathname.match(/^\/connections\/([^/]+)\/capabilities$/);

  if (request.method === "GET" && capabilitiesMatch) {
    const connectionId = decodeURIComponent(capabilitiesMatch[1] ?? "");
    const connection = connections.find((item) => item.id === connectionId);

    if (!connection) {
      sendJson(request, response, 404, { error: "Connection not found" });
      return;
    }

    try {
      const mcpConnection = await getMcpConnection(connection);
      const discoveredCapabilities = await mcpConnection.capabilities();

      sendJson(request, response, 200, discoveredCapabilities);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, { error: runtimeError.message });
    }
    return;
  }

  const toolCallMatch = url.pathname.match(
    /^\/connections\/([^/]+)\/tools\/([^/]+)\/call$/,
  );

  if (request.method === "POST" && toolCallMatch) {
    const connectionId = decodeURIComponent(toolCallMatch[1] ?? "");
    const toolName = decodeURIComponent(toolCallMatch[2] ?? "");
    const connection = connections.find((item) => item.id === connectionId);

    if (!connection) {
      sendJson(request, response, 404, { error: "Connection not found" });
      return;
    }

    let mcpConnection: McpConnection;
    let discoveredTools: Awaited<ReturnType<McpConnection["capabilities"]>>["tools"];

    try {
      mcpConnection = await getMcpConnection(connection);
      discoveredTools = (await mcpConnection.capabilities()).tools;
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, { error: runtimeError.message });
      return;
    }

    const tool = discoveredTools.find((item) => item.name === toolName);

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

    try {
      const toolCallRequest = body as Partial<ExecuteToolCallRequest>;
      const toolCallResponse = await createToolCall(
        connection.id,
        tool.name,
        toolCallRequest.input ?? {},
      );

      sendJson(request, response, 200, toolCallResponse);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, { error: runtimeError.message });
    }
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

    try {
      const replayedCall = await createToolCall(
        originalRequest.connectionId,
        originalRequest.toolName,
        originalRequest.input,
      );
      const trace: TraceEntry = {
        ...replayedCall.trace,
        operation: `replay ${originalRequest.toolName}`,
        requestId: replayedCall.request.id,
      };

      traces[0] = trace;

      const replayResponse: ReplayToolCallResponse = {
        replayedFromRequestId: originalRequest.id,
        request: replayedCall.request,
        response: replayedCall.response,
        trace,
      };

      sendJson(request, response, 200, replayResponse);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(originalRequest.connectionId);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, { error: runtimeError.message });
    }
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Inspector Runtime listening on http://${host}:${port}`);
});

async function closeRuntimeConnections() {
  await Promise.all(
    [...mcpConnections.values()].map((connection) =>
      connection.close().catch(() => undefined),
    ),
  );
  mcpConnections.clear();
}

async function shutdownRuntime() {
  await closeRuntimeConnections();
  server.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdownRuntime();
});

process.on("SIGTERM", () => {
  void shutdownRuntime();
});
