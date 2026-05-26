import { createServer, type ServerResponse } from "node:http";
import type { CapabilitySummary, ConnectionProfile, TraceEntry } from "@dr-w/core";

const port = Number.parseInt(process.env["INSPECTOR_RUNTIME_PORT"] ?? "8787", 10);
const host = process.env["INSPECTOR_RUNTIME_HOST"] ?? "127.0.0.1";

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
];

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

const server = createServer((request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "inspector-runtime",
      mode: "local",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/connections") {
    sendJson(response, 200, { connections });
    return;
  }

  if (request.method === "GET" && url.pathname === "/connections/local-filesystem/capabilities") {
    sendJson(response, 200, capabilities);
    return;
  }

  if (request.method === "GET" && url.pathname === "/history") {
    sendJson(response, 200, { traces });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Inspector Runtime listening on http://${host}:${port}`);
});
