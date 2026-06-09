import type {
  CapabilitySummary,
  ConnectionProfile,
  JsonObject,
  JsonValue,
  PromptDefinition,
  ResourceDefinition,
  RuntimeErrorCode,
  ToolCallResponse,
  ToolDefinition,
} from "@dr-w/core";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";

export interface McpClient {
  connect(profile: ConnectionProfile): Promise<McpConnection>;
  clearOAuthSession(connectionId: string): void;
  completeOAuthAuthorization(state: string, authorizationCode: string): Promise<string>;
  startOAuthAuthorization(
    profile: ConnectionProfile,
    options: StartOAuthAuthorizationOptions,
  ): Promise<StartOAuthAuthorizationResult>;
}

export interface McpConnection {
  profile: ConnectionProfile;
  capabilities(): Promise<CapabilitySummary>;
  callTool(toolName: string, input: JsonValue, requestId: string): Promise<ToolCallResponse>;
  close(): Promise<void>;
}

export interface StartOAuthAuthorizationOptions {
  callbackUrl: string;
}

export interface StartOAuthAuthorizationResult {
  authorizationUrl: string;
  callbackUrl: string;
  state: string;
}

export class UnsupportedMcpTransportError extends Error {
  constructor(transport: ConnectionProfile["transport"]) {
    super(`Unsupported MCP transport: ${transport}`);
    this.name = "UnsupportedMcpTransportError";
  }
}

export class InvalidMcpCommandError extends Error {
  constructor(message = "A stdio connection requires a command") {
    super(message);
    this.name = "InvalidMcpCommandError";
  }
}

export class InvalidMcpUrlError extends Error {
  constructor(message = "An HTTP or SSE connection requires a valid URL") {
    super(message);
    this.name = "InvalidMcpUrlError";
  }
}

export class McpConnectionClosedError extends Error {
  constructor(message = "MCP server process exited") {
    super(message);
    this.name = "McpConnectionClosedError";
  }
}

export class McpConnectionStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConnectionStartupError";
  }
}

export class McpOAuthAuthorizationError extends Error {
  constructor(message = "OAuth authorization failed") {
    super(message);
    this.name = "McpOAuthAuthorizationError";
  }
}

interface OAuthSession {
  authorizationUrl?: string;
  connectionId: string;
  pendingTransport?: StreamableHTTPClientTransport;
  provider: RuntimeOAuthClientProvider;
  state: string;
}

interface CapturedMessage {
  direction: "sent" | "received";
  message: JSONRPCMessage;
}

class CapturingTransport implements Transport {
  readonly messages: CapturedMessage[] = [];
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;

  constructor(private readonly transport: Transport) {}

  async start(): Promise<void> {
    this.transport.onclose = () => this.onclose?.();
    this.transport.onerror = (error) => this.onerror?.(error);
    this.transport.onmessage = (message) => {
      this.messages.push({ direction: "received", message });
      this.onmessage?.(message);
    };
    this.setProtocolVersion = (version) => this.transport.setProtocolVersion?.(version);
    await this.transport.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    this.messages.push({ direction: "sent", message });
    await this.transport.send(message, options);
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  mark(): number {
    return this.messages.length;
  }

  exchangeSince(mark: number, method: string, paramsName?: string) {
    const request = this.messages
      .slice(mark)
      .find((entry) => {
        if (entry.direction !== "sent" || !isJsonRpcRequest(entry.message)) {
          return false;
        }

        if (entry.message.method !== method) {
          return false;
        }

        if (!paramsName) {
          return true;
        }

        const params = isRecord(entry.message.params) ? entry.message.params : {};
        return params["name"] === paramsName;
      })
      ?.message;

    if (!request || !isJsonRpcRequest(request)) {
      return {};
    }

    const response = this.messages
      .slice(mark)
      .find(
        (entry) =>
          entry.direction === "received" &&
          isJsonRpcResponse(entry.message) &&
          entry.message.id === request.id,
      )
      ?.message;

    return {
      rawRequest: toJsonValue(request),
      rawResponse: response ? toJsonValue(response) : undefined,
    };
  }
}

class RuntimeOAuthClientProvider implements OAuthClientProvider {
  private clientInformationValue?: OAuthClientInformationMixed;
  private codeVerifierValue?: string;
  private discoveryStateValue?: OAuthDiscoveryState;
  private tokensValue?: OAuthTokens;

  constructor(
    private readonly callbackUrl: string,
    private readonly stateValue: string,
    private readonly onRedirect: (authorizationUrl: URL) => void,
  ) {}

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "MCP Toolkit",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [this.callbackUrl],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  state(): string {
    return this.stateValue;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInformationValue;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.clientInformationValue = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.tokensValue;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.tokensValue = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.codeVerifierValue = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.codeVerifierValue) {
      throw new McpOAuthAuthorizationError("OAuth code verifier is missing");
    }

    return this.codeVerifierValue;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "all" || scope === "client") {
      this.clientInformationValue = undefined;
    }

    if (scope === "all" || scope === "tokens") {
      this.tokensValue = undefined;
    }

    if (scope === "all" || scope === "verifier") {
      this.codeVerifierValue = undefined;
    }

    if (scope === "all" || scope === "discovery") {
      this.discoveryStateValue = undefined;
    }
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.discoveryStateValue = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.discoveryStateValue;
  }
}

export class DefaultMcpClient implements McpClient {
  private readonly oauthSessions = new Map<string, OAuthSession>();
  private readonly oauthStates = new Map<string, string>();

  async connect(profile: ConnectionProfile): Promise<McpConnection> {
    const transport = new CapturingTransport(
      createTransport(profile, this.oauthSessions.get(profile.id)?.provider),
    );
    const client = new Client({
      name: "mcp-inspector-runtime",
      version: "0.0.0",
    });

    let closed = false;
    let startupError = "";

    transport.onclose = () => {
      closed = true;
    };
    transport.onerror = (error) => {
      startupError = error.message;
    };

    try {
      await client.connect(transport, { timeout: 15_000 });
    } catch (error) {
      await transport.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : "Failed to start MCP server";
      throw new McpConnectionStartupError(startupError || message);
    }

    return new DefaultMcpConnection(profile, client, transport, () => closed);
  }

  async startOAuthAuthorization(
    profile: ConnectionProfile,
    options: StartOAuthAuthorizationOptions,
  ): Promise<StartOAuthAuthorizationResult> {
    if (profile.transport !== "http") {
      throw new UnsupportedMcpTransportError(profile.transport);
    }

    const state = crypto.randomUUID();
    const provider = new RuntimeOAuthClientProvider(
      options.callbackUrl,
      state,
      (authorizationUrl) => {
        const session = this.oauthSessions.get(profile.id);

        if (!session || session.state !== state) {
          return;
        }

        session.authorizationUrl = authorizationUrl.toString();
      },
    );
    const transport = createStreamableHttpTransport(profile, provider);
    const capturingTransport = new CapturingTransport(transport);
    const client = new Client({
      name: "mcp-inspector-runtime",
      version: "0.0.0",
    });

    this.clearOAuthSession(profile.id);
    this.oauthSessions.set(profile.id, {
      connectionId: profile.id,
      pendingTransport: transport,
      provider,
      state,
    });
    this.oauthStates.set(state, profile.id);

    try {
      await client.connect(capturingTransport, { timeout: 15_000 });
      await client.close().catch(() => undefined);
    } catch (error) {
      const session = this.oauthSessions.get(profile.id);
      const authorizationUrl = session?.authorizationUrl;

      if (error instanceof UnauthorizedError && authorizationUrl) {
        return {
          authorizationUrl,
          callbackUrl: options.callbackUrl,
          state,
        };
      }

      await capturingTransport.close().catch(() => undefined);
      this.clearOAuthSession(profile.id);
      const message =
        error instanceof Error ? error.message : "Failed to start OAuth authorization";
      throw new McpConnectionStartupError(message);
    }

    this.clearOAuthSession(profile.id);
    throw new McpOAuthAuthorizationError("OAuth authorization was not required");
  }

  async completeOAuthAuthorization(
    state: string,
    authorizationCode: string,
  ): Promise<string> {
    const connectionId = this.oauthStates.get(state);
    const session = connectionId ? this.oauthSessions.get(connectionId) : undefined;

    if (!connectionId || !session || session.state !== state || !session.pendingTransport) {
      throw new McpOAuthAuthorizationError("OAuth authorization session was not found");
    }

    try {
      await session.pendingTransport.finishAuth(authorizationCode);
      await session.pendingTransport.close().catch(() => undefined);
      session.pendingTransport = undefined;
      session.authorizationUrl = undefined;
      return connectionId;
    } catch (error) {
      this.clearOAuthSession(connectionId);
      const message = error instanceof Error ? error.message : "OAuth authorization failed";
      throw new McpOAuthAuthorizationError(message);
    }
  }

  clearOAuthSession(connectionId: string): void {
    const existingSession = this.oauthSessions.get(connectionId);

    if (existingSession) {
      this.oauthStates.delete(existingSession.state);
      void existingSession.pendingTransport?.close().catch(() => undefined);
    }

    this.oauthSessions.delete(connectionId);
  }
}

class DefaultMcpConnection implements McpConnection {
  constructor(
    readonly profile: ConnectionProfile,
    private readonly client: Client,
    private readonly transport: CapturingTransport,
    private readonly isClosed: () => boolean,
  ) {}

  async capabilities(): Promise<CapabilitySummary> {
    this.assertOpen();
    const serverCapabilities = this.client.getServerCapabilities();
    const [tools, resources, prompts] = await Promise.all([
      serverCapabilities?.tools ? this.listTools() : Promise.resolve([]),
      serverCapabilities?.resources ? this.listResources() : Promise.resolve([]),
      serverCapabilities?.prompts ? this.listPrompts() : Promise.resolve([]),
    ]);

    return {
      connectionId: this.profile.id,
      prompts,
      resources,
      tools,
    };
  }

  async callTool(toolName: string, input: JsonValue, requestId: string): Promise<ToolCallResponse> {
    this.assertOpen();
    const startedAt = Date.now();
    const mark = this.transport.mark();

    try {
      const result = await this.client.callTool(
        {
          arguments: isJsonObject(input) ? input : {},
          name: toolName,
        },
        undefined,
        { timeout: 60_000 },
      );
      const completedAt = new Date();
      const durationMs = Math.max(1, completedAt.getTime() - startedAt);
      const exchange = this.transport.exchangeSince(mark, "tools/call", toolName);
      const output = toJsonValue(result);
      const isError = isRecord(result) && result["isError"] === true;

      return {
        completedAt: completedAt.toISOString(),
        durationMs,
        errorCode: isError ? "mcp_tool_result_error" : undefined,
        error: isError ? "MCP tool returned an error result" : undefined,
        output,
        rawRequest: exchange.rawRequest,
        rawResponse: exchange.rawResponse,
        requestId,
        status: isError ? "error" : "success",
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = Math.max(1, completedAt.getTime() - startedAt);
      const exchange = this.transport.exchangeSince(mark, "tools/call", toolName);
      const message = error instanceof Error ? error.message : "MCP tool execution failed";

      return {
        completedAt: completedAt.toISOString(),
        durationMs,
        errorCode: classifyToolCallError(error),
        error: message,
        rawRequest: exchange.rawRequest,
        rawResponse: exchange.rawResponse,
        requestId,
        status: "error",
      };
    }
  }

  close(): Promise<void> {
    return this.client.close();
  }

  private async listTools(): Promise<ToolDefinition[]> {
    const result = await this.client.listTools(undefined, { timeout: 15_000 });

    return result.tools.map((tool) => ({
      description: tool.description,
      inputSchema: toJsonObject(tool.inputSchema),
      name: tool.name,
    }));
  }

  private async listResources(): Promise<ResourceDefinition[]> {
    const result = await this.client.listResources(undefined, { timeout: 15_000 });

    return result.resources.map((resource) => ({
      description: resource.description,
      mimeType: resource.mimeType,
      name: resource.name,
      uri: resource.uri,
    }));
  }

  private async listPrompts(): Promise<PromptDefinition[]> {
    const result = await this.client.listPrompts(undefined, { timeout: 15_000 });

    return result.prompts.map((prompt) => ({
      arguments: prompt.arguments,
      description: prompt.description,
      name: prompt.name,
    }));
  }

  private assertOpen() {
    if (this.isClosed()) {
      throw new McpConnectionClosedError();
    }
  }
}

export function createMcpClient(): McpClient {
  return new DefaultMcpClient();
}

function createTransport(
  profile: ConnectionProfile,
  authProvider?: OAuthClientProvider,
): Transport {
  if (profile.transport === "stdio") {
    const command = resolveStdioCommand(profile);
    const stdioTransport = new StdioClientTransport({
      args: command.args,
      command: command.command,
      env: profile.env,
      stderr: "pipe",
    });
    stdioTransport.stderr?.on("data", () => undefined);
    return stdioTransport;
  }

  if (profile.transport === "http") {
    return createStreamableHttpTransport(profile, authProvider);
  }

  if (profile.transport === "sse") {
    return new SSEClientTransport(resolveRemoteUrl(profile), {
      requestInit: createRemoteRequestInit(profile),
    });
  }

  throw new UnsupportedMcpTransportError(profile.transport);
}

function createStreamableHttpTransport(
  profile: ConnectionProfile,
  authProvider?: OAuthClientProvider,
): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(resolveRemoteUrl(profile), {
    authProvider,
    requestInit: createRemoteRequestInit(profile),
  });
}

function resolveStdioCommand(profile: ConnectionProfile): { command: string; args: string[] } {
  const commandText = profile.command?.trim();

  if (!commandText) {
    throw new InvalidMcpCommandError();
  }

  if (profile.args) {
    return {
      args: profile.args,
      command: commandText,
    };
  }

  const [command, ...args] = splitCommand(commandText);

  if (!command) {
    throw new InvalidMcpCommandError();
  }

  return { args, command };
}

function resolveRemoteUrl(profile: ConnectionProfile): URL {
  const url = profile.url?.trim();

  if (!url) {
    throw new InvalidMcpUrlError();
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new InvalidMcpUrlError("Remote MCP URLs must use http or https");
    }

    return parsedUrl;
  } catch (error) {
    if (error instanceof InvalidMcpUrlError) {
      throw error;
    }

    throw new InvalidMcpUrlError();
  }
}

function createRemoteRequestInit(profile: ConnectionProfile): RequestInit {
  return profile.headers
    ? {
        headers: profile.headers,
      }
    : {};
}

function classifyToolCallError(error: unknown): RuntimeErrorCode {
  if (error instanceof McpConnectionClosedError) {
    return "mcp_connection_closed";
  }

  const message = error instanceof Error ? error.message : "";

  if (/timeout/i.test(message)) {
    return "timeout";
  }

  if (/schema|validation|invalid argument|invalid params/i.test(message)) {
    return "schema_validation_failed";
  }

  if (/fetch failed|network|econnrefused|enotfound|socket|transport/i.test(message)) {
    return "mcp_transport_failed";
  }

  return "unknown_runtime_error";
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (const character of command) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (quote) {
    throw new InvalidMcpCommandError("Unterminated quote in stdio command");
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return isRecord(value);
}

function isJsonRpcRequest(message: JSONRPCMessage): message is JSONRPCMessage & {
  id: RequestId;
  method: string;
  params?: unknown;
} {
  return "id" in message && "method" in message;
}

function isJsonRpcResponse(message: JSONRPCMessage): message is JSONRPCMessage & {
  id: RequestId;
} {
  return "id" in message && ("result" in message || "error" in message);
}

function toJsonObject(value: unknown): JsonObject {
  const jsonValue = toJsonValue(value);
  return isJsonObject(jsonValue) ? jsonValue : {};
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return Number.isNaN(value) ? null : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && typeof item !== "function")
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }

  return null;
}
