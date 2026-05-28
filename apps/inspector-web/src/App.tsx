import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CapabilitySummary,
  ConnectionProfile,
  ConnectionTransport,
  ExecuteToolCallResponse,
  JsonObject,
  JsonValue,
  PromptDefinition,
  ResourceDefinition,
  RuntimeHealthResponse,
  ToolDefinition,
  TraceEntry,
} from "@dr-w/core";
import { localRuntimeClient } from "./localRuntimeClient";
import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const runtimeBaseUrl = import.meta.env.VITE_INSPECTOR_RUNTIME_URL ?? "http://127.0.0.1:8787";

type RuntimeDataSource = "runtime" | "mock";
type CapabilityTab = "tools" | "resources" | "prompts" | "schemas";
type ResponseViewMode = "formatted" | "raw";

interface RuntimeData {
  capabilities: CapabilitySummary;
  connections: ConnectionProfile[];
  error: string | null;
  health: RuntimeHealthResponse | null;
  isLoading: boolean;
  source: RuntimeDataSource;
  traces: TraceEntry[];
}

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

interface SchemaSummary {
  id: string;
  name: string;
  schema: JsonObject;
  source: string;
}

interface CapabilityListItem {
  description: string;
  id: string;
  meta: string;
  title: string;
}

const transportOptions: { label: string; value: ConnectionTransport }[] = [
  { label: "stdio", value: "stdio" },
  { label: "HTTP", value: "http" },
  { label: "SSE", value: "sse" },
];

const capabilityTabs: { id: CapabilityTab; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "resources", label: "Resources" },
  { id: "prompts", label: "Prompts" },
  { id: "schemas", label: "Schemas" },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to reach the local runtime";
}

function createBlankRow(prefix: string): KeyValueRow {
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    key: "",
    value: "",
  };
}

function rowsToRecord(rows: KeyValueRow[]) {
  const entries = rows
    .map((row) => [row.key.trim(), row.value] as const)
    .filter(([key]) => key.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function createEmptyCapabilitySummary(connectionId: string): CapabilitySummary {
  return {
    connectionId,
    prompts: [],
    resources: [],
    tools: [],
  };
}

function getSchemaSummaries(capabilities: CapabilitySummary): SchemaSummary[] {
  return capabilities.tools
    .filter((tool): tool is ToolDefinition & { inputSchema: JsonObject } =>
      Boolean(tool.inputSchema),
    )
    .map((tool) => ({
      id: `tool:${tool.name}`,
      name: `${tool.name} input`,
      schema: tool.inputSchema,
      source: `tool:${tool.name}`,
    }));
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function getDefaultToolInput(tool: ToolDefinition | undefined): JsonObject {
  if (tool?.name === "read_file" || tool?.name === "list_directory") {
    return {
      path: "./README.md",
    };
  }

  return {};
}

function renderToolDetails(tool: ToolDefinition | undefined) {
  if (!tool) {
    return {};
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? null,
  };
}

function renderResourceDetails(resource: ResourceDefinition | undefined) {
  if (!resource) {
    return {};
  }

  return {
    uri: resource.uri,
    name: resource.name,
    mimeType: resource.mimeType,
    description: resource.description,
  };
}

function renderPromptDetails(prompt: PromptDefinition | undefined) {
  if (!prompt) {
    return {};
  }

  return {
    name: prompt.name,
    description: prompt.description,
    arguments: prompt.arguments ?? [],
  };
}

function getRuntimeTone(data: RuntimeData) {
  if (data.isLoading) {
    return "checking";
  }

  return data.source === "runtime" ? "online" : "fallback";
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
  const [draftConnections, setDraftConnections] = useState<ConnectionProfile[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<ConnectionTransport>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [activeCapabilityTab, setActiveCapabilityTab] = useState<CapabilityTab>("tools");
  const [capabilityFilter, setCapabilityFilter] = useState("");
  const [selectedCapabilityKeys, setSelectedCapabilityKeys] = useState<
    Record<CapabilityTab, string | null>
  >({
    prompts: null,
    resources: null,
    schemas: null,
    tools: null,
  });
  const [envRows, setEnvRows] = useState<KeyValueRow[]>([createBlankRow("env")]);
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>([
    createBlankRow("header"),
  ]);
  const [toolInputDraft, setToolInputDraft] = useState(
    formatJson(getDefaultToolInput(capabilitySummary.tools[0])),
  );
  const [toolInputError, setToolInputError] = useState<string | null>(null);
  const [toolExecution, setToolExecution] = useState<ExecuteToolCallResponse | null>(
    null,
  );
  const [toolExecutionError, setToolExecutionError] = useState<string | null>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [responseViewMode, setResponseViewMode] =
    useState<ResponseViewMode>("formatted");

  const connections = useMemo(() => {
    const draftIds = new Set(draftConnections.map((connection) => connection.id));

    return [
      ...draftConnections,
      ...runtimeData.connections.filter((connection) => !draftIds.has(connection.id)),
    ];
  }, [draftConnections, runtimeData.connections]);

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedConnectionId) ??
      connections[0],
    [connections, selectedConnectionId],
  );
  const schemas = useMemo(
    () => getSchemaSummaries(runtimeData.capabilities),
    [runtimeData.capabilities],
  );
  const capabilityCounts = {
    prompts: runtimeData.capabilities.prompts.length,
    resources: runtimeData.capabilities.resources.length,
    schemas: schemas.length,
    tools: runtimeData.capabilities.tools.length,
  };
  const selectedTool =
    runtimeData.capabilities.tools.find(
      (tool) => tool.name === selectedCapabilityKeys.tools,
    ) ?? runtimeData.capabilities.tools[0];
  const selectedResource =
    runtimeData.capabilities.resources.find(
      (resource) => resource.uri === selectedCapabilityKeys.resources,
    ) ?? runtimeData.capabilities.resources[0];
  const selectedPrompt =
    runtimeData.capabilities.prompts.find(
      (prompt) => prompt.name === selectedCapabilityKeys.prompts,
    ) ?? runtimeData.capabilities.prompts[0];
  const selectedSchema =
    schemas.find((schema) => schema.id === selectedCapabilityKeys.schemas) ?? schemas[0];
  const runtimeTone = getRuntimeTone(runtimeData);
  const isRemoteTransport = transport === "http" || transport === "sse";
  const canCreateDraft =
    name.trim().length > 0 &&
    ((transport === "stdio" && command.trim().length > 0) ||
      (isRemoteTransport && url.trim().length > 0));
  const targetCommand =
    selectedConnection?.command ?? selectedConnection?.url ?? "No runtime target selected";

  const detailTitle =
    activeCapabilityTab === "tools"
      ? selectedTool?.name ?? "No tools"
      : activeCapabilityTab === "resources"
        ? selectedResource?.name ?? selectedResource?.uri ?? "No resources"
        : activeCapabilityTab === "prompts"
          ? selectedPrompt?.name ?? "No prompts"
          : selectedSchema?.name ?? "No schemas";
  const detailEyebrow =
    activeCapabilityTab === "tools"
      ? "Tool"
      : activeCapabilityTab === "resources"
        ? "Resource"
        : activeCapabilityTab === "prompts"
          ? "Prompt"
          : "Schema";
  const detailDescription =
    activeCapabilityTab === "tools"
      ? selectedTool?.description
      : activeCapabilityTab === "resources"
        ? selectedResource?.description ?? selectedResource?.uri
        : activeCapabilityTab === "prompts"
          ? selectedPrompt?.description
          : selectedSchema?.source;
  const detailPayload =
    activeCapabilityTab === "tools"
      ? selectedTool?.inputSchema ?? renderToolDetails(selectedTool)
      : activeCapabilityTab === "resources"
        ? renderResourceDetails(selectedResource)
        : activeCapabilityTab === "prompts"
          ? renderPromptDetails(selectedPrompt)
          : selectedSchema?.schema ?? {};

  const capabilityItems = useMemo<CapabilityListItem[]>(() => {
    if (activeCapabilityTab === "tools") {
      return runtimeData.capabilities.tools.map((tool) => ({
        description: tool.description ?? "No description provided.",
        id: tool.name,
        meta: tool.inputSchema ? "input schema" : "no schema",
        title: tool.name,
      }));
    }

    if (activeCapabilityTab === "resources") {
      return runtimeData.capabilities.resources.map((resource) => ({
        description: resource.description ?? resource.uri,
        id: resource.uri,
        meta: resource.mimeType ?? "resource",
        title: resource.name ?? resource.uri,
      }));
    }

    if (activeCapabilityTab === "prompts") {
      return runtimeData.capabilities.prompts.map((prompt) => ({
        description: prompt.description ?? "No description provided.",
        id: prompt.name,
        meta: `${prompt.arguments?.length ?? 0} arguments`,
        title: prompt.name,
      }));
    }

    return schemas.map((schema) => ({
      description: schema.source,
      id: schema.id,
      meta: "json schema",
      title: schema.name,
    }));
  }, [activeCapabilityTab, runtimeData.capabilities, schemas]);

  const filteredCapabilityItems = capabilityItems.filter((item) => {
    const query = capabilityFilter.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return `${item.title} ${item.description} ${item.meta}`.toLowerCase().includes(query);
  });

  const selectedCapabilityId =
    activeCapabilityTab === "tools"
      ? selectedTool?.name
      : activeCapabilityTab === "resources"
        ? selectedResource?.uri
        : activeCapabilityTab === "prompts"
          ? selectedPrompt?.name
          : selectedSchema?.id;
  const responsePayload = toolExecutionError
    ? {
        error: toolExecutionError,
        status: "error",
      }
    : toolExecution
      ? responseViewMode === "raw"
        ? {
            request: toolExecution.response.rawRequest,
            response: toolExecution.response.rawResponse,
          }
        : {
            durationMs: toolExecution.response.durationMs,
            error: toolExecution.response.error,
            output: toolExecution.response.output,
            requestId: toolExecution.response.requestId,
            status: toolExecution.response.status,
          }
      : null;

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
        const nextSelectedConnectionId = nextConnections[0]?.id ?? null;
        const capabilities = nextSelectedConnectionId
          ? await localRuntimeClient.getCapabilities(nextSelectedConnectionId, signal)
          : createEmptyCapabilitySummary("runtime");

        setSelectedConnectionId((currentId) =>
          currentId &&
          (currentId.startsWith("draft-") ||
            nextConnections.some((connection) => connection.id === currentId))
            ? currentId
            : nextSelectedConnectionId,
        );
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
        setSelectedConnectionId((currentId) =>
          currentId &&
          (currentId.startsWith("draft-") ||
            connectionProfiles.some((connection) => connection.id === currentId))
            ? currentId
            : connectionProfiles[0]?.id ?? null,
        );
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadRuntimeData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadRuntimeData]);

  useEffect(() => {
    setToolInputDraft(formatJson(getDefaultToolInput(selectedTool)));
    setToolInputError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setResponseViewMode("formatted");
  }, [selectedTool?.name]);

  function resetForm() {
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
    setEnvRows([createBlankRow("env")]);
    setHeaderRows([createBlankRow("header")]);
  }

  function updateRow(
    rows: KeyValueRow[],
    rowId: string,
    field: "key" | "value",
    value: string,
  ) {
    return rows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            [field]: value,
          }
        : row,
    );
  }

  function removeRow(rows: KeyValueRow[], rowId: string, prefix: string) {
    const nextRows = rows.filter((row) => row.id !== rowId);

    return nextRows.length > 0 ? nextRows : [createBlankRow(prefix)];
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const profile: ConnectionProfile = {
      id: `draft-${Date.now()}`,
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      url: isRemoteTransport ? url.trim() : undefined,
      env: rowsToRecord(envRows),
      headers: isRemoteTransport ? rowsToRecord(headerRows) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    setDraftConnections((currentConnections) => [profile, ...currentConnections]);
    setSelectedConnectionId(profile.id);
    setRuntimeData((currentData) => ({
      ...currentData,
      capabilities: createEmptyCapabilitySummary(profile.id),
    }));
    setIsComposerOpen(false);
    resetForm();
  }

  async function handleSelectConnection(connectionId: string) {
    setSelectedConnectionId(connectionId);
    setCapabilityFilter("");

    if (connectionId.startsWith("draft-")) {
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(connectionId),
      }));
      return;
    }

    if (runtimeData.source !== "runtime") {
      return;
    }

    setRuntimeData((currentData) => ({
      ...currentData,
      error: null,
      isLoading: true,
    }));

    try {
      const capabilities = await localRuntimeClient.getCapabilities(connectionId);

      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      setRuntimeData((currentData) => ({
        ...currentData,
        error: getErrorMessage(error),
        isLoading: false,
      }));
    }
  }

  function handleSelectCapability(itemId: string) {
    setSelectedCapabilityKeys((keys) => ({
      ...keys,
      [activeCapabilityTab]: itemId,
    }));
  }

  async function handleToolCallSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConnection || !selectedTool) {
      return;
    }

    let input: JsonValue;

    try {
      input = JSON.parse(toolInputDraft) as JsonValue;
    } catch {
      setToolInputError("Request input must be valid JSON.");
      return;
    }

    setToolInputError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setIsExecutingTool(true);

    try {
      const result = await localRuntimeClient.callTool(
        selectedConnection.id,
        selectedTool.name,
        input,
      );

      setToolExecution(result);
      setRuntimeData((currentData) => ({
        ...currentData,
        traces: [
          result.trace,
          ...currentData.traces.filter((trace) => trace.id !== result.trace.id),
        ],
      }));
    } catch (error) {
      setToolExecutionError(getErrorMessage(error));
    } finally {
      setIsExecutingTool(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">dr-w</span>
          <div>
            <h1>MCP Inspector</h1>
            <p>Local runtime - v0.1</p>
          </div>
        </div>

        <section className={`runtime-status ${runtimeTone}`} aria-live="polite">
          <span className={`status-dot ${runtimeTone}`} />
          <div>
            <strong>
              {runtimeTone === "checking"
                ? "Checking runtime"
                : runtimeTone === "online"
                  ? "Runtime online"
                  : "Fallback dev data"}
            </strong>
            <small>
              {runtimeTone === "checking"
                ? `Probing ${runtimeBaseUrl}`
                : runtimeTone === "online"
                  ? `${runtimeData.health?.service ?? "inspector-runtime"} at ${runtimeBaseUrl}`
                  : runtimeData.error ?? "Local runtime unavailable"}
            </small>
          </div>
        </section>

        {runtimeTone === "fallback" ? (
          <div className="fallback-banner">Fallback data</div>
        ) : null}

        <section className="sidebar-section">
          <div className="section-header">
            <h2>Connections</h2>
            <button
              aria-expanded={isComposerOpen}
              className="ghost-button"
              onClick={() => setIsComposerOpen((isOpen) => !isOpen)}
              type="button"
            >
              + New
            </button>
          </div>

          {isComposerOpen ? (
            <form className="connection-composer" onSubmit={handleSubmit}>
              <label className="field compact">
                <span>Name</span>
                <input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Local filesystem"
                  type="text"
                  value={name}
                />
              </label>

              <fieldset className="field compact transport-field">
                <legend>Transport</legend>
                <div className="transport-options">
                  {transportOptions.map((option) => (
                    <button
                      className={option.value === transport ? "selected" : ""}
                      key={option.value}
                      onClick={() => setTransport(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {transport === "stdio" ? (
                <label className="field compact">
                  <span>Command</span>
                  <input
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npx @modelcontextprotocol/server-filesystem ./"
                    type="text"
                    value={command}
                  />
                </label>
              ) : (
                <label className="field compact">
                  <span>Remote URL</span>
                  <input
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={
                      transport === "http"
                        ? "https://mcp.example.test"
                        : "https://mcp.example.test/sse"
                    }
                    type="url"
                    value={url}
                  />
                </label>
              )}

              <div className="key-value-section compact">
                <div className="key-value-header">
                  <h3>Environment</h3>
                  <button
                    onClick={() =>
                      setEnvRows((rows) => [...rows, createBlankRow("env")])
                    }
                    type="button"
                  >
                    Add
                  </button>
                </div>
                {envRows.map((row) => (
                  <div className="key-value-row compact" key={row.id}>
                    <input
                      aria-label="Environment variable name"
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          updateRow(rows, row.id, "key", event.target.value),
                        )
                      }
                      placeholder="NAME"
                      type="text"
                      value={row.key}
                    />
                    <input
                      aria-label="Environment variable value"
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          updateRow(rows, row.id, "value", event.target.value),
                        )
                      }
                      placeholder="value"
                      type="password"
                      value={row.value}
                    />
                    <button
                      aria-label="Remove environment variable"
                      onClick={() =>
                        setEnvRows((rows) => removeRow(rows, row.id, "env"))
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {isRemoteTransport ? (
                <div className="key-value-section compact">
                  <div className="key-value-header">
                    <h3>Headers</h3>
                    <button
                      onClick={() =>
                        setHeaderRows((rows) => [
                          ...rows,
                          createBlankRow("header"),
                        ])
                      }
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                  {headerRows.map((row) => (
                    <div className="key-value-row compact" key={row.id}>
                      <input
                        aria-label="Header name"
                        onChange={(event) =>
                          setHeaderRows((rows) =>
                            updateRow(rows, row.id, "key", event.target.value),
                          )
                        }
                        placeholder="Authorization"
                        type="text"
                        value={row.key}
                      />
                      <input
                        aria-label="Header value"
                        onChange={(event) =>
                          setHeaderRows((rows) =>
                            updateRow(rows, row.id, "value", event.target.value),
                          )
                        }
                        placeholder="Bearer token"
                        type="password"
                        value={row.value}
                      />
                      <button
                        aria-label="Remove header"
                        onClick={() =>
                          setHeaderRows((rows) =>
                            removeRow(rows, row.id, "header"),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="form-actions">
                <button onClick={resetForm} type="button">
                  Reset
                </button>
                <button className="primary" disabled={!canCreateDraft} type="submit">
                  Create draft
                </button>
              </div>
            </form>
          ) : null}

          <div className="connection-list">
            {connections.map((connection) => (
              <button
                className={`connection-item ${
                  connection.id === selectedConnection?.id ? "active" : ""
                }`}
                key={connection.id}
                onClick={() => void handleSelectConnection(connection.id)}
                type="button"
              >
                <span className="status-dot online" />
                <span className="connection-name">{connection.name}</span>
                <small>{connection.transport}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section timeline-section">
          <div className="section-header">
            <h2>Timeline</h2>
          </div>
          <div className="timeline">
            {runtimeData.traces.length > 0 ? (
              runtimeData.traces.map((entry) => (
                <button className="timeline-item" key={entry.id} type="button">
                  <span className={`status-dot ${entry.status}`} />
                  <span>{entry.operation}</span>
                  <small>{entry.durationMs}ms</small>
                </button>
              ))
            ) : (
              <div className="empty-state compact">No runtime activity yet.</div>
            )}
          </div>
        </section>

        <div className="sidebar-footer">Local-first - no cloud</div>
      </aside>

      <section className="workbench">
        <header className="target-bar">
          <div className="target-meta">
            <span className="target-label">Target</span>
            <span className={`status-dot ${runtimeTone}`} />
            <div>
              <h2>{selectedConnection?.name ?? "No connection selected"}</h2>
              <p>{targetCommand}</p>
            </div>
          </div>

          <div className="target-actions">
            {selectedConnection ? (
              <span className="transport-pill">{selectedConnection.transport}</span>
            ) : null}
            {runtimeTone === "fallback" ? (
              <span className="warning-pill">Fallback data</span>
            ) : null}
            <button disabled type="button">
              Replay soon
            </button>
            <button
              className="primary"
              disabled={runtimeData.isLoading}
              onClick={() => void loadRuntimeData()}
              type="button"
            >
              {runtimeData.isLoading
                ? "Connecting"
                : runtimeData.source === "runtime"
                  ? "Reconnect"
                  : "Connect"}
            </button>
          </div>
        </header>

        <div className="workbench-grid">
          <section className="capability-pane">
            <div className="tabs">
              {capabilityTabs.map((tab) => (
                <button
                  aria-pressed={activeCapabilityTab === tab.id}
                  className={activeCapabilityTab === tab.id ? "selected" : ""}
                  key={tab.id}
                  onClick={() => {
                    setActiveCapabilityTab(tab.id);
                    setCapabilityFilter("");
                  }}
                  type="button"
                >
                  <span>{tab.label}</span>
                  <small>{capabilityCounts[tab.id]}</small>
                </button>
              ))}
            </div>

            <label className="filter-field">
              <span>Filter {activeCapabilityTab}</span>
              <input
                onChange={(event) => setCapabilityFilter(event.target.value)}
                placeholder={`Filter ${activeCapabilityTab}...`}
                type="search"
                value={capabilityFilter}
              />
            </label>

            <div className="capability-list">
              {filteredCapabilityItems.length > 0 ? (
                filteredCapabilityItems.map((item) => (
                  <button
                    className={`capability-card ${
                      item.id === selectedCapabilityId ? "selected" : ""
                    }`}
                    key={item.id}
                    onClick={() => handleSelectCapability(item.id)}
                    type="button"
                  >
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <small>{item.meta}</small>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  {capabilityItems.length > 0
                    ? "No capabilities match this filter."
                    : `No ${activeCapabilityTab} exposed by this connection.`}
                </div>
              )}
            </div>
          </section>

          <section className="detail-pane">
            <form className="detail-header" onSubmit={handleToolCallSubmit}>
              <div>
                <p className="eyebrow">{detailEyebrow}</p>
                <h2>{detailTitle}</h2>
                <p>{detailDescription ?? "No description provided."}</p>
              </div>
              <button
                className="primary execute-button"
                disabled={activeCapabilityTab !== "tools" || !selectedTool || isExecutingTool}
                type="submit"
              >
                {isExecutingTool ? "Executing" : "Execute"}
              </button>
            </form>

            <div className="editor-grid">
              <section className="code-panel">
                <div className="code-panel-header">
                  <h3>
                    {activeCapabilityTab === "tools" ? "Input schema" : "Definition"}
                  </h3>
                  <span>{activeCapabilityTab === "tools" ? "readonly" : "json"}</span>
                </div>
                <pre>{formatJson(detailPayload)}</pre>
              </section>

              <section className="code-panel">
                <div className="code-panel-header">
                  <h3>Request</h3>
                  <span>json</span>
                </div>
                {activeCapabilityTab === "tools" && selectedTool ? (
                  <label className="json-editor">
                    <span>Tool input</span>
                    <textarea
                      onChange={(event) => setToolInputDraft(event.target.value)}
                      spellCheck={false}
                      value={toolInputDraft}
                    />
                    {toolInputError ? (
                      <small className="inline-error">{toolInputError}</small>
                    ) : null}
                  </label>
                ) : (
                  <pre>
                    {formatJson({
                      connectionId: runtimeData.capabilities.connectionId,
                      selected: {
                        tab: activeCapabilityTab,
                        title: detailTitle,
                      },
                      source: runtimeData.source,
                    })}
                  </pre>
                )}
              </section>
            </div>

            <section className="response-viewer">
              <div className="response-header">
                <div>
                  <h3>Response</h3>
                  <small
                    className={
                      toolExecution?.response.status === "success"
                        ? "response-status success"
                        : toolExecution || toolExecutionError
                          ? "response-status error"
                          : "response-status"
                    }
                  >
                    {toolExecution?.response.status ??
                      (toolExecutionError ? "error" : "idle")}
                  </small>
                </div>
                <div className="view-toggle">
                  <button
                    className={responseViewMode === "formatted" ? "selected" : ""}
                    onClick={() => setResponseViewMode("formatted")}
                    type="button"
                  >
                    Formatted
                  </button>
                  <button
                    className={responseViewMode === "raw" ? "selected" : ""}
                    onClick={() => setResponseViewMode("raw")}
                    type="button"
                  >
                    Raw
                  </button>
                </div>
              </div>
              {responsePayload ? (
                <pre className="response-output">{formatJson(responsePayload)}</pre>
              ) : (
                <div className="response-empty">Run the tool to see a response here.</div>
              )}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}
