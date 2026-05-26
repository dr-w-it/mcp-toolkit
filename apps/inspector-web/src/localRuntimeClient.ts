import type {
  GetConnectionCapabilitiesResponse,
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

  private async getJson<TResponse>(path: string, signal?: AbortSignal): Promise<TResponse> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Runtime request failed: GET ${path} returned ${response.status}`);
    }

    return (await response.json()) as TResponse;
  }
}

export const localRuntimeClient = new LocalRuntimeClient({
  baseUrl: import.meta.env.VITE_INSPECTOR_RUNTIME_URL,
});
