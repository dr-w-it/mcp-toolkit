import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import type {
  CapabilitySummary,
  ConnectionProfile,
  ConnectionTransport,
  CreateConnectionProfileRequest,
  ExecuteToolCallResponse,
  JsonObject,
  PromptDefinition,
  ResourceDefinition,
  RuntimeHealthResponse,
  RuntimeThemeResponse,
  SavedRequest,
  TraceArtifact,
  TraceArtifactEntry,
  ToolDefinition,
  TraceEntry,
} from "@dr-w/core";
import { LocalRuntimeError, localRuntimeClient } from "./localRuntimeClient";
import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const runtimeBaseUrl = import.meta.env.VITE_INSPECTOR_RUNTIME_URL ?? "http://127.0.0.1:8787";

type RuntimeDataSource = "runtime" | "mock";
type CapabilityTab = "tools" | "resources" | "prompts" | "schemas";
type EditorTab = "schema" | "request";
type ResponseViewMode = "formatted" | "raw";

interface RuntimeData {
  capabilities: CapabilitySummary;
  connections: ConnectionProfile[];
  error: string | null;
  health: RuntimeHealthResponse | null;
  isLoading: boolean;
  savedRequests: SavedRequest[];
  source: RuntimeDataSource;
  theme: RuntimeThemeResponse | null;
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
  isDeprecated?: boolean;
  meta?: string;
  title: string;
}

interface RuntimeDisplayError {
  code?: string;
  details?: string[];
  message: string;
  status?: number;
}

interface SavedRequestEditDraft {
  description: string;
  name: string;
}

interface ConfirmationModalProps {
  canConfirm?: boolean;
  confirmLabel: string;
  description: ReactNode;
  error?: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  confirmationLabel?: ReactNode;
  confirmationValue?: string;
  onConfirmationChange?: (value: string) => void;
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
  if (error instanceof LocalRuntimeError) {
    const code = error.code ? ` (${error.code})` : "";
    return `${error.message}${code}`;
  }

  return error instanceof Error ? error.message : "Unable to reach the local runtime";
}

function getRuntimeDisplayError(error: unknown): RuntimeDisplayError {
  if (error instanceof LocalRuntimeError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      status: error.status,
    };
  }

  return {
    message: getErrorMessage(error),
  };
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

function recordToRows(record: Record<string, string> | undefined, prefix: string) {
  const entries = Object.entries(record ?? {});

  if (entries.length === 0) {
    return [createBlankRow(prefix)];
  }

  return entries.map(([key, value]) => ({
    id: `${prefix}-${crypto.randomUUID()}`,
    key,
    value,
  }));
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

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getToolParameterSummary(tool: ToolDefinition | undefined) {
  const properties = isJsonObject(tool?.inputSchema?.properties)
    ? tool.inputSchema.properties
    : {};
  const required = isStringArray(tool?.inputSchema?.required)
    ? tool.inputSchema.required
    : [];
  const parameterCount = Object.keys(properties).length;
  const parameterLabel = parameterCount === 1 ? "1 parameter" : `${parameterCount} parameters`;
  const requiredLabel =
    required.length === 1 ? "1 required" : `${required.length} required`;

  return parameterCount > 0 ? `${parameterLabel} - ${requiredLabel}` : "No parameters";
}

function formatConnectionCommand(connection: ConnectionProfile | undefined) {
  if (!connection) {
    return "No runtime target selected";
  }

  if (connection.command && connection.args?.length) {
    return [connection.command, ...connection.args].join(" ");
  }

  return connection.command ?? connection.url ?? "No runtime target selected";
}

function getDefaultToolInput(tool: ToolDefinition | undefined): JsonObject {
  if (tool?.name === "read_file" || tool?.name === "list_directory") {
    return {
      path: "./README.md",
    };
  }

  return {};
}

function isDeprecatedTool(tool: ToolDefinition | undefined) {
  return Boolean(tool?.description?.toLowerCase().includes("deprecated"));
}

function getDeprecatedToolReplacement(
  tool: ToolDefinition | undefined,
  tools: ToolDefinition[],
) {
  const replacementName = tool?.description?.match(/use\s+([a-zA-Z0-9_-]+)\s+instead/i)?.[1];

  if (!replacementName) {
    return undefined;
  }

  return tools.find((candidate) => candidate.name === replacementName);
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

function applyTheme(theme: RuntimeThemeResponse) {
  for (const [tokenName, tokenValue] of Object.entries(theme.activeTheme.tokens)) {
    document.documentElement.style.setProperty(tokenName, tokenValue);
  }

  document.documentElement.dataset.theme = theme.activeTheme.id;
}

function ConfirmationModal({
  canConfirm = true,
  confirmLabel,
  confirmationLabel,
  confirmationValue,
  description,
  error,
  isPending,
  onCancel,
  onConfirm,
  onConfirmationChange,
  title,
}: ConfirmationModalProps) {
  const modalId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="modal-backdrop">
      <section
        aria-describedby={`${modalId}-description`}
        aria-labelledby={`${modalId}-title`}
        aria-modal="true"
        className="confirmation-modal"
        role="dialog"
      >
        <div className="confirmation-modal-warning">
          <span className="warning-icon">
            <TriangleAlert aria-hidden="true" size={24} strokeWidth={2} />
          </span>
          <div>
            <p className="eyebrow">Permanent action</p>
            <h2 id={`${modalId}-title`}>{title}</h2>
          </div>
        </div>

        <p id={`${modalId}-description`}>{description}</p>

        {confirmationLabel && onConfirmationChange ? (
          <label className="field confirmation-field">
            <span>{confirmationLabel}</span>
            <input
              autoFocus
              disabled={isPending}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder="DELETE"
              type="text"
              value={confirmationValue ?? ""}
            />
          </label>
        ) : null}

        {error ? <small className="inline-error">{error}</small> : null}

        <div className="confirmation-modal-actions">
          <button
            autoFocus={!confirmationLabel}
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="danger danger-solid"
            disabled={!canConfirm || isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "Deleting" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    connectionProfiles[0]?.id ?? null,
  );
  const selectedConnectionIdRef = useRef(selectedConnectionId);
  const [runtimeData, setRuntimeData] = useState<RuntimeData>({
    capabilities: capabilitySummary,
    connections: connectionProfiles,
    error: null,
    health: null,
    isLoading: true,
    savedRequests: [],
    source: "mock",
    theme: null,
    traces: traceEntries,
  });
  const [draftConnections, setDraftConnections] = useState<ConnectionProfile[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [isDeletingConnection, setIsDeletingConnection] = useState(false);
  const [connectionActionError, setConnectionActionError] = useState<string | null>(null);
  const [deleteConnectionCandidate, setDeleteConnectionCandidate] =
    useState<ConnectionProfile | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<ConnectionTransport>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [activeCapabilityTab, setActiveCapabilityTab] = useState<CapabilityTab>("tools");
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>("schema");
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
  const [toolExecutionError, setToolExecutionError] = useState<RuntimeDisplayError | null>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [isReplayingTool, setIsReplayingTool] = useState(false);
  const [isToolActionMenuOpen, setIsToolActionMenuOpen] = useState(false);
  const [isDetailDescriptionOpen, setIsDetailDescriptionOpen] = useState(false);
  const [isSaveRequestComposerOpen, setIsSaveRequestComposerOpen] = useState(false);
  const [saveRequestName, setSaveRequestName] = useState("");
  const [saveRequestDescription, setSaveRequestDescription] = useState("");
  const [loadedSavedRequestId, setLoadedSavedRequestId] = useState<string | null>(null);
  const [hasLoadedSavedRequestChanges, setHasLoadedSavedRequestChanges] = useState(false);
  const [savedRequestError, setSavedRequestError] = useState<string | null>(null);
  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const [executingSavedRequestId, setExecutingSavedRequestId] = useState<string | null>(null);
  const [updatingSavedRequestId, setUpdatingSavedRequestId] = useState<string | null>(null);
  const [deletingSavedRequestId, setDeletingSavedRequestId] = useState<string | null>(null);
  const [expandedSavedRequestId, setExpandedSavedRequestId] = useState<string | null>(
    null,
  );
  const [deleteSavedRequestCandidate, setDeleteSavedRequestCandidate] =
    useState<SavedRequest | null>(null);
  const [savedRequestEdits, setSavedRequestEdits] = useState<
    Record<string, SavedRequestEditDraft>
  >({});
  const [selectedTraceEntry, setSelectedTraceEntry] = useState<TraceArtifactEntry | null>(
    null,
  );
  const [traceTransferError, setTraceTransferError] = useState<string | null>(null);
  const [isExportingTrace, setIsExportingTrace] = useState(false);
  const [isImportingTrace, setIsImportingTrace] = useState(false);
  const [responseViewMode, setResponseViewMode] =
    useState<ResponseViewMode>("formatted");
  const traceFileInputRef = useRef<HTMLInputElement | null>(null);
  const toolActionMenuRef = useRef<HTMLDivElement | null>(null);
  const isLoadingSavedRequestRef = useRef(false);

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
  const selectedToolIsDeprecated = isDeprecatedTool(selectedTool);
  const selectedToolReplacement = getDeprecatedToolReplacement(
    selectedTool,
    runtimeData.capabilities.tools,
  );
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
  const themeDiagnostics =
    runtimeData.theme?.diagnostics.filter((diagnostic) => diagnostic.level === "warning") ?? [];
  const themeStatus =
    runtimeData.theme && runtimeData.source === "runtime"
      ? `Theme: ${runtimeData.theme.activeTheme.name}`
      : null;
  const isRemoteTransport = transport === "http" || transport === "sse";
  const canSaveConnection =
    name.trim().length > 0 &&
    ((transport === "stdio" && command.trim().length > 0) ||
      (isRemoteTransport && url.trim().length > 0));
  const canDeleteSelectedConnection =
    runtimeData.source === "runtime" &&
    Boolean(selectedConnection) &&
    !selectedConnection?.isBuiltIn &&
    !selectedConnection?.id.startsWith("draft-");
  const targetCommand = formatConnectionCommand(selectedConnection);

  const detailTitle =
    activeCapabilityTab === "tools"
      ? selectedTool?.name ?? "No tools"
      : activeCapabilityTab === "resources"
        ? selectedResource?.name ?? selectedResource?.uri ?? "No resources"
        : activeCapabilityTab === "prompts"
          ? selectedPrompt?.name ?? "No prompts"
          : selectedSchema?.name ?? "No schemas";
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
        isDeprecated: isDeprecatedTool(tool),
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
  const savedRequestGroups = useMemo(() => {
    const groups = new Map<string, SavedRequest[]>();

    for (const savedRequest of runtimeData.savedRequests) {
      const requests = groups.get(savedRequest.toolName) ?? [];

      requests.push(savedRequest);
      groups.set(savedRequest.toolName, requests);
    }

    return Array.from(groups, ([toolName, requests]) => ({ requests, toolName }));
  }, [runtimeData.savedRequests]);
  const loadedSavedRequest = loadedSavedRequestId
    ? runtimeData.savedRequests.find((savedRequest) => savedRequest.id === loadedSavedRequestId)
    : undefined;
  const canSaveCurrentRequest =
    runtimeData.source === "runtime" &&
    activeCapabilityTab === "tools" &&
    Boolean(selectedTool) &&
    Boolean(selectedConnection);
  const saveRequestActionLabel =
    loadedSavedRequest && hasLoadedSavedRequestChanges ? "Save changes" : "Save request";
  const detailMetadata = [
    activeCapabilityTab === "tools"
      ? getToolParameterSummary(selectedTool)
      : activeCapabilityTab === "resources"
        ? selectedResource?.mimeType ?? "Resource"
        : activeCapabilityTab === "prompts"
          ? `${selectedPrompt?.arguments?.length ?? 0} arguments`
          : selectedSchema?.source ?? "JSON schema",
  ].filter(Boolean);

  const selectedCapabilityId =
    activeCapabilityTab === "tools"
      ? selectedTool?.name
      : activeCapabilityTab === "resources"
        ? selectedResource?.uri
        : activeCapabilityTab === "prompts"
          ? selectedPrompt?.name
          : selectedSchema?.id;
  const selectedTracePayload = selectedTraceEntry
    ? responseViewMode === "raw"
      ? {
          request: selectedTraceEntry.response?.rawRequest,
          response: selectedTraceEntry.response?.rawResponse,
          trace: selectedTraceEntry.trace,
        }
      : {
          request: selectedTraceEntry.request,
          response: selectedTraceEntry.response
            ? {
                durationMs: selectedTraceEntry.response.durationMs,
                error: selectedTraceEntry.response.error,
                errorCode: selectedTraceEntry.response.errorCode,
                output: selectedTraceEntry.response.output,
                requestId: selectedTraceEntry.response.requestId,
                status: selectedTraceEntry.response.status,
              }
            : undefined,
          trace: selectedTraceEntry.trace,
        }
    : null;
  const selectedReplayRequestId =
    selectedTraceEntry?.request?.id ?? selectedTraceEntry?.trace.requestId;
  const canReplaySelectedTrace =
    runtimeData.source === "runtime" && Boolean(selectedReplayRequestId);
  const responsePayload = toolExecutionError
    ? {
        error: toolExecutionError.message,
        code: toolExecutionError.code,
        details: toolExecutionError.details,
        httpStatus: toolExecutionError.status,
        status: "error",
      }
    : toolExecution
      ? responseViewMode === "raw"
        ? {
            request: toolExecution.response.rawRequest,
            response: toolExecution.response.rawResponse,
            trace: toolExecution.trace,
          }
        : {
            request: toolExecution.request,
            response: {
              durationMs: toolExecution.response.durationMs,
              error: toolExecution.response.error,
              errorCode: toolExecution.response.errorCode,
              output: toolExecution.response.output,
              requestId: toolExecution.response.requestId,
              status: toolExecution.response.status,
            },
            trace: toolExecution.trace,
          }
      : selectedTracePayload;
  const responseStatus =
    toolExecution?.response.status ??
    selectedTraceEntry?.trace.status ??
    (toolExecutionError ? "error" : "idle");

  const selectConnectionId = useCallback((connectionId: string | null) => {
    selectedConnectionIdRef.current = connectionId;
    setSelectedConnectionId(connectionId);
  }, []);

  const loadRuntimeData = useCallback(
    async (signal?: AbortSignal) => {
      setRuntimeData((currentData) => ({
        ...currentData,
        error: null,
        isLoading: true,
      }));

      try {
        const [health, themeResponse, connectionsResponse, historyResponse] = await Promise.all([
          localRuntimeClient.getHealth(signal),
          localRuntimeClient.getTheme(signal),
          localRuntimeClient.listConnections(signal),
          localRuntimeClient.listHistory(signal),
        ]);
        applyTheme(themeResponse);
        const nextConnections = connectionsResponse.connections;
        const preferredConnectionId = selectedConnectionIdRef.current;
        const nextSelectedConnectionId =
          preferredConnectionId &&
          nextConnections.some((connection) => connection.id === preferredConnectionId)
            ? preferredConnectionId
            : nextConnections[0]?.id ?? null;
        const [capabilities, savedRequestsResponse] = nextSelectedConnectionId
          ? await Promise.all([
              localRuntimeClient.getCapabilities(nextSelectedConnectionId, signal),
              localRuntimeClient.listSavedRequests(nextSelectedConnectionId, signal),
            ])
          : [
              createEmptyCapabilitySummary("runtime"),
              { savedRequests: [] },
            ];

        setDraftConnections([]);
        selectConnectionId(nextSelectedConnectionId);
        setRuntimeData({
          capabilities,
          connections: nextConnections,
          error: null,
          health,
          isLoading: false,
          savedRequests: savedRequestsResponse.savedRequests,
          source: "runtime",
          theme: themeResponse,
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
          savedRequests: [],
          source: "mock",
          theme: null,
          traces: traceEntries,
        });
        const preferredConnectionId = selectedConnectionIdRef.current;
        const nextSelectedConnectionId =
          preferredConnectionId &&
          (preferredConnectionId.startsWith("draft-") ||
            connectionProfiles.some((connection) => connection.id === preferredConnectionId))
            ? preferredConnectionId
            : connectionProfiles[0]?.id ?? null;

        selectConnectionId(nextSelectedConnectionId);
      }
    },
    [selectConnectionId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadRuntimeData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadRuntimeData]);

  useEffect(() => {
    if (isLoadingSavedRequestRef.current) {
      isLoadingSavedRequestRef.current = false;
      return;
    }

    setActiveEditorTab("schema");
    setToolInputDraft(formatJson(getDefaultToolInput(selectedTool)));
    setToolInputError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setSelectedTraceEntry(null);
    setResponseViewMode("formatted");
    setIsToolActionMenuOpen(false);
    setIsDetailDescriptionOpen(false);
    setIsSaveRequestComposerOpen(false);
    setSaveRequestName("");
    setSaveRequestDescription("");
    setLoadedSavedRequestId(null);
    setHasLoadedSavedRequestChanges(false);
    setSavedRequestError(null);
  }, [selectedTool?.name]);

  useEffect(() => {
    if (!deleteConnectionCandidate && !deleteSavedRequestCandidate) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !isDeletingConnection &&
        !deletingSavedRequestId
      ) {
        closeDeleteModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    deleteConnectionCandidate,
    deleteSavedRequestCandidate,
    deletingSavedRequestId,
    isDeletingConnection,
  ]);

  useEffect(() => {
    if (!isToolActionMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        toolActionMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsToolActionMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsToolActionMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isToolActionMenuOpen]);

  function resetForm() {
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
    setComposerError(null);
    setEnvRows([createBlankRow("env")]);
    setHeaderRows([createBlankRow("header")]);
  }

  function closeComposer() {
    setIsComposerOpen(false);
    setEditingConnectionId(null);
    resetForm();
  }

  function openNewConnectionComposer() {
    if (isComposerOpen && !editingConnectionId) {
      closeComposer();
      return;
    }

    setEditingConnectionId(null);
    resetForm();
    setIsComposerOpen(true);
  }

  function openEditConnectionComposer(connection: ConnectionProfile) {
    setEditingConnectionId(connection.id);
    setName(connection.name);
    setTransport(connection.transport);
    setCommand(connection.transport === "stdio" ? formatConnectionCommand(connection) : "");
    setUrl(connection.transport === "stdio" ? "" : connection.url ?? "");
    setComposerError(null);
    setEnvRows(recordToRows(connection.env, "env"));
    setHeaderRows(recordToRows(connection.headers, "header"));
    setIsComposerOpen(true);
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

  async function loadConnectionCapabilities(connectionId: string) {
    setRuntimeData((currentData) => ({
      ...currentData,
      capabilities: createEmptyCapabilitySummary(connectionId),
      error: null,
      isLoading: true,
    }));

    try {
      const capabilities = await localRuntimeClient.getCapabilities(connectionId);

      if (selectedConnectionIdRef.current !== connectionId) {
        return;
      }

      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      if (selectedConnectionIdRef.current !== connectionId) {
        return;
      }

      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(connectionId),
        error: getErrorMessage(error),
        isLoading: false,
      }));
    }
  }

  async function loadSavedRequests(connectionId: string) {
    if (runtimeData.source !== "runtime") {
      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: [],
      }));
      return;
    }

    try {
      const savedRequestsResponse = await localRuntimeClient.listSavedRequests(connectionId);

      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: savedRequestsResponse.savedRequests,
      }));
      if (
        loadedSavedRequestId &&
        !savedRequestsResponse.savedRequests.some(
          (savedRequest) => savedRequest.id === loadedSavedRequestId,
        )
      ) {
        setLoadedSavedRequestId(null);
        setHasLoadedSavedRequestChanges(false);
      }
      setSavedRequestEdits({});
      setSavedRequestError(null);
    } catch (error) {
      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: [],
      }));
      setSavedRequestError(getErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const profileRequest: CreateConnectionProfileRequest = {
      command: transport === "stdio" ? command.trim() : undefined,
      env: rowsToRecord(envRows),
      headers: isRemoteTransport ? rowsToRecord(headerRows) : undefined,
      name: name.trim(),
      transport,
      url: isRemoteTransport ? url.trim() : undefined,
    };

    setComposerError(null);

    if (editingConnectionId) {
      const existingConnection = connections.find(
        (connection) => connection.id === editingConnectionId,
      );

      if (!existingConnection) {
        setComposerError("Connection not found.");
        return;
      }

      if (runtimeData.source === "runtime" && !editingConnectionId.startsWith("draft-")) {
        setIsSavingConnection(true);

        try {
          const updatedProfile = await localRuntimeClient.updateConnection(
            editingConnectionId,
            profileRequest,
          );

          selectConnectionId(updatedProfile.connection.id);
          setRuntimeData((currentData) => ({
            ...currentData,
            capabilities: createEmptyCapabilitySummary(updatedProfile.connection.id),
            connections: currentData.connections.map((connection) =>
              connection.id === updatedProfile.connection.id
                ? updatedProfile.connection
                : connection,
            ),
            error: null,
            savedRequests: [],
          }));
          closeComposer();

          await loadConnectionCapabilities(updatedProfile.connection.id);
        } catch (error) {
          setComposerError(getErrorMessage(error));
        } finally {
          setIsSavingConnection(false);
        }
        return;
      }

      const updatedDraft: ConnectionProfile = {
        ...existingConnection,
        ...profileRequest,
        updatedAt: new Date().toISOString(),
      };

      setDraftConnections((currentConnections) =>
        currentConnections.map((connection) =>
          connection.id === updatedDraft.id ? updatedDraft : connection,
        ),
      );
      selectConnectionId(updatedDraft.id);
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(updatedDraft.id),
        savedRequests: [],
      }));
      closeComposer();
      return;
    }

    if (runtimeData.source === "runtime") {
      setIsSavingConnection(true);

      try {
        const createdProfile = await localRuntimeClient.createConnection(profileRequest);

        setDraftConnections([]);
        selectConnectionId(createdProfile.connection.id);
        setRuntimeData((currentData) => ({
          ...currentData,
          capabilities: createEmptyCapabilitySummary(createdProfile.connection.id),
          connections: [
            createdProfile.connection,
            ...currentData.connections.filter(
              (connection) => connection.id !== createdProfile.connection.id,
            ),
          ],
          error: null,
          savedRequests: [],
        }));
        closeComposer();

        await loadConnectionCapabilities(createdProfile.connection.id);
      } catch (error) {
        setComposerError(getErrorMessage(error));
      } finally {
        setIsSavingConnection(false);
      }
      return;
    }

    const now = new Date().toISOString();
    const profile: ConnectionProfile = {
      ...profileRequest,
      id: `draft-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };

    setDraftConnections((currentConnections) => [profile, ...currentConnections]);
    selectConnectionId(profile.id);
    setRuntimeData((currentData) => ({
      ...currentData,
      capabilities: createEmptyCapabilitySummary(profile.id),
      savedRequests: [],
    }));
    closeComposer();
  }

  async function handleSelectConnection(connectionId: string) {
    selectConnectionId(connectionId);
    setCapabilityFilter("");
    setConnectionActionError(null);
    setIsToolActionMenuOpen(false);
    setLoadedSavedRequestId(null);
    setHasLoadedSavedRequestChanges(false);
    setIsSaveRequestComposerOpen(false);
    setSaveRequestName("");
    setSaveRequestDescription("");

    if (connectionId.startsWith("draft-")) {
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(connectionId),
        error: null,
        isLoading: false,
        savedRequests: [],
      }));
      return;
    }

    if (runtimeData.source !== "runtime") {
      return;
    }

    await Promise.all([
      loadConnectionCapabilities(connectionId),
      loadSavedRequests(connectionId),
    ]);
  }

  function openDeleteConnectionModal(connection: ConnectionProfile) {
    setDeleteConnectionCandidate(connection);
    setDeleteConfirmation("");
    setConnectionActionError(null);
  }

  function closeDeleteModal() {
    if (isDeletingConnection || deletingSavedRequestId) {
      return;
    }

    setDeleteConnectionCandidate(null);
    setDeleteSavedRequestCandidate(null);
    setDeleteConfirmation("");
    setConnectionActionError(null);
    setSavedRequestError(null);
  }

  async function handleDeleteConnection(connection: ConnectionProfile) {
    if (
      runtimeData.source !== "runtime" ||
      connection.isBuiltIn ||
      connection.id.startsWith("draft-")
    ) {
      return;
    }

    if (deleteConfirmation !== "DELETE") {
      return;
    }

    setIsDeletingConnection(true);
    setConnectionActionError(null);

    try {
      await localRuntimeClient.deleteConnection(connection.id);

      const remainingConnections = runtimeData.connections.filter(
        (item) => item.id !== connection.id,
      );
      const nextConnectionId = remainingConnections[0]?.id ?? null;

      selectConnectionId(nextConnectionId);
      setCapabilityFilter("");
      setSelectedCapabilityKeys({
        prompts: null,
        resources: null,
        schemas: null,
        tools: null,
      });
      setToolExecution(null);
      setToolExecutionError(null);
      setSelectedTraceEntry(null);
      setSavedRequestEdits({});
      setSavedRequestError(null);
      setLoadedSavedRequestId(null);
      setHasLoadedSavedRequestChanges(false);
      setIsSaveRequestComposerOpen(false);
      setSaveRequestName("");
      setSaveRequestDescription("");
      setTraceTransferError(null);
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(nextConnectionId ?? "runtime"),
        connections: remainingConnections,
        error: null,
        isLoading: true,
        savedRequests: [],
        traces: currentData.traces.filter((trace) => trace.connectionId !== connection.id),
      }));

      if (editingConnectionId === connection.id) {
        closeComposer();
      }

      setDeleteConnectionCandidate(null);
      setDeleteConfirmation("");

      if (nextConnectionId) {
        await Promise.all([
          loadConnectionCapabilities(nextConnectionId),
          loadSavedRequests(nextConnectionId),
        ]);
      } else {
        setRuntimeData((currentData) => ({
          ...currentData,
          isLoading: false,
        }));
      }
    } catch (error) {
      setConnectionActionError(getErrorMessage(error));
    } finally {
      setIsDeletingConnection(false);
    }
  }

  function handleSelectCapability(itemId: string) {
    setSelectedCapabilityKeys((keys) => ({
      ...keys,
      [activeCapabilityTab]: itemId,
    }));
  }

  function handleSelectTool(toolName: string) {
    setActiveCapabilityTab("tools");
    setSelectedCapabilityKeys((keys) => ({
      ...keys,
      tools: toolName,
    }));
    setCapabilityFilter("");
  }

  function readToolInputDraft() {
    let input: unknown;

    try {
      input = JSON.parse(toolInputDraft);
    } catch {
      setToolInputError("Request input must be valid JSON.");
      return undefined;
    }

    if (!isJsonObject(input)) {
      setToolInputError("Request input must be a JSON object.");
      return undefined;
    }

    setToolInputError(null);
    return input;
  }

  function openSaveRequestComposer() {
    if (!canSaveCurrentRequest || !selectedTool) {
      return;
    }

    setSaveRequestName(loadedSavedRequest?.name ?? `${selectedTool.name} request`);
    setSaveRequestDescription(loadedSavedRequest?.description ?? "");
    setSavedRequestError(null);
    setIsSaveRequestComposerOpen(true);
  }

  function closeSaveRequestComposer() {
    setIsSaveRequestComposerOpen(false);
    setSaveRequestName("");
    setSaveRequestDescription("");
    setSavedRequestError(null);
  }

  async function handleToolCallSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConnection || !selectedTool) {
      return;
    }

    const input = readToolInputDraft();

    if (!input) {
      return;
    }

    setToolExecution(null);
    setToolExecutionError(null);
    setSelectedTraceEntry(null);
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
      setToolExecutionError(getRuntimeDisplayError(error));
    } finally {
      setIsExecutingTool(false);
    }
  }

  async function handleSaveCurrentRequest(options: { updateLoaded?: boolean } = {}) {
    if (runtimeData.source !== "runtime") {
      setSavedRequestError("Saved requests require the local runtime.");
      return;
    }

    if (!selectedConnection || !selectedTool) {
      setSavedRequestError("Select a tool before saving a request.");
      return;
    }

    const input = readToolInputDraft();

    if (!input) {
      return;
    }

    const shouldUpdateLoaded = Boolean(options.updateLoaded && loadedSavedRequest);
    const name =
      saveRequestName.trim() ||
      loadedSavedRequest?.name ||
      `${selectedTool.name} request`;
    const description =
      saveRequestDescription.trim() || loadedSavedRequest?.description || undefined;

    setIsSavingRequest(true);
    setSavedRequestError(null);

    try {
      if (shouldUpdateLoaded && loadedSavedRequest) {
        const result = await localRuntimeClient.updateSavedRequest(loadedSavedRequest.id, {
          description,
          input,
          name,
        });

        setRuntimeData((currentData) => ({
          ...currentData,
          savedRequests: currentData.savedRequests.map((savedRequest) =>
            savedRequest.id === result.savedRequest.id ? result.savedRequest : savedRequest,
          ),
        }));
        setLoadedSavedRequestId(result.savedRequest.id);
        setHasLoadedSavedRequestChanges(false);
        closeSaveRequestComposer();
        return;
      }

      const result = await localRuntimeClient.createSavedRequest(selectedConnection.id, {
        description,
        input,
        name,
        toolName: selectedTool.name,
      });

      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: [
          result.savedRequest,
          ...currentData.savedRequests.filter(
            (savedRequest) => savedRequest.id !== result.savedRequest.id,
          ),
        ],
      }));
      setLoadedSavedRequestId(result.savedRequest.id);
      setHasLoadedSavedRequestChanges(false);
      closeSaveRequestComposer();
    } catch (error) {
      setSavedRequestError(getErrorMessage(error));
    } finally {
      setIsSavingRequest(false);
    }
  }

  function handleSaveRequestAction() {
    setIsToolActionMenuOpen(false);

    if (loadedSavedRequest && hasLoadedSavedRequestChanges) {
      void handleSaveCurrentRequest({ updateLoaded: true });
      return;
    }

    openSaveRequestComposer();
  }

  function handleLoadSavedRequest(savedRequest: SavedRequest) {
    isLoadingSavedRequestRef.current = true;
    setActiveCapabilityTab("tools");
    setActiveEditorTab("request");
    setSelectedCapabilityKeys((keys) => ({
      ...keys,
      tools: savedRequest.toolName,
    }));
    setToolInputDraft(formatJson(savedRequest.input));
    setToolInputError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setSelectedTraceEntry(null);
    setResponseViewMode("formatted");
    setLoadedSavedRequestId(savedRequest.id);
    setHasLoadedSavedRequestChanges(false);
    setIsSaveRequestComposerOpen(false);
    setSaveRequestName(savedRequest.name);
    setSaveRequestDescription(savedRequest.description ?? "");
    setSavedRequestError(null);
  }

  async function handleExecuteSavedRequest(savedRequest: SavedRequest) {
    handleLoadSavedRequest(savedRequest);
    setExecutingSavedRequestId(savedRequest.id);
    setToolExecution(null);
    setToolExecutionError(null);

    try {
      const result = await localRuntimeClient.callTool(
        savedRequest.connectionId,
        savedRequest.toolName,
        savedRequest.input,
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
      setToolExecutionError(getRuntimeDisplayError(error));
    } finally {
      setExecutingSavedRequestId(null);
    }
  }

  function updateSavedRequestDraft(
    savedRequest: SavedRequest,
    field: keyof SavedRequestEditDraft,
    value: string,
  ) {
    setSavedRequestEdits((edits) => ({
      ...edits,
      [savedRequest.id]: {
        description: edits[savedRequest.id]?.description ?? savedRequest.description ?? "",
        name: edits[savedRequest.id]?.name ?? savedRequest.name,
        [field]: value,
      },
    }));
  }

  function toggleSavedRequestDetails(savedRequestId: string) {
    setExpandedSavedRequestId((currentId) =>
      currentId === savedRequestId ? null : savedRequestId,
    );
  }

  async function handleUpdateSavedRequest(savedRequest: SavedRequest) {
    const draft = savedRequestEdits[savedRequest.id] ?? {
      description: savedRequest.description ?? "",
      name: savedRequest.name,
    };
    const name = draft.name.trim();

    if (!name) {
      setSavedRequestError("Saved request name is required.");
      return;
    }

    setUpdatingSavedRequestId(savedRequest.id);
    setSavedRequestError(null);

    try {
      const result = await localRuntimeClient.updateSavedRequest(savedRequest.id, {
        description: draft.description.trim() || undefined,
        name,
      });

      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: currentData.savedRequests.map((item) =>
          item.id === result.savedRequest.id ? result.savedRequest : item,
        ),
      }));
      if (loadedSavedRequestId === result.savedRequest.id) {
        setSaveRequestName(result.savedRequest.name);
        setSaveRequestDescription(result.savedRequest.description ?? "");
      }
      setSavedRequestEdits((edits) => {
        const { [savedRequest.id]: _updated, ...remainingEdits } = edits;

        return remainingEdits;
      });
      setExpandedSavedRequestId(null);
    } catch (error) {
      setSavedRequestError(getErrorMessage(error));
    } finally {
      setUpdatingSavedRequestId(null);
    }
  }

  function openDeleteSavedRequestModal(savedRequest: SavedRequest) {
    setDeleteSavedRequestCandidate(savedRequest);
    setSavedRequestError(null);
  }

  async function handleDeleteSavedRequest(savedRequest: SavedRequest) {
    setDeletingSavedRequestId(savedRequest.id);
    setSavedRequestError(null);

    try {
      await localRuntimeClient.deleteSavedRequest(savedRequest.id);
      setRuntimeData((currentData) => ({
        ...currentData,
        savedRequests: currentData.savedRequests.filter(
          (item) => item.id !== savedRequest.id,
        ),
      }));
      setSavedRequestEdits((edits) => {
        const { [savedRequest.id]: _deleted, ...remainingEdits } = edits;

        return remainingEdits;
      });
      if (loadedSavedRequestId === savedRequest.id) {
        setLoadedSavedRequestId(null);
        setHasLoadedSavedRequestChanges(false);
        setIsSaveRequestComposerOpen(false);
      }
      setDeleteSavedRequestCandidate(null);
    } catch (error) {
      setSavedRequestError(getErrorMessage(error));
    } finally {
      setDeletingSavedRequestId(null);
    }
  }

  async function handleSelectTrace(entry: TraceEntry) {
    setTraceTransferError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setResponseViewMode("formatted");

    if (runtimeData.source !== "runtime") {
      setSelectedTraceEntry({ trace: entry });
      return;
    }

    try {
      const traceEntry = await localRuntimeClient.getTrace(entry.id);

      setSelectedTraceEntry(traceEntry);
    } catch (error) {
      setTraceTransferError(getErrorMessage(error));
      setSelectedTraceEntry({ trace: entry });
    }
  }

  async function handleReplaySelectedTrace() {
    if (!selectedReplayRequestId) {
      return;
    }

    setTraceTransferError(null);
    setToolExecution(null);
    setToolExecutionError(null);
    setIsReplayingTool(true);
    setResponseViewMode("formatted");

    try {
      const result = await localRuntimeClient.replayToolCall({
        requestId: selectedReplayRequestId,
      });

      setToolExecution(result);
      setSelectedTraceEntry({
        request: result.request,
        response: result.response,
        trace: result.trace,
      });
      setRuntimeData((currentData) => ({
        ...currentData,
        traces: [
          result.trace,
          ...currentData.traces.filter((trace) => trace.id !== result.trace.id),
        ],
      }));
    } catch (error) {
      setToolExecutionError(getRuntimeDisplayError(error));
    } finally {
      setIsReplayingTool(false);
    }
  }

  async function handleExportTrace() {
    if (runtimeData.source !== "runtime" || runtimeData.traces.length === 0) {
      return;
    }

    setIsExportingTrace(true);
    setTraceTransferError(null);

    try {
      const result = await localRuntimeClient.exportTrace({
        traceIds: runtimeData.traces.map((trace) => trace.id),
      });
      const blob = new Blob([`${formatJson(result.trace)}\n`], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `mcp-inspector-trace-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setTraceTransferError(getErrorMessage(error));
    } finally {
      setIsExportingTrace(false);
    }
  }

  async function handleImportTraceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || runtimeData.source !== "runtime") {
      return;
    }

    setIsImportingTrace(true);
    setTraceTransferError(null);

    try {
      const trace = JSON.parse(await file.text()) as TraceArtifact;
      const result = await localRuntimeClient.importTrace({ trace });

      setRuntimeData((currentData) => ({
        ...currentData,
        traces: result.traces,
      }));
      setSelectedTraceEntry(result.imported[0] ?? null);
      setToolExecution(null);
      setToolExecutionError(null);
      setResponseViewMode("formatted");
    } catch (error) {
      setTraceTransferError(getErrorMessage(error));
    } finally {
      setIsImportingTrace(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <main
        aria-hidden={
          deleteConnectionCandidate || deleteSavedRequestCandidate ? true : undefined
        }
        className="app-shell"
        inert={deleteConnectionCandidate || deleteSavedRequestCandidate ? true : undefined}
      >
      <aside className="sidebar">
        <div className="sidebar-scroll">
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
            {themeStatus ? <small className="theme-status">{themeStatus}</small> : null}
          </div>
        </section>

        {themeDiagnostics.length > 0 ? (
          <div className="theme-diagnostics">
            {themeDiagnostics.map((diagnostic) => (
              <small key={diagnostic.message}>{diagnostic.message}</small>
            ))}
          </div>
        ) : null}

        {runtimeTone === "fallback" ? (
          <div className="fallback-banner">Fallback data</div>
        ) : null}

        <section className="sidebar-section connections-section">
          <div className="section-header">
            <h2>Connections</h2>
            <button
              aria-expanded={isComposerOpen}
              className="ghost-button"
              onClick={openNewConnectionComposer}
              type="button"
            >
              + New
            </button>
          </div>

          {isComposerOpen ? (
            <form className="connection-composer" onSubmit={handleSubmit}>
              <div className="composer-header">
                <h3>{editingConnectionId ? "Edit connection" : "New connection"}</h3>
                {editingConnectionId ? <small>{editingConnectionId}</small> : null}
              </div>

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

              {composerError ? <small className="inline-error">{composerError}</small> : null}

              <div className="form-actions">
                <button onClick={closeComposer} type="button">
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={!canSaveConnection || isSavingConnection}
                  type="submit"
                >
                  {isSavingConnection
                    ? "Saving"
                    : editingConnectionId
                      ? "Save profile"
                      : runtimeData.source === "runtime"
                        ? "Create profile"
                        : "Create draft"}
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
          {connectionActionError ? (
            <small className="inline-error connection-action-error">
              {connectionActionError}
            </small>
          ) : null}
        </section>

        <section className="sidebar-section saved-requests-section">
          <div className="section-header">
            <h2>Saved Requests</h2>
            <small className="section-count">{runtimeData.savedRequests.length}</small>
          </div>
          {savedRequestError && !deleteSavedRequestCandidate ? (
            <small className="inline-error saved-request-sidebar-error">
              {savedRequestError}
            </small>
          ) : null}
          <div className="saved-request-sidebar-list">
            {savedRequestGroups.length > 0 ? (
              savedRequestGroups.map((group) => (
                <div className="saved-request-tool-group" key={group.toolName}>
                  <div className="saved-request-group-header">
                    <span>{group.toolName}</span>
                    <small>{group.requests.length}</small>
                  </div>
                  {group.requests.map((savedRequest) => {
                    const editDraft = savedRequestEdits[savedRequest.id] ?? {
                      description: savedRequest.description ?? "",
                      name: savedRequest.name,
                    };
                    const isExpanded = expandedSavedRequestId === savedRequest.id;
                    const isLoaded = loadedSavedRequestId === savedRequest.id;
                    const detailsId = `saved-request-sidebar-details-${savedRequest.id}`;

                    return (
                      <article
                        className={`saved-request-nav-item ${isLoaded ? "loaded" : ""} ${
                          isExpanded ? "expanded" : ""
                        }`}
                        key={savedRequest.id}
                      >
                        <button
                          className="saved-request-nav-main"
                          onClick={() => handleLoadSavedRequest(savedRequest)}
                          title={savedRequest.description ?? savedRequest.id}
                          type="button"
                        >
                          <span>
                            {savedRequest.name}
                            {isLoaded && hasLoadedSavedRequestChanges ? (
                              <span className="dirty-indicator" aria-label="Unsaved changes" />
                            ) : null}
                          </span>
                          <small>
                            {isLoaded && hasLoadedSavedRequestChanges
                              ? "Unsaved changes"
                              : (savedRequest.description ?? savedRequest.id)}
                          </small>
                        </button>
                        <div className="saved-request-nav-actions">
                          <button
                            disabled={executingSavedRequestId === savedRequest.id}
                            onClick={() => void handleExecuteSavedRequest(savedRequest)}
                            type="button"
                          >
                            {executingSavedRequestId === savedRequest.id
                              ? "Running"
                              : "Execute"}
                          </button>
                          <button
                            aria-controls={detailsId}
                            aria-expanded={isExpanded}
                            onClick={() => toggleSavedRequestDetails(savedRequest.id)}
                            type="button"
                          >
                            {isExpanded ? "Hide" : "Edit"}
                          </button>
                          <button
                            disabled={deletingSavedRequestId === savedRequest.id}
                            onClick={() => openDeleteSavedRequestModal(savedRequest)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="saved-request-inline-editor" id={detailsId}>
                            <label className="field compact">
                              <span>Name</span>
                              <input
                                onChange={(event) =>
                                  updateSavedRequestDraft(
                                    savedRequest,
                                    "name",
                                    event.target.value,
                                  )
                                }
                                type="text"
                                value={editDraft.name}
                              />
                            </label>
                            <label className="field compact">
                              <span>Description</span>
                              <input
                                onChange={(event) =>
                                  updateSavedRequestDraft(
                                    savedRequest,
                                    "description",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional"
                                type="text"
                                value={editDraft.description}
                              />
                            </label>
                            <div className="saved-request-editor-actions">
                              <button
                                disabled={updatingSavedRequestId === savedRequest.id}
                                onClick={() => void handleUpdateSavedRequest(savedRequest)}
                                type="button"
                              >
                                {updatingSavedRequestId === savedRequest.id
                                  ? "Saving"
                                  : "Save"}
                              </button>
                              <button
                                onClick={() => toggleSavedRequestDetails(savedRequest.id)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                            <pre>{formatJson(savedRequest.input)}</pre>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="empty-state compact">No saved requests for this connection.</div>
            )}
          </div>
        </section>

        <section className="sidebar-section timeline-section">
          <div className="section-header">
            <h2>Timeline</h2>
            <div className="section-actions">
              <button
                disabled={
                  runtimeData.source !== "runtime" ||
                  runtimeData.traces.length === 0 ||
                  isExportingTrace
                }
                onClick={() => void handleExportTrace()}
                type="button"
              >
                {isExportingTrace ? "Exporting" : "Export"}
              </button>
              <button
                disabled={runtimeData.source !== "runtime" || isImportingTrace}
                onClick={() => traceFileInputRef.current?.click()}
                type="button"
              >
                {isImportingTrace ? "Importing" : "Import"}
              </button>
              <input
                accept="application/json,.json"
                className="file-input"
                hidden
                onChange={(event) => void handleImportTraceFile(event)}
                ref={traceFileInputRef}
                tabIndex={-1}
                type="file"
              />
            </div>
          </div>
          {traceTransferError ? (
            <small className="inline-error trace-error">{traceTransferError}</small>
          ) : null}
          <div className="timeline">
            {runtimeData.traces.length > 0 ? (
              runtimeData.traces.map((entry) => (
                <button
                  className={`timeline-item ${
                    entry.id === selectedTraceEntry?.trace.id ? "selected" : ""
                  }`}
                  key={entry.id}
                  onClick={() => void handleSelectTrace(entry)}
                  type="button"
                >
                  <span className={`status-dot ${entry.status}`} />
                  <span>{entry.operation}</span>
                  <small>
                    {entry.source === "imported" ? "imported " : ""}
                    {entry.durationMs}ms
                  </small>
                </button>
              ))
            ) : (
              <div className="empty-state compact">No runtime activity yet.</div>
            )}
          </div>
        </section>

        </div>
        <div className="sidebar-footer">Local-first - no cloud</div>
      </aside>

      <section className="workbench">
        <header className="target-bar">
          <div className="target-meta">
            <div>
              <div className="target-title-line">
                <span className={`status-dot ${runtimeTone}`} />
                <h2>{selectedConnection?.name ?? "No connection selected"}</h2>
              </div>
              <div className="target-command-line">
                {selectedConnection ? (
                  <span className="transport-pill">{selectedConnection.transport}</span>
                ) : null}
                <p>{targetCommand}</p>
              </div>
            </div>
          </div>

          <div className="target-actions">
            {runtimeTone === "fallback" ? (
              <span className="warning-pill">Fallback data</span>
            ) : null}
            <button
              disabled={!selectedConnection}
              onClick={() =>
                selectedConnection ? openEditConnectionComposer(selectedConnection) : undefined
              }
              type="button"
            >
              Edit
            </button>
            {canDeleteSelectedConnection && selectedConnection ? (
              <button
                className="danger"
                disabled={isDeletingConnection}
                onClick={() => openDeleteConnectionModal(selectedConnection)}
                type="button"
              >
                Delete
              </button>
            ) : null}
            <button
              disabled={!canReplaySelectedTrace || isReplayingTool}
              onClick={() => void handleReplaySelectedTrace()}
              type="button"
            >
              {isReplayingTool ? "Replaying" : "Replay"}
            </button>
            <button
              className="connect-button"
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

            <div className="capability-toolbar">
              <label className="filter-field">
                <span>Filter {activeCapabilityTab}</span>
                <input
                  onChange={(event) => setCapabilityFilter(event.target.value)}
                  placeholder={`Filter ${activeCapabilityTab}...`}
                  type="search"
                  value={capabilityFilter}
                />
              </label>
            </div>

            <div className="capability-list">
              {filteredCapabilityItems.length > 0 ? (
                filteredCapabilityItems.map((item) => (
                  <button
                    className={`capability-card ${
                      item.id === selectedCapabilityId ? "selected" : ""
                    }`}
                    key={item.id}
                    onClick={() => handleSelectCapability(item.id)}
                    title={item.description}
                    type="button"
                  >
                    <div className="capability-card-title">
                      <h3>{item.title}</h3>
                      {item.isDeprecated ? <span>Deprecated</span> : null}
                    </div>
                    {item.meta ? (
                      <div className="capability-card-meta">
                        <small>{item.meta}</small>
                      </div>
                    ) : null}
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
              <div className="detail-header-main">
                <div className="detail-heading">
                  <div className="detail-title-line">
                    <h2>{detailTitle}</h2>
                    {selectedToolIsDeprecated && activeCapabilityTab === "tools" ? (
                      <span className="deprecated-badge">Deprecated</span>
                    ) : null}
                  </div>
                  <div className="detail-meta-line">
                    {detailMetadata.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                    {selectedToolIsDeprecated && activeCapabilityTab === "tools" ? (
                      <span className="deprecated-inline">
                        Deprecated
                        {selectedToolReplacement ? (
                          <>
                            {" -> "}
                            <button
                              onClick={() => handleSelectTool(selectedToolReplacement.name)}
                              type="button"
                            >
                              {selectedToolReplacement.name}
                            </button>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="split-action" ref={toolActionMenuRef}>
                  <button
                    className="primary execute-button split-action-primary"
                    disabled={
                      activeCapabilityTab !== "tools" || !selectedTool || isExecutingTool
                    }
                    type="submit"
                  >
                    {isExecutingTool ? "Executing" : "Execute"}
                  </button>
                  <button
                    aria-expanded={isToolActionMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Tool request actions"
                    className="primary split-action-menu-button"
                    disabled={!canSaveCurrentRequest || isSavingRequest}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setIsToolActionMenuOpen((isOpen) => !isOpen);
                      }
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setIsToolActionMenuOpen((isOpen) => !isOpen);
                    }}
                    type="button"
                  >
                    <ChevronDown aria-hidden="true" size={16} strokeWidth={2.2} />
                  </button>
                  {isToolActionMenuOpen ? (
                    <div className="split-action-menu" role="menu">
                      <button
                        disabled={!canSaveCurrentRequest || isSavingRequest}
                        onClick={handleSaveRequestAction}
                        role="menuitem"
                        type="button"
                      >
                        <span>{isSavingRequest ? "Saving" : saveRequestActionLabel}</span>
                        <small>Current request</small>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                aria-expanded={isDetailDescriptionOpen}
                className="detail-description-toggle"
                onClick={() => setIsDetailDescriptionOpen((isOpen) => !isOpen)}
                type="button"
              >
                <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
                <span>{isDetailDescriptionOpen ? "Hide details" : "Show details"}</span>
              </button>
              {isDetailDescriptionOpen ? (
                <div className="detail-description">
                  {detailDescription ?? "No description provided."}
                </div>
              ) : null}
            </form>

            {isSaveRequestComposerOpen ? (
              <section className="save-request-composer" aria-label="Save current request">
                <label className="field compact">
                  <span>Name</span>
                  <input
                    onChange={(event) => setSaveRequestName(event.target.value)}
                    placeholder={selectedTool ? `${selectedTool.name} request` : "Request name"}
                    type="text"
                    value={saveRequestName}
                  />
                </label>
                <label className="field compact">
                  <span>Description</span>
                  <input
                    onChange={(event) => setSaveRequestDescription(event.target.value)}
                    placeholder="Optional"
                    type="text"
                    value={saveRequestDescription}
                  />
                </label>
                <div className="save-request-composer-actions">
                  <button
                    disabled={isSavingRequest}
                    onClick={closeSaveRequestComposer}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={!canSaveCurrentRequest || isSavingRequest}
                    onClick={() =>
                      void handleSaveCurrentRequest({
                        updateLoaded: Boolean(loadedSavedRequest),
                      })
                    }
                    type="button"
                  >
                    {isSavingRequest
                      ? "Saving"
                      : loadedSavedRequest
                        ? "Save changes"
                        : "Save request"}
                  </button>
                </div>
                {savedRequestError ? (
                  <small className="inline-error">{savedRequestError}</small>
                ) : null}
              </section>
            ) : null}

            <div className="detail-workspace">
              <div className="request-response-flow">
                <section className="editor-tabs-panel">
                  <div className="editor-tab-list" role="tablist" aria-label="Tool editor">
                    <button
                      aria-controls="editor-tab-schema"
                      aria-selected={activeEditorTab === "schema"}
                      className={activeEditorTab === "schema" ? "selected" : ""}
                      id="editor-tab-schema-button"
                      onClick={() => setActiveEditorTab("schema")}
                      role="tab"
                      type="button"
                    >
                      {activeCapabilityTab === "tools" ? "Input schema" : "Definition"}
                    </button>
                    <button
                      aria-controls="editor-tab-request"
                      aria-selected={activeEditorTab === "request"}
                      className={activeEditorTab === "request" ? "selected" : ""}
                      id="editor-tab-request-button"
                      onClick={() => setActiveEditorTab("request")}
                      role="tab"
                      type="button"
                    >
                      Request
                    </button>
                  </div>

                  {activeEditorTab === "schema" ? (
                    <div
                      aria-labelledby="editor-tab-schema-button"
                      className="editor-tab-panel code-tab-panel"
                      id="editor-tab-schema"
                      role="tabpanel"
                    >
                      <span className="code-panel-corner-label">
                        {activeCapabilityTab === "tools" ? "readonly" : "json"}
                      </span>
                      <pre>{formatJson(detailPayload)}</pre>
                    </div>
                  ) : (
                    <div
                      aria-labelledby="editor-tab-request-button"
                      className="editor-tab-panel"
                      id="editor-tab-request"
                      role="tabpanel"
                    >
                      <div className="code-panel-header">
                        <h3>Request</h3>
                        <span>json</span>
                      </div>
                      {activeCapabilityTab === "tools" && selectedTool ? (
                        <label className="json-editor">
                          <span>Tool input</span>
                          <textarea
                            onChange={(event) => {
                              setToolInputDraft(event.target.value);
                              if (loadedSavedRequestId) {
                                setHasLoadedSavedRequestChanges(true);
                              }
                            }}
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
                    </div>
                  )}
                </section>

                <section className="response-viewer">
                  <div className="response-header">
                    <div>
                      <h3>Response</h3>
                      <small
                        className={
                          responseStatus === "success"
                            ? "response-status success"
                            : responseStatus === "error"
                              ? "response-status error"
                              : "response-status"
                        }
                      >
                        {responseStatus}
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
                    <div className="response-empty">
                      Run a tool or select a trace to inspect details here.
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      </section>
      </main>

      {deleteConnectionCandidate ? (
        <ConfirmationModal
          canConfirm={deleteConfirmation === "DELETE"}
          confirmLabel="Delete connection"
          confirmationLabel={
            <>
              Type <strong>DELETE</strong> to confirm
            </>
          }
          confirmationValue={deleteConfirmation}
          description={
            <>
              Deleting <strong>{deleteConnectionCandidate.name}</strong> removes its
              profile, saved requests, local history, and replay data. This action
              cannot be undone.
            </>
          }
          error={connectionActionError}
          isPending={isDeletingConnection}
          onCancel={closeDeleteModal}
          onConfirmationChange={setDeleteConfirmation}
          onConfirm={() => void handleDeleteConnection(deleteConnectionCandidate)}
          title="Delete connection?"
        />
      ) : null}

      {deleteSavedRequestCandidate ? (
        <ConfirmationModal
          confirmLabel="Delete saved request"
          description={
            <>
              Deleting <strong>{deleteSavedRequestCandidate.name}</strong> removes
              this saved tool request. This action cannot be undone.
            </>
          }
          error={savedRequestError}
          isPending={deletingSavedRequestId === deleteSavedRequestCandidate.id}
          onCancel={closeDeleteModal}
          onConfirm={() => void handleDeleteSavedRequest(deleteSavedRequestCandidate)}
          title="Delete saved request?"
        />
      ) : null}
    </>
  );
}
