import type { CapabilitySummary, ConnectionProfile, TraceEntry } from "@dr-w/core";

export const connectionProfiles: ConnectionProfile[] = [
  {
    id: "local-filesystem",
    name: "Local filesystem server",
    transport: "stdio",
    isBuiltIn: true,
    command: "npx @modelcontextprotocol/server-filesystem ./",
    createdAt: "2026-05-26T08:30:00.000Z",
    updatedAt: "2026-05-26T08:30:00.000Z",
  },
  {
    id: "remote-demo",
    name: "Remote demo server",
    transport: "http",
    url: "https://mcp.example.test",
    createdAt: "2026-05-26T08:35:00.000Z",
    updatedAt: "2026-05-26T08:35:00.000Z",
  },
];

export const capabilitySummary: CapabilitySummary = {
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
    {
      name: "list_directory",
      description: "List files and folders for a path.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
      },
    },
  ],
  resources: [
    {
      uri: "file:///workspace",
      name: "Workspace",
      mimeType: "inode/directory",
    },
  ],
  prompts: [
    {
      name: "summarize_file",
      description: "Summarize the selected file.",
    },
  ],
};

export const traceEntries: TraceEntry[] = [
  {
    id: "trace-001",
    connectionId: "local-filesystem",
    operation: "tools/list",
    status: "success",
    startedAt: "2026-05-26T08:40:00.000Z",
    durationMs: 42,
  },
  {
    id: "trace-002",
    connectionId: "local-filesystem",
    operation: "tools/call read_file",
    status: "success",
    startedAt: "2026-05-26T08:41:12.000Z",
    durationMs: 118,
  },
  {
    id: "trace-003",
    connectionId: "remote-demo",
    operation: "resources/list",
    status: "error",
    startedAt: "2026-05-26T08:42:09.000Z",
    durationMs: 305,
    error: "Unauthorized",
  },
];
