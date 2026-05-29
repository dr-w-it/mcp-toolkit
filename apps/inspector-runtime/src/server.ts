import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ConnectionProfile,
  ConnectionTransport,
  CreateConnectionProfileRequest,
  CreateConnectionProfileResponse,
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

const connectionProfiles: ConnectionProfile[] = [
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

class ConnectionProfileValidationError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super("Invalid connection profile");
    this.details = details;
    this.name = "ConnectionProfileValidationError";
  }
}

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

function toPublicConnectionProfile(profile: ConnectionProfile): ConnectionProfile {
  const { env: _env, headers: _headers, ...publicProfile } = profile;

  return publicProfile;
}

function createConnectionId(name: string) {
  const baseSlug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "connection";
  let id = baseSlug;
  let index = 2;

  while (connectionProfiles.some((profile) => profile.id === id)) {
    id = `${baseSlug}-${index}`;
    index += 1;
  }

  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(
  input: Record<string, unknown>,
  field: keyof CreateConnectionProfileRequest,
  errors: string[],
  options: { required?: boolean } = {},
) {
  const value = input[field];

  if (value === undefined || value === null) {
    if (options.required) {
      errors.push(`${field} is required`);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return undefined;
  }

  const trimmedValue = value.trim();

  if (options.required && !trimmedValue) {
    errors.push(`${field} is required`);
    return undefined;
  }

  return trimmedValue || undefined;
}

function readStringArrayField(
  input: Record<string, unknown>,
  field: keyof CreateConnectionProfileRequest,
  errors: string[],
) {
  const value = input[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${field} must be an array of strings`);
    return undefined;
  }

  return value;
}

function readStringRecordField(
  input: Record<string, unknown>,
  field: keyof CreateConnectionProfileRequest,
  errors: string[],
): Record<string, string> | undefined {
  const value = input[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    errors.push(`${field} must be an object with string keys and values`);
    return undefined;
  }

  const entries = Object.entries(value);

  if (
    entries.some(
      ([key, item]) => key.trim().length === 0 || typeof item !== "string",
    )
  ) {
    errors.push(`${field} must be an object with non-empty string keys and string values`);
    return undefined;
  }

  return Object.fromEntries(
    entries.map(([key, item]) => [key.trim(), item as string]),
  );
}

function assertHttpUrl(value: string | undefined, field: string, errors: string[]) {
  if (!value) {
    return;
  }

  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      errors.push(`${field} must use http or https`);
    }
  } catch {
    errors.push(`${field} must be a valid URL`);
  }
}

function validateConnectionProfileRequest(body: unknown): ConnectionProfile {
  const errors: string[] = [];

  if (!isRecord(body)) {
    throw new ConnectionProfileValidationError(["request body must be a JSON object"]);
  }

  const name = readStringField(body, "name", errors, { required: true });
  const transport = readStringField(body, "transport", errors, { required: true }) as
    | ConnectionTransport
    | undefined;
  const command = readStringField(body, "command", errors);
  const url = readStringField(body, "url", errors);
  const args = readStringArrayField(body, "args", errors);
  const env = readStringRecordField(body, "env", errors);
  const headers = readStringRecordField(body, "headers", errors);

  if (transport !== "stdio" && transport !== "http" && transport !== "sse") {
    errors.push("transport must be one of: stdio, http, sse");
  }

  if (transport === "stdio") {
    if (!command) {
      errors.push("command is required for stdio profiles");
    }

    if (url) {
      errors.push("url is only supported for http and sse profiles");
    }

    if (headers) {
      errors.push("headers are only supported for http and sse profiles");
    }
  }

  if (transport === "http" || transport === "sse") {
    if (!url) {
      errors.push("url is required for http and sse profiles");
    }

    if (command) {
      errors.push("command is only supported for stdio profiles");
    }

    if (args) {
      errors.push("args are only supported for stdio profiles");
    }

    assertHttpUrl(url, "url", errors);
  }

  if (errors.length > 0 || !name || !transport) {
    throw new ConnectionProfileValidationError(errors);
  }

  const timestamp = new Date().toISOString();

  return {
    args,
    command,
    createdAt: timestamp,
    env,
    headers,
    id: createConnectionId(name),
    name,
    transport,
    updatedAt: timestamp,
    url,
  };
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
  const connection = connectionProfiles.find((item) => item.id === connectionId);

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
    const body: ListConnectionsResponse = {
      connections: connectionProfiles.map(toPublicConnectionProfile),
    };

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/connections") {
    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(request, response, 400, { error: "Invalid JSON request body" });
      return;
    }

    try {
      const profile = validateConnectionProfileRequest(body);
      connectionProfiles.unshift(profile);

      const responseBody: CreateConnectionProfileResponse = {
        connection: toPublicConnectionProfile(profile),
      };

      sendJson(request, response, 201, responseBody);
    } catch (error) {
      if (error instanceof ConnectionProfileValidationError) {
        sendJson(request, response, 400, {
          details: error.details,
          error: error.message,
        });
        return;
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, { error: runtimeError.message });
    }
    return;
  }

  const capabilitiesMatch = url.pathname.match(/^\/connections\/([^/]+)\/capabilities$/);

  if (request.method === "GET" && capabilitiesMatch) {
    const connectionId = decodeURIComponent(capabilitiesMatch[1] ?? "");
    const connection = connectionProfiles.find((item) => item.id === connectionId);

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
    const connection = connectionProfiles.find((item) => item.id === connectionId);

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
