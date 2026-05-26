import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  CapabilitySummary,
  ConnectionProfile,
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
const allowedWebOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

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

function getAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;

  if (origin && allowedWebOrigins.has(origin)) {
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

    if (replayRequest.requestId !== sampleToolCallRequest.id) {
      sendJson(request, response, 404, { error: "Replayable request not found" });
      return;
    }

    const trace: TraceEntry = {
      id: "trace-003",
      connectionId: sampleToolCallRequest.connectionId,
      operation: `replay ${sampleToolCallRequest.toolName}`,
      status: "success",
      startedAt: new Date().toISOString(),
      durationMs: sampleToolCallResponse.durationMs,
      requestId: sampleToolCallRequest.id,
    };

    const replayResponse: ReplayToolCallResponse = {
      replayedFromRequestId: sampleToolCallRequest.id,
      request: sampleToolCallRequest,
      response: {
        ...sampleToolCallResponse,
        completedAt: new Date().toISOString(),
      },
      trace,
    };

    sendJson(request, response, 200, replayResponse);
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Inspector Runtime listening on http://${host}:${port}`);
});
