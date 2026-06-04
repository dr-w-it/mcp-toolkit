export type ConnectionTransport = "stdio" | "http" | "sse";

export interface ConnectionProfile {
  id: string;
  name: string;
  transport: ConnectionTransport;
  isBuiltIn?: boolean;
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

export interface DeleteConnectionProfileResponse {
  deletedId: string;
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
  errorCode?: RuntimeErrorCode;
  rawRequest?: JsonValue;
  rawResponse?: JsonValue;
  durationMs: number;
  completedAt: string;
}

export interface SavedRequest {
  id: string;
  connectionId: string;
  name: string;
  toolName: string;
  input: JsonObject;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedRequestRequest {
  name: string;
  toolName: string;
  input: JsonObject;
  description?: string;
}

export interface CreateSavedRequestResponse {
  savedRequest: SavedRequest;
}

export interface UpdateSavedRequestRequest {
  name: string;
  description?: string;
}

export interface UpdateSavedRequestResponse {
  savedRequest: SavedRequest;
}

export interface ListSavedRequestsResponse {
  savedRequests: SavedRequest[];
}

export interface DeleteSavedRequestResponse {
  deletedId: string;
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
  errorCode?: RuntimeErrorCode;
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

export interface ThemeDefinition {
  id: string;
  name: string;
  tokens: Record<string, string>;
}

export interface ThemeDiagnostic {
  level: "info" | "warning";
  message: string;
}

export interface RuntimeThemeResponse {
  activeTheme: ThemeDefinition;
  availableThemes: ThemeDefinition[];
  diagnostics: ThemeDiagnostic[];
  requestedThemeId?: string;
  themesPath: string;
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

export type RuntimeErrorCode =
  | "connection_not_found"
  | "invalid_connection_profile"
  | "invalid_json"
  | "invalid_mcp_command"
  | "invalid_mcp_url"
  | "invalid_tool_input"
  | "mcp_connection_closed"
  | "mcp_startup_failed"
  | "mcp_tool_result_error"
  | "mcp_transport_failed"
  | "replay_request_not_found"
  | "saved_request_not_found"
  | "schema_validation_failed"
  | "timeout"
  | "tool_not_found"
  | "trace_not_found"
  | "unsupported_transport"
  | "unknown_runtime_error";

export interface RuntimeErrorResponse {
  error: string;
  code: RuntimeErrorCode;
  details?: string[];
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
