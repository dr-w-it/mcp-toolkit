export type ConnectionTransport = "stdio" | "http" | "sse";

export interface ConnectionProfile {
  id: string;
  name: string;
  transport: ConnectionTransport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionProfileRequest {
  name: string;
  transport: ConnectionTransport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface CreateConnectionProfileResponse {
  connection: ConnectionProfile;
}

export type UpdateConnectionProfileRequest = CreateConnectionProfileRequest;

export interface UpdateConnectionProfileResponse {
  connection: ConnectionProfile;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface ResourceDefinition {
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
}

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface CapabilitySummary {
  connectionId: string;
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
  prompts: PromptDefinition[];
}

export interface ToolCallRequest {
  id: string;
  connectionId: string;
  toolName: string;
  input: JsonValue;
  createdAt: string;
}

export interface ToolCallResponse {
  requestId: string;
  status: "success" | "error";
  output?: JsonValue;
  error?: string;
  rawRequest?: JsonValue;
  rawResponse?: JsonValue;
  durationMs: number;
  completedAt: string;
}

export interface ExecuteToolCallRequest {
  input: JsonValue;
}

export interface ExecuteToolCallResponse {
  request: ToolCallRequest;
  response: ToolCallResponse;
  trace: TraceEntry;
}

export interface TraceEntry {
  id: string;
  connectionId: string;
  operation: string;
  status: "success" | "error";
  startedAt: string;
  durationMs: number;
  requestId?: string;
  error?: string;
  source?: "live" | "imported";
  importedAt?: string;
  replayedFromRequestId?: string;
}

export interface TraceArtifactEntry {
  trace: TraceEntry;
  request?: ToolCallRequest;
  response?: ToolCallResponse;
}

export interface TraceRedactionSummary {
  excludedConnectionFields: string[];
  notes: string[];
}

export interface TraceArtifact {
  version: 1;
  source: "mcp-inspector";
  exportedAt: string;
  redaction: TraceRedactionSummary;
  entries: TraceArtifactEntry[];
}

export interface ExportTraceRequest {
  traceIds?: string[];
  requestIds?: string[];
}

export interface ExportTraceResponse {
  trace: TraceArtifact;
}

export interface ImportTraceRequest {
  trace: TraceArtifact;
}

export interface ImportTraceResponse {
  imported: TraceArtifactEntry[];
  traces: TraceEntry[];
}

export type GetTraceResponse = TraceArtifactEntry;

export interface RuntimeHealthResponse {
  ok: true;
  service: "inspector-runtime";
  mode: "local";
}

export interface ListConnectionsResponse {
  connections: ConnectionProfile[];
}

export type GetConnectionCapabilitiesResponse = CapabilitySummary;

export interface ListHistoryResponse {
  traces: TraceEntry[];
}

export interface ReplayToolCallRequest {
  requestId: string;
}

export interface ReplayToolCallResponse {
  replayedFromRequestId: string;
  request: ToolCallRequest;
  response: ToolCallResponse;
  trace: TraceEntry;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
