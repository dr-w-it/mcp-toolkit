import type {
  ExecuteToolCallResponse,
  GetConnectionCapabilitiesResponse,
  JsonValue,
  ListConnectionsResponse,
  ListHistoryResponse,
  RuntimeHealthResponse,
} from "@dr-w/core";

export interface LocalRuntimeClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
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

  listConnections(signal?: AbortSignal): Promise<ListConnectionsResponse> {
    return this.getJson<ListConnectionsResponse>("/connections", signal);
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

  listHistory(signal?: AbortSignal): Promise<ListHistoryResponse> {
    return this.getJson<ListHistoryResponse>("/history", signal);
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

  private async getJson<TResponse>(path: string, signal?: AbortSignal): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(await getRuntimeErrorMessage(response, `GET ${path}`));
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
      throw new Error(await getRuntimeErrorMessage(response, `POST ${path}`));
    }

    return (await response.json()) as TResponse;
  }
}

async function getRuntimeErrorMessage(response: Response, requestLabel: string) {
  try {
    const body = (await response.json()) as { error?: unknown };

    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // Fall back to the transport-level status below.
  }

  return `Runtime request failed: ${requestLabel} returned ${response.status}`;
}

export const localRuntimeClient = new LocalRuntimeClient({
  baseUrl: import.meta.env.VITE_INSPECTOR_RUNTIME_URL,
});
