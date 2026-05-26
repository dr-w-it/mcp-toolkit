import type {
  CapabilitySummary,
  ConnectionProfile,
  JsonValue,
  ToolCallResponse,
} from "@dr-w/core";

export interface McpClient {
  connect(profile: ConnectionProfile): Promise<McpConnection>;
}

export interface McpConnection {
  profile: ConnectionProfile;
  capabilities(): Promise<CapabilitySummary>;
  callTool(toolName: string, input: JsonValue): Promise<ToolCallResponse>;
  close(): Promise<void>;
}

export class UnsupportedMcpTransportError extends Error {
  constructor(transport: ConnectionProfile["transport"]) {
    super(`Unsupported MCP transport: ${transport}`);
    this.name = "UnsupportedMcpTransportError";
  }
}
