import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CapabilitySummary,
  ConnectionProfile,
  RuntimeHealthResponse,
  TraceEntry,
} from "@dr-w/core";
import { localRuntimeClient } from "./localRuntimeClient";
import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const runtimeBaseUrl = import.meta.env.VITE_INSPECTOR_RUNTIME_URL ?? "http://127.0.0.1:8787";

type RuntimeDataSource = "runtime" | "mock";

interface RuntimeData {
  capabilities: CapabilitySummary;
  connections: ConnectionProfile[];
  error: string | null;
  health: RuntimeHealthResponse | null;
  isLoading: boolean;
  source: RuntimeDataSource;
  traces: TraceEntry[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to reach the local runtime";
}

export function App() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    connectionProfiles[0]?.id ?? null,
  );
  const [runtimeData, setRuntimeData] = useState<RuntimeData>({
    capabilities: capabilitySummary,
    connections: connectionProfiles,
    error: null,
    health: null,
    isLoading: true,
    source: "mock",
    traces: traceEntries,
  });

  const selectedConnection = useMemo(
    () =>
      runtimeData.connections.find((connection) => connection.id === selectedConnectionId) ??
      runtimeData.connections[0],
    [runtimeData.connections, selectedConnectionId],
  );
  const selectedTool = runtimeData.capabilities.tools[0];

  const loadRuntimeData = useCallback(
    async (signal?: AbortSignal) => {
      setRuntimeData((currentData) => ({
        ...currentData,
        error: null,
        isLoading: true,
      }));

      try {
        const [health, connectionsResponse, historyResponse] = await Promise.all([
          localRuntimeClient.getHealth(signal),
          localRuntimeClient.listConnections(signal),
          localRuntimeClient.listHistory(signal),
        ]);
        const nextConnections = connectionsResponse.connections;
        const nextSelectedConnectionId =
          nextConnections.find((connection) => connection.id === selectedConnectionId)?.id ??
          nextConnections[0]?.id ??
          null;
        const capabilities = nextSelectedConnectionId
          ? await localRuntimeClient.getCapabilities(nextSelectedConnectionId, signal)
          : capabilitySummary;

        setSelectedConnectionId(nextSelectedConnectionId);
        setRuntimeData({
          capabilities,
          connections: nextConnections,
          error: null,
          health,
          isLoading: false,
          source: "runtime",
          traces: historyResponse.traces,
        });
      } catch (error) {
        if (signal?.aborted) {
          return;
        }

        setRuntimeData({
          capabilities: capabilitySummary,
          connections: connectionProfiles,
          error: getErrorMessage(error),
          health: null,
          isLoading: false,
          source: "mock",
          traces: traceEntries,
        });
        setSelectedConnectionId(connectionProfiles[0]?.id ?? null);
      }
    },
    [selectedConnectionId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadRuntimeData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadRuntimeData]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">dr-w</span>
          <div>
            <h1>MCP Inspector</h1>
            <p>Local runtime</p>
          </div>
        </div>

        <section className="runtime-status" aria-live="polite">
          <span className={`status-dot ${runtimeData.source === "runtime" ? "success" : "error"}`} />
          <div>
            <strong>
              {runtimeData.health?.ok
                ? `${runtimeData.health.service} online`
                : "Using development data"}
            </strong>
            <small>
              {runtimeData.source === "runtime"
                ? `${runtimeData.health?.mode ?? "local"} at ${runtimeBaseUrl}`
                : runtimeData.error ?? "Waiting for the local runtime"}
            </small>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Connections</h2>
            <button type="button">New</button>
          </div>
          <div className="connection-list">
            {runtimeData.connections.map((connection) => (
              <button
                className={`connection-item ${
                  connection.id === selectedConnection?.id ? "active" : ""
                }`}
                key={connection.id}
                onClick={() => {
                  setSelectedConnectionId(connection.id);
                }}
                type="button"
              >
                <span>{connection.name}</span>
                <small>{connection.transport}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Timeline</h2>
          </div>
          <div className="timeline">
            {runtimeData.traces.map((entry) => (
              <button className="timeline-item" key={entry.id} type="button">
                <span className={`status-dot ${entry.status}`} />
                <span>{entry.operation}</span>
                <small>{entry.durationMs}ms</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Connected target</p>
            <h2>{selectedConnection?.name ?? "No runtime connection"}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button">Replay</button>
            <button
              className="primary"
              disabled={runtimeData.isLoading}
              onClick={() => void loadRuntimeData()}
              type="button"
            >
              {runtimeData.isLoading ? "Connecting" : "Connect"}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="surface explorer">
            <div className="tabs">
              <button className="selected" type="button">
                Tools
              </button>
              <button type="button">Resources</button>
              <button type="button">Prompts</button>
              <button type="button">Schemas</button>
            </div>

            <div className="capability-list">
              {runtimeData.capabilities.tools.map((tool) => (
                <article
                  className={`capability-card ${
                    tool.name === selectedTool?.name ? "selected" : ""
                  }`}
                  key={tool.name}
                >
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="surface request-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Tool call</p>
                <h2>{selectedTool?.name ?? "Select a tool"}</h2>
              </div>
              <button className="primary" type="button">
                Execute
              </button>
            </div>

            <div className="editor-grid">
              <div>
                <h3>Request</h3>
                <pre>{JSON.stringify(selectedTool?.inputSchema ?? {}, null, 2)}</pre>
              </div>
              <div>
                <h3>Runtime</h3>
                <pre>
                  {JSON.stringify(
                    {
                      capabilities: {
                        prompts: runtimeData.capabilities.prompts.length,
                        resources: runtimeData.capabilities.resources.length,
                        tools: runtimeData.capabilities.tools.length,
                      },
                      connectionId: runtimeData.capabilities.connectionId,
                      health: runtimeData.health,
                      source: runtimeData.source,
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
