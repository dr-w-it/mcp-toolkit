import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ConnectionProfile,
  ConnectionTransport,
  CreateConnectionProfileRequest,
  CreateConnectionProfileResponse,
  CreateSavedRequestResponse,
  DeleteConnectionProfileResponse,
  DeleteSavedRequestResponse,
  ExecuteToolCallRequest,
  ExecuteToolCallResponse,
  ExportTraceRequest,
  ExportTraceResponse,
  GetTraceResponse,
  ImportTraceRequest,
  ImportTraceResponse,
  JsonObject,
  JsonValue,
  ListConnectionsResponse,
  ListHistoryResponse,
  ListSavedRequestsResponse,
  ReplayToolCallRequest,
  ReplayToolCallResponse,
  RuntimeErrorCode,
  RuntimeErrorResponse,
  RuntimeHealthResponse,
  RuntimeThemeResponse,
  SavedRequest,
  TraceArtifact,
  TraceArtifactEntry,
  ToolCallRequest,
  ToolCallResponse,
  TraceEntry,
  UpdateConnectionProfileResponse,
  UpdateSavedRequestResponse,
} from "@dr-w/core";
import {
  createMcpClient,
  InvalidMcpCommandError,
  InvalidMcpUrlError,
  McpConnectionClosedError,
  McpConnectionStartupError,
  UnsupportedMcpTransportError,
  type McpConnection,
} from "@dr-w/mcp-client";
import { createConnectionProfileStore } from "./connectionProfileStore.js";
import { createHistoryStore, isTraceArtifactEntry } from "./historyStore.js";
import { createSavedRequestStore } from "./savedRequestStore.js";
import { createThemeStore } from "./themeStore.js";

const port = Number.parseInt(process.env["INSPECTOR_RUNTIME_PORT"] ?? "8787", 10);
const host = process.env["INSPECTOR_RUNTIME_HOST"] ?? "127.0.0.1";
const webPort = process.env["INSPECTOR_WEB_PORT"] ?? "5000";
const connectionProfileStore = createConnectionProfileStore(
  process.env["INSPECTOR_CONNECTIONS_PATH"] ?? ".mcp-inspector/connections.json",
);
const historyStore = createHistoryStore(process.env["INSPECTOR_HISTORY_PATH"]);
const savedRequestStore = createSavedRequestStore(
  process.env["INSPECTOR_SAVED_REQUESTS_PATH"] ?? ".mcp-inspector/saved-requests.json",
);
const themeStore = createThemeStore({
  requestedThemeId: process.env["INSPECTOR_THEME"],
  themesPath: process.env["INSPECTOR_THEMES_PATH"],
});
const allowedWebOrigins = new Set(
  (
    process.env["INSPECTOR_WEB_ORIGINS"] ??
    `http://127.0.0.1:${webPort},http://localhost:${webPort}`
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const builtInConnectionProfiles: ConnectionProfile[] = [
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
const builtInConnectionProfileIds = new Set(
  builtInConnectionProfiles.map((profile) => profile.id),
);
const connectionProfiles: ConnectionProfile[] = [...builtInConnectionProfiles];

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
const traceRecords = new Map<string, TraceArtifactEntry>(
  traces.map((trace) => [trace.id, { trace }]),
);
const savedRequests: SavedRequest[] = [];
let nextToolCallRequestNumber = 1;
let nextTraceNumber = traces.length + 1;
let nextSavedRequestNumber = 1;
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

class RuntimeRequestError extends Error {
  readonly code: RuntimeErrorCode;
  readonly details?: string[];
  readonly status: number;

  constructor(status: number, code: RuntimeErrorCode, message: string, details?: string[]) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "RuntimeRequestError";
    this.status = status;
  }
}

interface RuntimeErrorResult {
  body: RuntimeErrorResponse;
  code: RuntimeErrorCode;
  status: number;
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
    "Access-Control-Allow-Methods": "DELETE,GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body, null, 2));
}

function createRuntimeErrorBody(
  code: RuntimeErrorCode,
  message: string,
  details?: string[],
): RuntimeErrorResponse {
  return {
    code,
    details,
    error: message,
  };
}

function sendRuntimeError(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  code: RuntimeErrorCode,
  message: string,
  details?: string[],
) {
  sendJson(request, response, status, createRuntimeErrorBody(code, message, details));
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

  const startedAt = Date.now();
  logConnectionDiagnostic("mcp.connection.start", profile, startedAt);

  try {
    const connection = await mcpClient.connect(profile);
    mcpConnections.set(profile.id, connection);
    logConnectionDiagnostic("mcp.connection.success", profile, startedAt);
    return connection;
  } catch (error) {
    logConnectionDiagnostic("mcp.connection.failure", profile, startedAt, error);
    throw error;
  }
}

function toPublicConnectionProfile(profile: ConnectionProfile): ConnectionProfile {
  const { env: _env, headers: _headers, ...publicProfile } = profile;

  return {
    ...publicProfile,
    isBuiltIn: builtInConnectionProfileIds.has(profile.id),
  };
}

function logConnectionDiagnostic(
  event: string,
  profile: ConnectionProfile,
  startedAt: number,
  error?: unknown,
) {
  const runtimeError = error ? getRuntimeError(error) : undefined;
  const message = getDiagnosticErrorMessage(error);
  const diagnostic = {
    event,
    connectionId: profile.id,
    durationMs: Math.max(1, Date.now() - startedAt),
    errorCode: runtimeError?.code,
    hasAuthChallenge: message ? hasAuthenticationChallenge(message) : undefined,
    httpStatus: message ? getHttpStatusFromMessage(message) : undefined,
    targetUrl: sanitizeConnectionUrl(profile),
    transport: profile.transport,
  };

  if (error) {
    console.warn(JSON.stringify(diagnostic));
    return;
  }

  console.info(JSON.stringify(diagnostic));
}

function sanitizeConnectionUrl(profile: ConnectionProfile) {
  if (profile.transport === "stdio" || !profile.url) {
    return undefined;
  }

  try {
    const url = new URL(profile.url);

    url.hash = "";
    url.password = "";
    url.search = "";
    url.username = "";
    return url.toString();
  } catch {
    return "invalid-url";
  }
}

function getDiagnosticErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function getHttpStatusFromMessage(message: string) {
  const statusMatch =
    message.match(/\bstatus(?: code)?[:= ]+(\d{3})\b/i) ??
    message.match(/\b(?:HTTP|returned|response|endpoint)[:= ]+(\d{3})\b/i) ??
    message.match(/\b(401|403|404|408|429|500|502|503|504)\b/);

  return statusMatch?.[1] ? Number.parseInt(statusMatch[1], 10) : undefined;
}

function hasAuthenticationChallenge(message: string) {
  return /www-authenticate|protected resource metadata|authorization required|unauthorized|invalid credentials|invalid token|expired token|insufficient scope|oauth/i.test(
    message,
  );
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
  field: string,
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

function validateConnectionProfileRequest(
  body: unknown,
  existingProfile?: ConnectionProfile,
): ConnectionProfile {
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
    createdAt: existingProfile?.createdAt ?? timestamp,
    env: env ?? existingProfile?.env,
    headers: transport === "stdio" ? undefined : headers ?? existingProfile?.headers,
    id: existingProfile?.id ?? createConnectionId(name),
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

function hydrateConnectionProfiles(persistedProfiles: ConnectionProfile[]) {
  const uniquePersistedProfiles: ConnectionProfile[] = [];
  const persistedProfileIds = new Set<string>();

  for (const profile of persistedProfiles) {
    if (persistedProfileIds.has(profile.id) || builtInConnectionProfileIds.has(profile.id)) {
      continue;
    }

    uniquePersistedProfiles.push(profile);
    persistedProfileIds.add(profile.id);
  }

  const missingBuiltInProfiles = builtInConnectionProfiles.filter(
    (profile) => !persistedProfileIds.has(profile.id),
  );

  connectionProfiles.splice(
    0,
    connectionProfiles.length,
    ...uniquePersistedProfiles,
    ...missingBuiltInProfiles,
  );
}

async function loadPersistedConnectionProfiles() {
  const profiles = await connectionProfileStore.load();

  if (profiles.length === 0) {
    return;
  }

  hydrateConnectionProfiles(profiles);
}

async function persistConnectionProfiles() {
  await connectionProfileStore.save(
    connectionProfiles.filter((profile) => !builtInConnectionProfileIds.has(profile.id)),
  );
}

function createSavedRequestId() {
  const id = `saved-request-${nextSavedRequestNumber.toString().padStart(3, "0")}`;
  nextSavedRequestNumber += 1;

  return id;
}

function readSavedRequestInput(
  body: Record<string, unknown>,
  errors: string[],
): JsonObject | undefined {
  if (body.input === undefined) {
    errors.push("input is required");
    return undefined;
  }

  if (!isJsonObject(body.input)) {
    errors.push("input must be a JSON object");
    return undefined;
  }

  return body.input;
}

function readCreateSavedRequestRequest(
  body: unknown,
  connectionId: string,
): SavedRequest {
  const errors: string[] = [];

  if (!isRecord(body)) {
    throw new RuntimeRequestError(
      400,
      "invalid_tool_input",
      "Saved request body must be a JSON object",
    );
  }

  const name = readStringField(body, "name", errors, { required: true });
  const toolName = readStringField(body, "toolName", errors, { required: true });
  const description = readStringField(body, "description", errors);
  const input = readSavedRequestInput(body, errors);

  if (errors.length > 0 || !name || !toolName || !input) {
    throw new RuntimeRequestError(
      400,
      "invalid_tool_input",
      "Invalid saved request",
      errors,
    );
  }

  const timestamp = new Date().toISOString();

  return {
    connectionId,
    createdAt: timestamp,
    description,
    id: createSavedRequestId(),
    input,
    name,
    toolName,
    updatedAt: timestamp,
  };
}

function readUpdateSavedRequestRequest(
  body: unknown,
  existingRequest: SavedRequest,
): SavedRequest {
  const errors: string[] = [];

  if (!isRecord(body)) {
    throw new RuntimeRequestError(
      400,
      "invalid_tool_input",
      "Saved request body must be a JSON object",
    );
  }

  const name = readStringField(body, "name", errors, { required: true });
  const description = readStringField(body, "description", errors);
  let input = existingRequest.input;

  if (body.input !== undefined) {
    if (isJsonObject(body.input)) {
      input = body.input;
    } else {
      errors.push("input must be a JSON object");
    }
  }

  if (errors.length > 0 || !name) {
    throw new RuntimeRequestError(
      400,
      "invalid_tool_input",
      "Invalid saved request update",
      errors,
    );
  }

  return {
    ...existingRequest,
    description,
    input,
    name,
    updatedAt: new Date().toISOString(),
  };
}

async function persistSavedRequests() {
  await savedRequestStore.save(savedRequests);
}

function refreshSavedRequestSequence(requests: SavedRequest[]) {
  const nextNumber =
    requests.reduce((largestNumber, request) => {
      const requestNumber = readNumericIdSuffix(request.id, "saved-request-");

      return Math.max(largestNumber, requestNumber ?? 0);
    }, 0) + 1;

  nextSavedRequestNumber = Math.max(1, nextNumber);
}

async function loadPersistedSavedRequests() {
  const requests = await savedRequestStore.load();

  if (requests.length === 0) {
    return;
  }

  savedRequests.splice(0, savedRequests.length, ...requests);
  refreshSavedRequestSequence(requests);
}

function createTraceArtifact(entries: TraceArtifactEntry[]): TraceArtifact {
  return {
    entries,
    exportedAt: new Date().toISOString(),
    redaction: {
      excludedConnectionFields: ["headers", "env"],
      notes: [
        "Connection profile secrets are not included in trace exports.",
        "Tool inputs, outputs, and raw MCP protocol payloads are exported as captured and may contain data returned or entered during local debugging.",
      ],
    },
    source: "mcp-inspector",
    version: 1,
  };
}

function getTraceRecord(trace: TraceEntry): TraceArtifactEntry {
  const existingRecord = traceRecords.get(trace.id);

  if (existingRecord) {
    return {
      ...existingRecord,
      trace,
    };
  }

  const request = trace.requestId ? toolCallRequests.get(trace.requestId) : undefined;
  const response = trace.requestId ? toolCallResponses.get(trace.requestId) : undefined;

  return {
    request,
    response,
    trace,
  };
}

async function persistHistory() {
  await historyStore.save(traces.map(getTraceRecord));
}

function pruneConnectionData(connectionId: string) {
  const removedRequestIds = new Set(
    [...toolCallRequests.values()]
      .filter((request) => request.connectionId === connectionId)
      .map((request) => request.id),
  );

  connectionProfiles.splice(
    0,
    connectionProfiles.length,
    ...connectionProfiles.filter((profile) => profile.id !== connectionId),
  );
  savedRequests.splice(
    0,
    savedRequests.length,
    ...savedRequests.filter((savedRequest) => savedRequest.connectionId !== connectionId),
  );
  traces.splice(
    0,
    traces.length,
    ...traces.filter((trace) => trace.connectionId !== connectionId),
  );

  for (const [traceId, entry] of traceRecords) {
    if (entry.trace.connectionId === connectionId) {
      traceRecords.delete(traceId);
    }
  }

  for (const requestId of removedRequestIds) {
    toolCallRequests.delete(requestId);
    toolCallResponses.delete(requestId);
  }
}

function exportTraceEntries(body: Partial<ExportTraceRequest>): TraceArtifactEntry[] {
  const traceIds = new Set(body.traceIds ?? []);
  const requestIds = new Set(body.requestIds ?? []);
  const hasSelection = traceIds.size > 0 || requestIds.size > 0;
  const selectedTraces = hasSelection
    ? traces.filter(
        (trace) =>
          traceIds.has(trace.id) || (trace.requestId ? requestIds.has(trace.requestId) : false),
      )
    : traces;

  return selectedTraces.map(getTraceRecord);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    isJsonObject(value)
  );
}

function isTraceArtifact(value: unknown): value is TraceArtifact {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.source === "mcp-inspector" &&
    typeof value.exportedAt === "string" &&
    Array.isArray(value.entries) &&
    value.entries.every(isTraceArtifactEntry)
  );
}

function readExportTraceRequest(body: unknown): ExportTraceRequest {
  if (!isRecord(body)) {
    throw new Error("request body must be a JSON object");
  }

  if (body.traceIds !== undefined && !isStringArray(body.traceIds)) {
    throw new Error("traceIds must be an array of strings");
  }

  if (body.requestIds !== undefined && !isStringArray(body.requestIds)) {
    throw new Error("requestIds must be an array of strings");
  }

  return {
    requestIds: body.requestIds,
    traceIds: body.traceIds,
  };
}

function readImportTraceRequest(body: unknown): ImportTraceRequest {
  if (!isRecord(body)) {
    throw new Error("request body must be a JSON object");
  }

  if (!isTraceArtifact(body.trace)) {
    throw new Error("trace must be a valid MCP Inspector trace artifact");
  }

  return {
    trace: body.trace,
  };
}

function readExecuteToolCallRequest(body: unknown): ExecuteToolCallRequest {
  if (!isRecord(body)) {
    throw new RuntimeRequestError(400, "invalid_tool_input", "Tool input request must be a JSON object");
  }

  if (body.input === undefined) {
    return { input: {} };
  }

  if (!isRecord(body.input)) {
    throw new RuntimeRequestError(400, "invalid_tool_input", "Tool input must be a JSON object");
  }

  return { input: body.input as JsonObject };
}

function importTraceArtifact(artifact: TraceArtifact): TraceArtifactEntry[] {
  const importedAt = new Date().toISOString();

  return artifact.entries.map((entry) => {
    const traceNumber = nextTraceNumber;
    nextTraceNumber += 1;

    const trace: TraceEntry = {
      ...entry.trace,
      id: `imported-trace-${traceNumber.toString().padStart(3, "0")}`,
      importedAt,
      source: "imported",
    };
    const importedEntry: TraceArtifactEntry = {
      request: entry.request,
      response: entry.response,
      trace,
    };

    traceRecords.set(trace.id, importedEntry);
    traces.unshift(trace);

    return importedEntry;
  });
}

function readNumericIdSuffix(id: string, prefix: string) {
  if (!id.startsWith(prefix)) {
    return undefined;
  }

  const suffix = id.slice(prefix.length);

  if (!/^\d+$/.test(suffix)) {
    return undefined;
  }

  return Number.parseInt(suffix, 10);
}

function refreshSequenceNumbers(entries: TraceArtifactEntry[]) {
  const nextRequestNumber =
    entries.reduce((largestNumber, entry) => {
      const requestNumber = entry.request
        ? readNumericIdSuffix(entry.request.id, "request-")
        : undefined;

      return Math.max(largestNumber, requestNumber ?? 0);
    }, 0) + 1;
  const nextLoadedTraceNumber =
    entries.reduce((largestNumber, entry) => {
      const traceNumber =
        readNumericIdSuffix(entry.trace.id, "trace-") ??
        readNumericIdSuffix(entry.trace.id, "imported-trace-");

      return Math.max(largestNumber, traceNumber ?? 0);
    }, 0) + 1;

  nextToolCallRequestNumber = Math.max(1, nextRequestNumber);
  nextTraceNumber = Math.max(1, nextLoadedTraceNumber);
}

function hydrateHistory(entries: TraceArtifactEntry[]) {
  traces.splice(
    0,
    traces.length,
    ...entries.map((entry) => entry.trace),
  );
  traceRecords.clear();
  toolCallRequests.clear();
  toolCallResponses.clear();

  for (const entry of entries) {
    traceRecords.set(entry.trace.id, entry);

    if (entry.request) {
      toolCallRequests.set(entry.request.id, entry.request);
    }

    if (entry.response) {
      toolCallResponses.set(entry.response.requestId, entry.response);
    }
  }

  refreshSequenceNumbers(entries);
}

async function loadPersistedHistory() {
  const entries = await historyStore.load();

  if (entries.length === 0) {
    return;
  }

  hydrateHistory(entries);
}

async function createToolCall(
  connectionId: string,
  toolName: string,
  input: JsonValue,
): Promise<ExecuteToolCallResponse> {
  const startedAt = new Date();
  const requestNumber = nextToolCallRequestNumber;
  nextToolCallRequestNumber += 1;
  const request: ToolCallRequest = {
    id: `request-${requestNumber.toString().padStart(3, "0")}`,
    connectionId,
    toolName,
    input,
    createdAt: startedAt.toISOString(),
  };
  const connection = connectionProfiles.find((item) => item.id === connectionId);

  if (!connection) {
    throw new RuntimeRequestError(404, "connection_not_found", "Connection not found");
  }

  const mcpConnection = await getMcpConnection(connection);
  const response = await mcpConnection.callTool(toolName, input, request.id);
  const traceNumber = nextTraceNumber;
  nextTraceNumber += 1;
  const trace: TraceEntry = {
    id: `trace-${traceNumber.toString().padStart(3, "0")}`,
    connectionId,
    operation: `tools/call ${toolName}`,
    status: response.status,
    startedAt: request.createdAt,
    durationMs: response.durationMs,
    requestId: request.id,
    error: response.error,
    errorCode: response.errorCode,
  };

  toolCallRequests.set(request.id, request);
  toolCallResponses.set(request.id, response);
  traceRecords.set(trace.id, {
    request,
    response,
    trace,
  });
  traces.unshift(trace);

  return {
    request,
    response,
    trace,
  };
}

function getRuntimeError(error: unknown): RuntimeErrorResult {
  if (error instanceof RuntimeRequestError) {
    return createRuntimeErrorResult(error.status, error.code, error.message, error.details);
  }

  if (error instanceof UnsupportedMcpTransportError) {
    return createRuntimeErrorResult(400, "unsupported_transport", error.message);
  }

  if (error instanceof InvalidMcpCommandError) {
    return createRuntimeErrorResult(400, "invalid_mcp_command", error.message);
  }

  if (error instanceof InvalidMcpUrlError) {
    return createRuntimeErrorResult(400, "invalid_mcp_url", error.message);
  }

  if (error instanceof McpConnectionStartupError) {
    return classifyMcpStartupError(error);
  }

  if (error instanceof McpConnectionClosedError) {
    return createRuntimeErrorResult(502, "mcp_connection_closed", error.message);
  }

  if (error instanceof Error && /timeout/i.test(error.message)) {
    return createRuntimeErrorResult(504, "timeout", error.message);
  }

  return createRuntimeErrorResult(
    500,
    "unknown_runtime_error",
    error instanceof Error ? error.message : "Runtime request failed",
  );
}

function createRuntimeErrorResult(
  status: number,
  code: RuntimeErrorCode,
  message: string,
  details?: string[],
): RuntimeErrorResult {
  return {
    body: createRuntimeErrorBody(code, message, details),
    code,
    status,
  };
}

function classifyMcpStartupError(error: McpConnectionStartupError): RuntimeErrorResult {
  const status = getHttpStatusFromMessage(error.message);
  const authDetails = status
    ? [`Upstream HTTP status: ${status}`]
    : ["Upstream response looked like an authentication challenge."];

  if (/insufficient scope/i.test(error.message) || status === 403) {
    return createRuntimeErrorResult(
      403,
      "insufficient_scope",
      "Remote MCP server rejected the connection because the current credentials do not have enough scope.",
      authDetails,
    );
  }

  if (/expired token/i.test(error.message)) {
    return createRuntimeErrorResult(
      401,
      "expired_token",
      "Remote MCP server rejected the connection because the current credentials expired.",
      authDetails,
    );
  }

  if (hasAuthenticationChallenge(error.message) || status === 401) {
    return createRuntimeErrorResult(
      401,
      "authentication_required",
      "Remote MCP server requires authentication before capabilities can be discovered.",
      authDetails,
    );
  }

  if (/fetch failed|network|econnrefused|enotfound|socket|transport/i.test(error.message)) {
    return createRuntimeErrorResult(
      502,
      "mcp_transport_failed",
      `MCP transport failed: ${error.message}`,
    );
  }

  return createRuntimeErrorResult(
    502,
    "mcp_startup_failed",
    `MCP server startup failed: ${error.message}`,
  );
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendRuntimeError(request, response, 400, "unknown_runtime_error", "Missing request URL");
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

  if (request.method === "GET" && url.pathname === "/theme") {
    const body: RuntimeThemeResponse = await themeStore.getTheme();

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
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const profile = validateConnectionProfileRequest(body);
      connectionProfiles.unshift(profile);

      try {
        await persistConnectionProfiles();
      } catch (error) {
        connectionProfiles.shift();
        throw error;
      }

      const responseBody: CreateConnectionProfileResponse = {
        connection: toPublicConnectionProfile(profile),
      };

      sendJson(request, response, 201, responseBody);
    } catch (error) {
      if (error instanceof ConnectionProfileValidationError) {
        sendJson(request, response, 400, {
          code: "invalid_connection_profile",
          details: error.details,
          error: error.message,
        });
        return;
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  const connectionMatch = url.pathname.match(/^\/connections\/([^/]+)$/);

  if (request.method === "PUT" && connectionMatch) {
    const connectionId = decodeURIComponent(connectionMatch[1] ?? "");
    const profileIndex = connectionProfiles.findIndex((item) => item.id === connectionId);

    if (profileIndex < 0) {
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const existingProfile = connectionProfiles[profileIndex];
      if (!existingProfile) {
        sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
        return;
      }

      const profile = validateConnectionProfileRequest(
        body,
        existingProfile,
      );
      connectionProfiles[profileIndex] = profile;

      try {
        await persistConnectionProfiles();
      } catch (error) {
        connectionProfiles[profileIndex] = existingProfile;
        throw error;
      }

      closeMcpConnection(profile.id);

      const responseBody: UpdateConnectionProfileResponse = {
        connection: toPublicConnectionProfile(profile),
      };

      sendJson(request, response, 200, responseBody);
    } catch (error) {
      if (error instanceof ConnectionProfileValidationError) {
        sendJson(request, response, 400, {
          code: "invalid_connection_profile",
          details: error.details,
          error: error.message,
        });
        return;
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  if (request.method === "DELETE" && connectionMatch) {
    const connectionId = decodeURIComponent(connectionMatch[1] ?? "");
    const connection = connectionProfiles.find((item) => item.id === connectionId);

    if (!connection) {
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    if (builtInConnectionProfileIds.has(connectionId)) {
      sendRuntimeError(
        request,
        response,
        400,
        "invalid_connection_profile",
        "Built-in connection profiles cannot be deleted",
      );
      return;
    }

    const previousConnectionProfiles = [...connectionProfiles];
    const previousSavedRequests = [...savedRequests];
    const previousTraces = [...traces];
    const previousTraceRecords = new Map(traceRecords);
    const previousToolCallRequests = new Map(toolCallRequests);
    const previousToolCallResponses = new Map(toolCallResponses);

    pruneConnectionData(connectionId);

    try {
      await Promise.all([
        persistConnectionProfiles(),
        persistSavedRequests(),
        persistHistory(),
      ]);
    } catch (error) {
      connectionProfiles.splice(0, connectionProfiles.length, ...previousConnectionProfiles);
      savedRequests.splice(0, savedRequests.length, ...previousSavedRequests);
      traces.splice(0, traces.length, ...previousTraces);
      traceRecords.clear();
      toolCallRequests.clear();
      toolCallResponses.clear();

      for (const [traceId, entry] of previousTraceRecords) {
        traceRecords.set(traceId, entry);
      }

      for (const [requestId, toolCallRequest] of previousToolCallRequests) {
        toolCallRequests.set(requestId, toolCallRequest);
      }

      for (const [requestId, toolCallResponse] of previousToolCallResponses) {
        toolCallResponses.set(requestId, toolCallResponse);
      }

      await Promise.allSettled([
        persistConnectionProfiles(),
        persistSavedRequests(),
        persistHistory(),
      ]);

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
      return;
    }

    closeMcpConnection(connectionId);

    const responseBody: DeleteConnectionProfileResponse = { deletedId: connectionId };

    sendJson(request, response, 200, responseBody);
    return;
  }

  const capabilitiesMatch = url.pathname.match(/^\/connections\/([^/]+)\/capabilities$/);

  if (request.method === "GET" && capabilitiesMatch) {
    const connectionId = decodeURIComponent(capabilitiesMatch[1] ?? "");
    const connection = connectionProfiles.find((item) => item.id === connectionId);

    if (!connection) {
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    const startedAt = Date.now();
    logConnectionDiagnostic("mcp.capabilities.start", connection, startedAt);

    try {
      const mcpConnection = await getMcpConnection(connection);
      const discoveredCapabilities = await mcpConnection.capabilities();

      logConnectionDiagnostic("mcp.capabilities.success", connection, startedAt);
      sendJson(request, response, 200, discoveredCapabilities);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      logConnectionDiagnostic("mcp.capabilities.failure", connection, startedAt, error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  const savedRequestsMatch = url.pathname.match(/^\/connections\/([^/]+)\/saved-requests$/);

  if (request.method === "GET" && savedRequestsMatch) {
    const connectionId = decodeURIComponent(savedRequestsMatch[1] ?? "");
    const connection = connectionProfiles.find((item) => item.id === connectionId);

    if (!connection) {
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    const body: ListSavedRequestsResponse = {
      savedRequests: savedRequests.filter((item) => item.connectionId === connectionId),
    };

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "POST" && savedRequestsMatch) {
    const connectionId = decodeURIComponent(savedRequestsMatch[1] ?? "");
    const connection = connectionProfiles.find((item) => item.id === connectionId);

    if (!connection) {
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const savedRequest = readCreateSavedRequestRequest(body, connectionId);
      savedRequests.unshift(savedRequest);

      try {
        await persistSavedRequests();
      } catch (error) {
        savedRequests.shift();
        throw error;
      }

      const responseBody: CreateSavedRequestResponse = { savedRequest };

      sendJson(request, response, 201, responseBody);
    } catch (error) {
      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  const savedRequestMatch = url.pathname.match(/^\/saved-requests\/([^/]+)$/);

  if (request.method === "PUT" && savedRequestMatch) {
    const savedRequestId = decodeURIComponent(savedRequestMatch[1] ?? "");
    const savedRequestIndex = savedRequests.findIndex((item) => item.id === savedRequestId);

    if (savedRequestIndex < 0) {
      sendRuntimeError(
        request,
        response,
        404,
        "saved_request_not_found",
        "Saved request not found",
      );
      return;
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const existingSavedRequest = savedRequests[savedRequestIndex];
      if (!existingSavedRequest) {
        sendRuntimeError(
          request,
          response,
          404,
          "saved_request_not_found",
          "Saved request not found",
        );
        return;
      }

      const updatedSavedRequest = readUpdateSavedRequestRequest(body, existingSavedRequest);
      savedRequests[savedRequestIndex] = updatedSavedRequest;

      try {
        await persistSavedRequests();
      } catch (error) {
        savedRequests[savedRequestIndex] = existingSavedRequest;
        throw error;
      }

      const responseBody: UpdateSavedRequestResponse = {
        savedRequest: updatedSavedRequest,
      };

      sendJson(request, response, 200, responseBody);
    } catch (error) {
      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  if (request.method === "DELETE" && savedRequestMatch) {
    const savedRequestId = decodeURIComponent(savedRequestMatch[1] ?? "");
    const savedRequestIndex = savedRequests.findIndex((item) => item.id === savedRequestId);

    if (savedRequestIndex < 0) {
      sendRuntimeError(
        request,
        response,
        404,
        "saved_request_not_found",
        "Saved request not found",
      );
      return;
    }

    const [deletedSavedRequest] = savedRequests.splice(savedRequestIndex, 1);

    try {
      await persistSavedRequests();
    } catch (error) {
      if (deletedSavedRequest) {
        savedRequests.splice(savedRequestIndex, 0, deletedSavedRequest);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
      return;
    }

    const responseBody: DeleteSavedRequestResponse = { deletedId: savedRequestId };

    sendJson(request, response, 200, responseBody);
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
      sendRuntimeError(request, response, 404, "connection_not_found", "Connection not found");
      return;
    }

    let mcpConnection: McpConnection;
    let discoveredTools: Awaited<ReturnType<McpConnection["capabilities"]>>["tools"];
    const startedAt = Date.now();
    logConnectionDiagnostic("mcp.tool-discovery.start", connection, startedAt);

    try {
      mcpConnection = await getMcpConnection(connection);
      discoveredTools = (await mcpConnection.capabilities()).tools;
      logConnectionDiagnostic("mcp.tool-discovery.success", connection, startedAt);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      logConnectionDiagnostic("mcp.tool-discovery.failure", connection, startedAt, error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
      return;
    }

    const tool = discoveredTools.find((item) => item.name === toolName);

    if (!tool) {
      sendRuntimeError(request, response, 404, "tool_not_found", "Tool not found");
      return;
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const toolCallRequest = readExecuteToolCallRequest(body);
      const toolCallResponse = await createToolCall(
        connection.id,
        tool.name,
        toolCallRequest.input,
      );
      await persistHistory();

      sendJson(request, response, 200, toolCallResponse);
    } catch (error) {
      if (error instanceof McpConnectionClosedError) {
        closeMcpConnection(connection.id);
      }

      const runtimeError = getRuntimeError(error);
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/history") {
    const body: ListHistoryResponse = { traces };

    sendJson(request, response, 200, body);
    return;
  }

  const historyMatch = url.pathname.match(/^\/history\/([^/]+)$/);

  if (request.method === "GET" && historyMatch) {
    const traceId = decodeURIComponent(historyMatch[1] ?? "");
    const trace = traces.find((item) => item.id === traceId);

    if (!trace) {
      sendRuntimeError(request, response, 404, "trace_not_found", "Trace not found");
      return;
    }

    const body: GetTraceResponse = getTraceRecord(trace);

    sendJson(request, response, 200, body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/traces/export") {
    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const exportRequest = readExportTraceRequest(body);
      const responseBody: ExportTraceResponse = {
        trace: createTraceArtifact(exportTraceEntries(exportRequest)),
      };

      sendJson(request, response, 200, responseBody);
    } catch (error) {
      sendJson(request, response, 400, {
        error: error instanceof Error ? error.message : "Invalid trace export request",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/traces/import") {
    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    try {
      const importRequest = readImportTraceRequest(body);
      const imported = importTraceArtifact(importRequest.trace);
      await persistHistory();
      const responseBody: ImportTraceResponse = {
        imported,
        traces,
      };

      sendJson(request, response, 200, responseBody);
    } catch (error) {
      sendJson(request, response, 400, {
        error: error instanceof Error ? error.message : "Invalid trace import request",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/replay") {
    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch {
      sendRuntimeError(request, response, 400, "invalid_json", "Invalid JSON request body");
      return;
    }

    const replayRequest = body as Partial<ReplayToolCallRequest>;

    if (!replayRequest.requestId || !toolCallRequests.has(replayRequest.requestId)) {
      sendRuntimeError(
        request,
        response,
        404,
        "replay_request_not_found",
        "Replayable request not found",
      );
      return;
    }

    const originalRequest = toolCallRequests.get(replayRequest.requestId);
    const originalResponse = toolCallResponses.get(replayRequest.requestId);

    if (!originalRequest || !originalResponse) {
      sendRuntimeError(
        request,
        response,
        404,
        "replay_request_not_found",
        "Replayable request not found",
      );
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
        replayedFromRequestId: originalRequest.id,
        requestId: replayedCall.request.id,
      };

      traces[0] = trace;
      traceRecords.set(trace.id, {
        request: replayedCall.request,
        response: replayedCall.response,
        trace,
      });
      await persistHistory();

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
      sendJson(request, response, runtimeError.status, runtimeError.body);
    }
    return;
  }

  sendRuntimeError(request, response, 404, "unknown_runtime_error", "Not found");
});

await loadPersistedConnectionProfiles();
await loadPersistedSavedRequests();
await loadPersistedHistory();

server.listen(port, host, () => {
  console.log(`Inspector Runtime listening on http://${host}:${port}`);
  console.log(
    `Inspector Runtime connection profile persistence: ${connectionProfileStore.storagePath}`,
  );
  console.log(`Inspector Runtime saved request persistence: ${savedRequestStore.storagePath}`);
  if (historyStore.storagePath) {
    console.log(`Inspector Runtime history persistence: ${historyStore.storagePath}`);
  }
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
