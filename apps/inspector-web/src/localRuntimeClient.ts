import type {
  CreateConnectionProfileRequest,
  CreateConnectionProfileResponse,
  CreateSavedRequestRequest,
  CreateSavedRequestResponse,
  DeleteConnectionProfileResponse,
  DeleteSavedRequestResponse,
  ExecuteToolCallResponse,
  ExportTraceRequest,
  ExportTraceResponse,
  GetTraceResponse,
  ImportTraceRequest,
  ImportTraceResponse,
  GetConnectionCapabilitiesResponse,
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
  StartOAuthAuthorizationResponse,
  UpdateConnectionProfileRequest,
  UpdateConnectionProfileResponse,
  UpdateSavedRequestRequest,
  UpdateSavedRequestResponse,
} from "@dr-w/core";

export interface LocalRuntimeClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class LocalRuntimeError extends Error {
  readonly code?: RuntimeErrorCode;
  readonly details?: string[];
  readonly status: number;

  constructor(message: string, status: number, code?: RuntimeErrorCode, details?: string[]) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "LocalRuntimeError";
    this.status = status;
  }
}

export class LocalRuntimeClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: LocalRuntimeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  getHealth(signal?: AbortSignal): Promise<RuntimeHealthResponse> {
    return this.getJson<RuntimeHealthResponse>("/health", signal);
  }

  getTheme(signal?: AbortSignal): Promise<RuntimeThemeResponse> {
    return this.getJson<RuntimeThemeResponse>("/theme", signal);
  }

  listConnections(signal?: AbortSignal): Promise<ListConnectionsResponse> {
    return this.getJson<ListConnectionsResponse>("/connections", signal);
  }

  createConnection(
    profile: CreateConnectionProfileRequest,
    signal?: AbortSignal,
  ): Promise<CreateConnectionProfileResponse> {
    return this.postJson<CreateConnectionProfileResponse>("/connections", profile, signal);
  }

  updateConnection(
    connectionId: string,
    profile: UpdateConnectionProfileRequest,
    signal?: AbortSignal,
  ): Promise<UpdateConnectionProfileResponse> {
    return this.putJson<UpdateConnectionProfileResponse>(
      `/connections/${encodeURIComponent(connectionId)}`,
      profile,
      signal,
    );
  }

  deleteConnection(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<DeleteConnectionProfileResponse> {
    return this.deleteJson<DeleteConnectionProfileResponse>(
      `/connections/${encodeURIComponent(connectionId)}`,
      signal,
    );
  }

  getCapabilities(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<GetConnectionCapabilitiesResponse> {
    return this.getJson<GetConnectionCapabilitiesResponse>(
      `/connections/${encodeURIComponent(connectionId)}/capabilities`,
      signal,
    );
  }

  startOAuthAuthorization(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<StartOAuthAuthorizationResponse> {
    return this.postJson<StartOAuthAuthorizationResponse>(
      `/connections/${encodeURIComponent(connectionId)}/oauth/authorize`,
      {},
      signal,
    );
  }

  listHistory(signal?: AbortSignal): Promise<ListHistoryResponse> {
    return this.getJson<ListHistoryResponse>("/history", signal);
  }

  listSavedRequests(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<ListSavedRequestsResponse> {
    return this.getJson<ListSavedRequestsResponse>(
      `/connections/${encodeURIComponent(connectionId)}/saved-requests`,
      signal,
    );
  }

  createSavedRequest(
    connectionId: string,
    request: CreateSavedRequestRequest,
    signal?: AbortSignal,
  ): Promise<CreateSavedRequestResponse> {
    return this.postJson<CreateSavedRequestResponse>(
      `/connections/${encodeURIComponent(connectionId)}/saved-requests`,
      request,
      signal,
    );
  }

  updateSavedRequest(
    savedRequestId: string,
    request: UpdateSavedRequestRequest,
    signal?: AbortSignal,
  ): Promise<UpdateSavedRequestResponse> {
    return this.putJson<UpdateSavedRequestResponse>(
      `/saved-requests/${encodeURIComponent(savedRequestId)}`,
      request,
      signal,
    );
  }

  deleteSavedRequest(
    savedRequestId: string,
    signal?: AbortSignal,
  ): Promise<DeleteSavedRequestResponse> {
    return this.deleteJson<DeleteSavedRequestResponse>(
      `/saved-requests/${encodeURIComponent(savedRequestId)}`,
      signal,
    );
  }

  getTrace(traceId: string, signal?: AbortSignal): Promise<GetTraceResponse> {
    return this.getJson<GetTraceResponse>(
      `/history/${encodeURIComponent(traceId)}`,
      signal,
    );
  }

  exportTrace(
    request: ExportTraceRequest = {},
    signal?: AbortSignal,
  ): Promise<ExportTraceResponse> {
    return this.postJson<ExportTraceResponse>("/traces/export", request, signal);
  }

  importTrace(
    request: ImportTraceRequest,
    signal?: AbortSignal,
  ): Promise<ImportTraceResponse> {
    return this.postJson<ImportTraceResponse>("/traces/import", request, signal);
  }

  callTool(
    connectionId: string,
    toolName: string,
    input: JsonValue,
    signal?: AbortSignal,
  ): Promise<ExecuteToolCallResponse> {
    return this.postJson<ExecuteToolCallResponse>(
      `/connections/${encodeURIComponent(connectionId)}/tools/${encodeURIComponent(
        toolName,
      )}/call`,
      { input },
      signal,
    );
  }

  replayToolCall(
    request: ReplayToolCallRequest,
    signal?: AbortSignal,
  ): Promise<ReplayToolCallResponse> {
    return this.postJson<ReplayToolCallResponse>("/replay", request, signal);
  }

  private async getJson<TResponse>(path: string, signal?: AbortSignal): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw await createRuntimeError(response, `GET ${path}`);
    }

    return (await response.json()) as TResponse;
  }

  private async postJson<TResponse>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal,
    });

    if (!response.ok) {
      throw await createRuntimeError(response, `POST ${path}`);
    }

    return (await response.json()) as TResponse;
  }

  private async putJson<TResponse>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "PUT",
      signal,
    });

    if (!response.ok) {
      throw await createRuntimeError(response, `PUT ${path}`);
    }

    return (await response.json()) as TResponse;
  }

  private async deleteJson<TResponse>(
    path: string,
    signal?: AbortSignal,
  ): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
      },
      method: "DELETE",
      signal,
    });

    if (!response.ok) {
      throw await createRuntimeError(response, `DELETE ${path}`);
    }

    return (await response.json()) as TResponse;
  }
}

async function createRuntimeError(response: Response, requestLabel: string) {
  try {
    const body = (await response.json()) as Partial<RuntimeErrorResponse>;

    if (typeof body.error === "string" && body.error) {
      if (
        Array.isArray(body.details) &&
        body.details.every((detail) => typeof detail === "string")
      ) {
        return new LocalRuntimeError(
          `${body.error}: ${body.details.join("; ")}`,
          response.status,
          body.code,
          body.details,
        );
      }

      return new LocalRuntimeError(body.error, response.status, body.code);
    }
  } catch {
    // Fall back to the transport-level status below.
  }

  return new LocalRuntimeError(
    `Runtime request failed: ${requestLabel} returned ${response.status}`,
    response.status,
  );
}

export const localRuntimeClient = new LocalRuntimeClient({
  baseUrl: import.meta.env.VITE_INSPECTOR_RUNTIME_URL,
});
