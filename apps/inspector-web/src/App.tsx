import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type {
  CapabilitySummary,
  ConnectionProfile,
  ConnectionTransport,
  CreateConnectionProfileRequest,
  ExecuteToolCallResponse,
  JsonObject,
  JsonValue,
  PromptDefinition,
  ResourceDefinition,
  RuntimeHealthResponse,
  RuntimeThemeResponse,
  SavedRequest,
  TraceArtifact,
  TraceArtifactEntry,
  ToolDefinition,
  ToolCallResponse,
  TraceEntry,
} from "@dr-w/core";
import { LocalRuntimeError, localRuntimeClient } from "./localRuntimeClient";
import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const runtimeBaseUrl = import.meta.env.VITE_INSPECTOR_RUNTIME_URL ?? "http://127.0.0.1:8787";

type RuntimeDataSource = "runtime" | "mock";
type CapabilityTab = "tools" | "resources" | "prompts" | "schemas";
type EditorTab = "schema" | "request";
type ResponseViewMode = "formatted" | "raw";
type SidebarSectionId = "connections" | "savedRequests" | "timeline";

type SidebarSectionState = Record<SidebarSectionId, boolean>;

interface RuntimeData {
  capabilities: CapabilitySummary;
  capabilityError: RuntimeDisplayError | null;
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
  category?: ToolCategory;
  description: string;
  id: string;
  isDeprecated?: boolean;
  meta?: string;
  requiredCount?: number;
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

interface ResponseErrorSummary {
  detail?: string;
  title: string;
}

interface ToolParameterCounts {
  parameterCount: number;
  requiredCount: number;
}

interface ToolCategory {
  id: string;
  label: string;
}

interface JsonTreeNodeProps {
  expandedPaths: Set<string>;
  name?: string;
  onToggle: (path: string) => void;
  path: string;
  value: unknown;
}

const sidebarSectionStorageKey = "mcp-inspector.sidebar.sections.v1";
const sidebarCollapsedStorageKey = "mcp-inspector.sidebar.collapsed.v1";
const responsePanelHeightStorageKey = "mcp-inspector.response.height.v1";
const requestPanelCollapsedStorageKey = "mcp-inspector.request.collapsed.v1";
const responsePanelCollapsedStorageKey = "mcp-inspector.response.collapsed.v1";
const responsePanelDefaultHeight = 260;
const responsePanelMinHeight = 160;
const responsePanelMaxHeight = 720;
const requestEditorMinHeight = 180;
const jsonTreeMaxChildrenPerNode = 100;
const jsonTreeDefaultExpandedPathLimit = 120;
const jsonTreeExpandedPathLimit = 500;
const jsonPrimitivePreviewMaxLength = 12_000;
const exampleOptionalFieldLimit = 3;
const defaultSidebarSectionState: SidebarSectionState = {
  connections: false,
  savedRequests: false,
  timeline: false,
};

const transportOptions: { label: string; value: ConnectionTransport }[] = [
  { label: "stdio", value: "stdio" },
  { label: "HTTP", value: "http" },
  { label: "SSE", value: "sse" },
];

function readSidebarSectionState(): SidebarSectionState {
  if (typeof window === "undefined") {
    return defaultSidebarSectionState;
  }

  try {
    const rawState = window.localStorage.getItem(sidebarSectionStorageKey);
    const parsedState = rawState ? JSON.parse(rawState) : {};

    if (!isJsonObject(parsedState)) {
      return defaultSidebarSectionState;
    }

    return {
      connections:
        typeof parsedState.connections === "boolean"
          ? parsedState.connections
          : defaultSidebarSectionState.connections,
      savedRequests:
        typeof parsedState.savedRequests === "boolean"
          ? parsedState.savedRequests
          : defaultSidebarSectionState.savedRequests,
      timeline:
        typeof parsedState.timeline === "boolean"
          ? parsedState.timeline
          : defaultSidebarSectionState.timeline,
    };
  } catch {
    return defaultSidebarSectionState;
  }
}

function readSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
}

function readResponsePanelHeight() {
  if (typeof window === "undefined") {
    return responsePanelDefaultHeight;
  }

  try {
    const storedHeight = Number(window.localStorage.getItem(responsePanelHeightStorageKey));

    return Number.isFinite(storedHeight)
      ? clamp(storedHeight, responsePanelMinHeight, responsePanelMaxHeight)
      : responsePanelDefaultHeight;
  } catch {
    return responsePanelDefaultHeight;
  }
}

function readPanelCollapsed(storageKey: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

const capabilityTabs: { id: CapabilityTab; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "resources", label: "Resources" },
  { id: "prompts", label: "Prompts" },
  { id: "schemas", label: "Schemas" },
];

const toolCategories = {
  directory: { id: "directory", label: "Directory operations" },
  reading: { id: "reading", label: "File reading" },
  search: { id: "search", label: "Search / metadata" },
  writing: { id: "writing", label: "File writing / editing" },
  other: { id: "other", label: "Other tools" },
} satisfies Record<string, ToolCategory>;

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

function wait(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
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

function getSchemaType(schema: JsonObject): string | undefined {
  if (typeof schema.type === "string") {
    return schema.type;
  }

  if (Array.isArray(schema.type)) {
    return schema.type.find((type): type is string => typeof type === "string" && type !== "null");
  }

  return undefined;
}

function getSchemaRequiredFields(schema: JsonObject | undefined) {
  if (!schema || !Array.isArray(schema.required)) {
    return [];
  }

  return schema.required.filter((field): field is string => typeof field === "string");
}

function createExampleValueFromSchema(schema: unknown, depth = 0): JsonValue {
  if (!isJsonObject(schema) || depth > 8) {
    return null;
  }

  if ("default" in schema && schema.default !== undefined) {
    return toJsonValue(schema.default);
  }

  if ("const" in schema && schema.const !== undefined) {
    return toJsonValue(schema.const);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return toJsonValue(schema.enum[0]);
  }

  const schemaType = getSchemaType(schema);

  if (schemaType === "object" || isJsonObject(schema.properties)) {
    const requiredFields = getSchemaRequiredFields(schema);
    const properties = isJsonObject(schema.properties) ? schema.properties : {};
    const exampleFields =
      requiredFields.length > 0
        ? requiredFields
        : Object.keys(properties).slice(0, exampleOptionalFieldLimit);
    const example: JsonObject = {};

    for (const field of exampleFields) {
      example[field] = createExampleValueFromSchema(properties[field], depth + 1);
    }

    return example;
  }

  if (schemaType === "array") {
    if ("items" in schema && schema.items !== undefined) {
      return [createExampleValueFromSchema(schema.items, depth + 1)];
    }

    return [];
  }

  if (schemaType === "number" || schemaType === "integer") {
    return 0;
  }

  if (schemaType === "boolean") {
    return false;
  }

  if (schemaType === "null") {
    return null;
  }

  return "";
}

function createToolInputExample(tool: ToolDefinition | undefined) {
  const schema = tool?.inputSchema;
  const example = createExampleValueFromSchema(schema);

  return isJsonObject(example) ? example : {};
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
    );
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonContainer(value: unknown) {
  return isJsonObject(value) || Array.isArray(value);
}

function getJsonEntries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }

  if (isJsonObject(value)) {
    return Object.entries(value);
  }

  return [];
}

function getJsonEntryCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (isJsonObject(value)) {
    return Object.keys(value).length;
  }

  return 0;
}

function getJsonPath(parentPath: string, key: string, parentValue: unknown) {
  return Array.isArray(parentValue) ? `${parentPath}[${key}]` : `${parentPath}.${key}`;
}

function getJsonContainerSummary(value: unknown) {
  const size = getJsonEntryCount(value);

  if (Array.isArray(value)) {
    return size === 1 ? "Array - 1 item" : `Array - ${size} items`;
  }

  return size === 1 ? "Object - 1 key" : `Object - ${size} keys`;
}

function collectExpandedJsonPaths(
  value: unknown,
  maxDepth = Number.POSITIVE_INFINITY,
  maxPaths = jsonTreeExpandedPathLimit,
) {
  const expandedPaths = new Set<string>();

  function visit(currentValue: unknown, path: string, depth: number) {
    if (!isJsonContainer(currentValue) || expandedPaths.size >= maxPaths) {
      return;
    }

    expandedPaths.add(path);

    if (depth >= maxDepth) {
      return;
    }

    for (const [key, childValue] of getJsonEntries(currentValue)) {
      if (expandedPaths.size >= maxPaths) {
        return;
      }

      visit(childValue, getJsonPath(path, key, currentValue), depth + 1);
    }
  }

  visit(value, "$", 0);
  return expandedPaths;
}

function collectDefaultResponsePaths(value: unknown) {
  const expandedPaths = new Set<string>(["$"]);

  if (!isJsonObject(value)) {
    return expandedPaths;
  }

  const result = value.result;

  if (!isJsonContainer(result)) {
    return expandedPaths;
  }

  function visitResult(currentValue: unknown, path: string, depth: number) {
    if (
      !isJsonContainer(currentValue) ||
      expandedPaths.size >= jsonTreeDefaultExpandedPathLimit
    ) {
      return;
    }

    expandedPaths.add(path);

    if (depth >= 3) {
      return;
    }

    for (const [key, childValue] of getJsonEntries(currentValue)) {
      if (expandedPaths.size >= jsonTreeDefaultExpandedPathLimit) {
        return;
      }

      visitResult(childValue, getJsonPath(path, key, currentValue), depth + 1);
    }
  }

  visitResult(result, "$.result", 0);
  return expandedPaths;
}

function formatJsonPrimitive(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" && value.length > jsonPrimitivePreviewMaxLength) {
    const truncatedLength = value.length - jsonPrimitivePreviewMaxLength;
    return JSON.stringify(
      `${value.slice(0, jsonPrimitivePreviewMaxLength)}... [truncated ${truncatedLength} chars]`,
    );
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getJsonPrimitiveClass(value: unknown) {
  if (value === null) {
    return "json-value-null";
  }

  return `json-value-${typeof value}`;
}

function getNestedString(value: unknown, path: string[]): string | undefined {
  let currentValue = value;

  for (const key of path) {
    if (!isJsonObject(currentValue)) {
      return undefined;
    }

    currentValue = currentValue[key];
  }

  return typeof currentValue === "string" ? currentValue : undefined;
}

function isInformativeValue(value: unknown) {
  return value !== undefined && value !== null;
}

function setInformativeEntry(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (isInformativeValue(value)) {
    target[key] = value;
  }
}

function getToolResult(output: unknown) {
  if (!isInformativeValue(output)) {
    return {};
  }

  if (!isJsonObject(output)) {
    return output;
  }

  const result: Record<string, unknown> = {};
  const prioritizedKeys = new Set(["content", "structuredContent"]);

  setInformativeEntry(result, "content", output.content);
  setInformativeEntry(result, "structuredContent", output.structuredContent);

  for (const [key, value] of Object.entries(output)) {
    if (!prioritizedKeys.has(key)) {
      setInformativeEntry(result, key, value);
    }
  }

  return result;
}

function getToolResultText(value: unknown): string | undefined {
  if (!isJsonObject(value) || !Array.isArray(value.content)) {
    return undefined;
  }

  const textContent = value.content.find(
    (item): item is JsonObject & { text: string } =>
      isJsonObject(item) && typeof item.text === "string" && item.text.trim().length > 0,
  );

  return textContent?.text;
}

function getFirstContentText(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const output = value.output;

  if (!isJsonObject(output) || !Array.isArray(output.content)) {
    return undefined;
  }

  const textContent = output.content.find(
    (item): item is JsonObject & { text: string } =>
      isJsonObject(item) && typeof item.text === "string" && item.text.trim().length > 0,
  );

  return textContent?.text;
}

function createResultFirstResponsePayload(
  request: ExecuteToolCallResponse["request"] | TraceArtifactEntry["request"] | undefined,
  response: ToolCallResponse | undefined,
  trace: ExecuteToolCallResponse["trace"] | TraceArtifactEntry["trace"] | undefined,
) {
  const metadata: Record<string, unknown> = {};

  setInformativeEntry(metadata, "request", request);
  setInformativeEntry(metadata, "requestId", response?.requestId ?? trace?.requestId);
  setInformativeEntry(metadata, "durationMs", response?.durationMs ?? trace?.durationMs);
  setInformativeEntry(metadata, "connectionId", trace?.connectionId ?? request?.connectionId);
  setInformativeEntry(metadata, "completedAt", response?.completedAt);
  setInformativeEntry(metadata, "status", response?.status ?? trace?.status);
  setInformativeEntry(metadata, "error", response?.error);
  setInformativeEntry(metadata, "errorCode", response?.errorCode);
  setInformativeEntry(metadata, "trace", trace);

  return {
    result: getToolResult(response?.output),
    metadata,
  };
}

function createRuntimeErrorResponsePayload(error: RuntimeDisplayError) {
  const metadata: Record<string, unknown> = {};

  setInformativeEntry(metadata, "error", error.message);
  setInformativeEntry(metadata, "code", error.code);
  setInformativeEntry(metadata, "details", error.details);
  setInformativeEntry(metadata, "httpStatus", error.status);
  setInformativeEntry(metadata, "status", "error");

  return {
    result: {},
    metadata,
  };
}

function getResponseErrorSummary(
  status: string,
  payload: unknown,
): ResponseErrorSummary | undefined {
  if (status !== "error" || !payload) {
    return undefined;
  }

  const responsePayload = isJsonObject(payload) ? payload.response : undefined;
  const resultPayload = isJsonObject(payload) ? payload.result : undefined;
  const detail =
    getToolResultText(resultPayload) ??
    getFirstContentText(responsePayload) ??
    getFirstContentText(payload) ??
    getNestedString(payload, ["metadata", "error"]) ??
    getNestedString(payload, ["response", "error"]) ??
    getNestedString(payload, ["error"]);

  return {
    detail,
    title: detail ?? "Tool call failed",
  };
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the textarea path when browser permissions block Clipboard API.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getToolParameterCounts(tool: ToolDefinition | undefined): ToolParameterCounts {
  const properties = isJsonObject(tool?.inputSchema?.properties)
    ? tool.inputSchema.properties
    : {};
  const required = isStringArray(tool?.inputSchema?.required)
    ? tool.inputSchema.required
    : [];

  return {
    parameterCount: Object.keys(properties).length,
    requiredCount: required.length,
  };
}

function formatToolParameterSummary(counts: ToolParameterCounts) {
  const parameterLabel =
    counts.parameterCount === 1 ? "1 parameter" : `${counts.parameterCount} parameters`;
  const requiredLabel =
    counts.requiredCount === 1 ? "1 required" : `${counts.requiredCount} required`;

  return counts.parameterCount > 0 ? `${parameterLabel} - ${requiredLabel}` : "No parameters";
}

function getToolParameterSummary(tool: ToolDefinition | undefined) {
  return formatToolParameterSummary(getToolParameterCounts(tool));
}

function getToolCategory(tool: ToolDefinition): ToolCategory {
  const name = tool.name.toLowerCase();
  const description = tool.description?.toLowerCase() ?? "";
  const haystack = `${name} ${description}`;

  if (
    name.includes("read") ||
    haystack.includes("read a file") ||
    haystack.includes("read file") ||
    haystack.includes("media file")
  ) {
    return toolCategories.reading;
  }

  if (
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("update") ||
    name.includes("delete") ||
    haystack.includes("write") ||
    haystack.includes("edit")
  ) {
    return toolCategories.writing;
  }

  if (
    name.includes("directory") ||
    name.includes("tree") ||
    name.includes("move_file") ||
    haystack.includes("directory") ||
    haystack.includes("folder")
  ) {
    return toolCategories.directory;
  }

  if (
    name.includes("search") ||
    name.includes("info") ||
    name.includes("metadata") ||
    name.includes("allowed") ||
    haystack.includes("search") ||
    haystack.includes("metadata")
  ) {
    return toolCategories.search;
  }

  return toolCategories.other;
}

function getShortDescription(description: string | undefined) {
  if (!description) {
    return undefined;
  }

  const trimmedDescription = description.trim().replace(/\s+/g, " ");

  if (trimmedDescription.length <= 150) {
    return trimmedDescription;
  }

  return `${trimmedDescription.slice(0, 147).trimEnd()}...`;
}

function groupCapabilityItems(items: CapabilityListItem[]) {
  const groups = new Map<string, { category: ToolCategory; items: CapabilityListItem[] }>();

  for (const item of items) {
    const category = item.category ?? toolCategories.other;
    const group = groups.get(category.id) ?? { category, items: [] };

    group.items.push(item);
    groups.set(category.id, group);
  }

  return Array.from(groups.values()).filter((group) => group.items.length > 0);
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

function JsonTreeViewer({ expandedPaths, onToggle, value }: Omit<JsonTreeNodeProps, "path">) {
  return (
    <div className="json-tree" role="tree">
      <JsonTreeNode
        expandedPaths={expandedPaths}
        onToggle={onToggle}
        path="$"
        value={value}
      />
    </div>
  );
}

function ResponseJsonTreeViewer({
  expandedPaths,
  onToggle,
  value,
}: Omit<JsonTreeNodeProps, "path">) {
  if (!isJsonObject(value) || (!("result" in value) && !("metadata" in value))) {
    return (
      <JsonTreeViewer
        expandedPaths={expandedPaths}
        onToggle={onToggle}
        value={value}
      />
    );
  }

  return (
    <div className="json-tree result-first-tree" role="tree">
      <JsonTreeNode
        expandedPaths={expandedPaths}
        name="Result"
        onToggle={onToggle}
        path="$.result"
        value={value.result}
      />
      <JsonTreeNode
        expandedPaths={expandedPaths}
        name="Metadata"
        onToggle={onToggle}
        path="$.metadata"
        value={value.metadata}
      />
    </div>
  );
}

function JsonTreeNode({
  expandedPaths,
  name,
  onToggle,
  path,
  value,
}: JsonTreeNodeProps) {
  const isContainer = isJsonContainer(value);
  const isExpanded = expandedPaths.has(path);
  const entries = isExpanded ? getJsonEntries(value) : [];
  const visibleEntries = entries.slice(0, jsonTreeMaxChildrenPerNode);
  const hiddenEntryCount = Math.max(0, entries.length - visibleEntries.length);
  const valueType = Array.isArray(value) ? "array" : isJsonObject(value) ? "object" : "value";

  if (!isContainer) {
    return (
      <div className="json-tree-row leaf" role="treeitem">
        <span className="json-tree-spacer" />
        {name ? <span className="json-key">{name}</span> : null}
        {name ? <span className="json-separator">:</span> : null}
        <span className={`json-value ${getJsonPrimitiveClass(value)}`}>
          {formatJsonPrimitive(value)}
        </span>
      </div>
    );
  }

  return (
    <div className="json-tree-node" role="treeitem" aria-expanded={isExpanded}>
      <button
        className="json-tree-row"
        onClick={() => onToggle(path)}
        type="button"
      >
        {isExpanded ? (
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
        ) : (
          <ChevronRight aria-hidden="true" size={14} strokeWidth={2.2} />
        )}
        {name ? <span className="json-key">{name}</span> : null}
        {name ? <span className="json-separator">:</span> : null}
        <span className={`json-node-summary ${valueType}`}>
          {getJsonContainerSummary(value)}
        </span>
      </button>
      {isExpanded ? (
        <div className="json-tree-children" role="group">
          {entries.length > 0 ? (
            <>
              {visibleEntries.map(([key, childValue]) => (
                <JsonTreeNode
                  expandedPaths={expandedPaths}
                  key={getJsonPath(path, key, value)}
                  name={key}
                  onToggle={onToggle}
                  path={getJsonPath(path, key, value)}
                  value={childValue}
                />
              ))}
              {hiddenEntryCount > 0 ? (
                <div className="json-tree-row leaf truncated">
                  <span className="json-tree-spacer" />
                  <span className="json-value json-value-null">
                    {hiddenEntryCount} more entries hidden
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="json-tree-row leaf empty">
              <span className="json-tree-spacer" />
              <span className="json-value json-value-null">empty</span>
            </div>
          )}
        </div>
      ) : null}
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
    capabilityError: null,
    connections: connectionProfiles,
    error: null,
    health: null,
    isLoading: true,
    savedRequests: [],
    source: "mock",
    theme: null,
    traces: traceEntries,
  });
  const [collapsedSidebarSections, setCollapsedSidebarSections] =
    useState<SidebarSectionState>(() => readSidebarSectionState());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    readSidebarCollapsed(),
  );
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
  const [requestCopyStatus, setRequestCopyStatus] = useState<string | null>(null);
  const [isToolInputFocused, setIsToolInputFocused] = useState(false);
  const [toolExecution, setToolExecution] = useState<ExecuteToolCallResponse | null>(
    null,
  );
  const [toolExecutionError, setToolExecutionError] = useState<RuntimeDisplayError | null>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [isAuthorizingConnection, setIsAuthorizingConnection] = useState(false);
  const [oauthAuthorizationStatus, setOauthAuthorizationStatus] = useState<string | null>(
    null,
  );
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
  const [editingSavedRequestId, setEditingSavedRequestId] = useState<string | null>(null);
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
  const [responsePanelHeight, setResponsePanelHeight] = useState(() =>
    readResponsePanelHeight(),
  );
  const [isRequestCollapsed, setIsRequestCollapsed] = useState(() =>
    readPanelCollapsed(requestPanelCollapsedStorageKey),
  );
  const [isResponseCollapsed, setIsResponseCollapsed] = useState(() =>
    readPanelCollapsed(responsePanelCollapsedStorageKey),
  );
  const [expandedResponsePaths, setExpandedResponsePaths] = useState<Set<string>>(
    () => new Set(["$"]),
  );
  const [responseCopyStatus, setResponseCopyStatus] = useState<string | null>(null);
  const traceFileInputRef = useRef<HTMLInputElement | null>(null);
  const toolActionMenuRef = useRef<HTMLDivElement | null>(null);
  const requestResponseFlowRef = useRef<HTMLDivElement | null>(null);
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
  const editingConnection = useMemo(
    () =>
      editingConnectionId
        ? connections.find((connection) => connection.id === editingConnectionId) ?? null
        : null,
    [connections, editingConnectionId],
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
  const canAuthorizeSelectedConnection =
    runtimeData.source === "runtime" &&
    runtimeData.capabilityError?.code === "authentication_required" &&
    selectedConnection?.transport === "http";
  const selectedTool =
    runtimeData.capabilities.tools.find(
      (tool) => tool.name === selectedCapabilityKeys.tools,
    ) ?? runtimeData.capabilities.tools[0];
  const selectedToolIsDeprecated = isDeprecatedTool(selectedTool);
  const selectedToolReplacement = getDeprecatedToolReplacement(
    selectedTool,
    runtimeData.capabilities.tools,
  );
  const selectedToolParameterCounts = getToolParameterCounts(selectedTool);
  const selectedToolShortDescription = getShortDescription(selectedTool?.description);
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
  const canDeleteEditingConnection =
    runtimeData.source === "runtime" &&
    Boolean(editingConnection) &&
    !editingConnection?.isBuiltIn &&
    !editingConnection?.id.startsWith("draft-");
  const hasBlockingModal =
    isComposerOpen || Boolean(deleteConnectionCandidate) || Boolean(editingSavedRequestId);
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
      return runtimeData.capabilities.tools.map((tool) => {
        const counts = getToolParameterCounts(tool);

        return {
          category: getToolCategory(tool),
          description: tool.description ?? "No description provided.",
          id: tool.name,
          isDeprecated: isDeprecatedTool(tool),
          meta:
            counts.parameterCount === 1
              ? "1 parameter"
              : `${counts.parameterCount} parameters`,
          requiredCount: counts.requiredCount,
          title: tool.name,
        };
      });
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
  const filteredCapabilityGroups =
    activeCapabilityTab === "tools" ? groupCapabilityItems(filteredCapabilityItems) : [];
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
  const editingSavedRequest = editingSavedRequestId
    ? runtimeData.savedRequests.find((savedRequest) => savedRequest.id === editingSavedRequestId)
    : undefined;
  const editingSavedRequestDraft = editingSavedRequest
    ? savedRequestEdits[editingSavedRequest.id] ?? {
        description: editingSavedRequest.description ?? "",
        name: editingSavedRequest.name,
      }
    : null;
  const canSaveCurrentRequest =
    runtimeData.source === "runtime" &&
    activeCapabilityTab === "tools" &&
    Boolean(selectedTool) &&
    Boolean(selectedConnection);
  const saveRequestActionLabel =
    loadedSavedRequest && hasLoadedSavedRequestChanges ? "Save changes" : "Save request";
  const selectedToolRequiredFields = getSchemaRequiredFields(selectedTool?.inputSchema);
  const requestRequiredSummary =
    selectedToolRequiredFields.length > 0
      ? `Required: ${selectedToolRequiredFields.join(", ")}`
      : "Required: none";
  const requestBodySummary =
    activeCapabilityTab === "tools" ? `Body · JSON · ${requestRequiredSummary}` : "Body · JSON";
  const requestSchemaSummary =
    activeCapabilityTab === "tools" ? `Schema · JSON · ${requestRequiredSummary}` : "Schema · JSON";
  const detailMetadata = [
    activeCapabilityTab === "tools"
      ? `${selectedToolParameterCounts.parameterCount} params`
      : activeCapabilityTab === "resources"
        ? selectedResource?.mimeType ?? "Resource"
        : activeCapabilityTab === "prompts"
          ? `${selectedPrompt?.arguments?.length ?? 0} arguments`
          : selectedSchema?.source ?? "JSON schema",
    activeCapabilityTab === "tools"
      ? `${selectedToolParameterCounts.requiredCount} required`
      : undefined,
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
      : createResultFirstResponsePayload(
          selectedTraceEntry.request,
          selectedTraceEntry.response,
          selectedTraceEntry.trace,
        )
    : null;
  const activeSidebarSection: SidebarSectionId = selectedTraceEntry
    ? "timeline"
    : loadedSavedRequestId
      ? "savedRequests"
      : "connections";
  const responsePayload = toolExecutionError
    ? createRuntimeErrorResponsePayload(toolExecutionError)
    : toolExecution
      ? responseViewMode === "raw"
        ? {
            request: toolExecution.response.rawRequest,
            response: toolExecution.response.rawResponse,
            trace: toolExecution.trace,
          }
        : createResultFirstResponsePayload(
            toolExecution.request,
            toolExecution.response,
            toolExecution.trace,
          )
      : selectedTracePayload;
  const responseStatus =
    toolExecution?.response.status ??
    selectedTraceEntry?.trace.status ??
    (toolExecutionError ? "error" : "idle");
  const responseDurationMs =
    toolExecution?.response.durationMs ??
    selectedTraceEntry?.response?.durationMs ??
    selectedTraceEntry?.trace.durationMs;
  const responsePayloadText = useMemo(
    () => (responsePayload ? formatJson(responsePayload) : ""),
    [responsePayload],
  );
  const responseErrorSummary = getResponseErrorSummary(responseStatus, responsePayload);

  const selectConnectionId = useCallback((connectionId: string | null) => {
    selectedConnectionIdRef.current = connectionId;
    setSelectedConnectionId(connectionId);
  }, []);

  const loadRuntimeData = useCallback(
    async (signal?: AbortSignal) => {
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilityError: null,
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
        let capabilities = createEmptyCapabilitySummary(
          nextSelectedConnectionId ?? "runtime",
        );
        let capabilityError: RuntimeDisplayError | null = null;
        let savedRequests: SavedRequest[] = [];

        if (nextSelectedConnectionId) {
          try {
            capabilities = await localRuntimeClient.getCapabilities(
              nextSelectedConnectionId,
              signal,
            );
          } catch (error) {
            if (signal?.aborted) {
              return;
            }

            capabilityError = getRuntimeDisplayError(error);
          }

          try {
            const savedRequestsResponse = await localRuntimeClient.listSavedRequests(
              nextSelectedConnectionId,
              signal,
            );

            savedRequests = savedRequestsResponse.savedRequests;
            setSavedRequestError(null);
          } catch (error) {
            if (signal?.aborted) {
              return;
            }

            setSavedRequestError(getErrorMessage(error));
          }
        }

        setDraftConnections([]);
        selectConnectionId(nextSelectedConnectionId);
        setRuntimeData({
          capabilities,
          capabilityError,
          connections: nextConnections,
          error: null,
          health,
          isLoading: false,
          savedRequests,
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
          capabilityError: null,
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
    window.localStorage.setItem(
      sidebarSectionStorageKey,
      JSON.stringify(collapsedSidebarSections),
    );
  }, [collapsedSidebarSections]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        sidebarCollapsedStorageKey,
        String(isSidebarCollapsed),
      );
    } catch {
      // Keep sidebar width session-only when local preferences are unavailable.
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(responsePanelHeightStorageKey, String(responsePanelHeight));
    } catch {
      // Keep resize session-only when local preferences are unavailable.
    }
  }, [responsePanelHeight]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        requestPanelCollapsedStorageKey,
        String(isRequestCollapsed),
      );
    } catch {
      // Keep request collapse session-only when local preferences are unavailable.
    }
  }, [isRequestCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        responsePanelCollapsedStorageKey,
        String(isResponseCollapsed),
      );
    } catch {
      // Keep response collapse session-only when local preferences are unavailable.
    }
  }, [isResponseCollapsed]);

  useEffect(() => {
    if (!responsePayload || responseViewMode !== "formatted") {
      setExpandedResponsePaths(new Set(["$"]));
      return;
    }

    setExpandedResponsePaths(collectDefaultResponsePaths(responsePayload));
  }, [responsePayloadText, responseViewMode]);

  useEffect(() => {
    if (!responseCopyStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setResponseCopyStatus(null), 1800);

    return () => window.clearTimeout(timeoutId);
  }, [responseCopyStatus]);

  useEffect(() => {
    if (!requestCopyStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setRequestCopyStatus(null), 1800);

    return () => window.clearTimeout(timeoutId);
  }, [requestCopyStatus]);

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
    if (!isComposerOpen && !deleteConnectionCandidate && !editingSavedRequestId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !isDeletingConnection &&
        !deletingSavedRequestId
      ) {
        closeDeleteModal();
        return;
      }

      if (event.key === "Escape" && isComposerOpen && !isSavingConnection) {
        closeComposer();
        return;
      }

      if (
        event.key === "Escape" &&
        editingSavedRequestId &&
        !updatingSavedRequestId &&
        !deletingSavedRequestId
      ) {
        closeSavedRequestEditModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    deleteConnectionCandidate,
    deletingSavedRequestId,
    editingSavedRequestId,
    isComposerOpen,
    isDeletingConnection,
    isSavingConnection,
    updatingSavedRequestId,
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

  function toggleSidebarSection(sectionId: SidebarSectionId) {
    setCollapsedSidebarSections((sections) => ({
      ...sections,
      [sectionId]: !sections[sectionId],
    }));
  }

  function toggleResponseJsonPath(path: string) {
    setExpandedResponsePaths((paths) => {
      const nextPaths = new Set(paths);

      if (nextPaths.has(path)) {
        nextPaths.delete(path);
      } else {
        nextPaths.add(path);
      }

      return nextPaths;
    });
  }

  function expandFullResponse() {
    if (!responsePayload) {
      return;
    }

    setExpandedResponsePaths(collectExpandedJsonPaths(responsePayload));
  }

  function collapseFullResponse() {
    setExpandedResponsePaths(new Set(["$"]));
  }

  function openSidebarSection(sectionId: SidebarSectionId) {
    setIsSidebarCollapsed(false);
    setCollapsedSidebarSections((currentSections) => ({
      ...currentSections,
      [sectionId]: false,
    }));
  }

  async function handleCopyResponseJson() {
    if (!responsePayloadText) {
      return;
    }

    await copyTextToClipboard(responsePayloadText);
    setResponseCopyStatus("Copied response JSON");
  }

  async function handleCopyResponseError() {
    if (!responseErrorSummary?.detail) {
      return;
    }

    await copyTextToClipboard(responseErrorSummary.detail);
    setResponseCopyStatus("Copied error message");
  }

  function handleResponseResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = responsePanelHeight;
    const flowHeight =
      requestResponseFlowRef.current?.getBoundingClientRect().height ??
      responsePanelMaxHeight + requestEditorMinHeight;
    const maxHeight = clamp(
      flowHeight - requestEditorMinHeight,
      responsePanelMinHeight,
      responsePanelMaxHeight,
    );

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaY = startY - moveEvent.clientY;

      setResponsePanelHeight(
        clamp(startHeight + deltaY, responsePanelMinHeight, maxHeight),
      );
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
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

  function openDeleteEditingConnectionModal() {
    if (!editingConnection || !canDeleteEditingConnection) {
      return;
    }

    closeComposer();
    openDeleteConnectionModal(editingConnection);
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
    setOauthAuthorizationStatus(null);
    setRuntimeData((currentData) => ({
      ...currentData,
      capabilities: createEmptyCapabilitySummary(connectionId),
      capabilityError: null,
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
        capabilityError: null,
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
        capabilityError: getRuntimeDisplayError(error),
        error: null,
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

  async function waitForOAuthCapabilities(connectionId: string) {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await wait(2_000);

      if (selectedConnectionIdRef.current !== connectionId) {
        return;
      }

      try {
        const [capabilities, savedRequestsResponse] = await Promise.all([
          localRuntimeClient.getCapabilities(connectionId),
          localRuntimeClient.listSavedRequests(connectionId),
        ]);

        if (selectedConnectionIdRef.current !== connectionId) {
          return;
        }

        setRuntimeData((currentData) => ({
          ...currentData,
          capabilities,
          capabilityError: null,
          error: null,
          isLoading: false,
          savedRequests: savedRequestsResponse.savedRequests,
        }));
        setSavedRequestError(null);
        setOauthAuthorizationStatus("Authorized");
        return;
      } catch (error) {
        if (
          error instanceof LocalRuntimeError &&
          error.code === "authentication_required"
        ) {
          setOauthAuthorizationStatus("Waiting for browser authorization");
          continue;
        }

        setRuntimeData((currentData) => ({
          ...currentData,
          capabilityError: getRuntimeDisplayError(error),
          isLoading: false,
        }));
        setOauthAuthorizationStatus(null);
        return;
      }
    }

    setOauthAuthorizationStatus("Authorization is still pending");
  }

  async function handleAuthorizeConnection(connection: ConnectionProfile) {
    if (runtimeData.source !== "runtime" || connection.transport !== "http") {
      return;
    }

    const authWindow = window.open("", "_blank");

    setIsAuthorizingConnection(true);
    setOauthAuthorizationStatus("Starting authorization");

    try {
      const authorization = await localRuntimeClient.startOAuthAuthorization(connection.id);

      if (authWindow) {
        authWindow.opener = null;
        authWindow.location.href = authorization.authorizationUrl;
      } else {
        setOauthAuthorizationStatus("Browser blocked the authorization window");
        return;
      }

      setOauthAuthorizationStatus("Waiting for browser authorization");
      await waitForOAuthCapabilities(connection.id);
    } catch (error) {
      authWindow?.close();
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilityError: getRuntimeDisplayError(error),
        isLoading: false,
      }));
      setOauthAuthorizationStatus(null);
    } finally {
      setIsAuthorizingConnection(false);
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
            capabilityError: null,
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
        capabilityError: null,
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
          capabilityError: null,
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
      capabilityError: null,
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
    setOauthAuthorizationStatus(null);

    if (connectionId.startsWith("draft-")) {
      setRuntimeData((currentData) => ({
        ...currentData,
        capabilities: createEmptyCapabilitySummary(connectionId),
        capabilityError: null,
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
        capabilityError: null,
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

  function validateToolInputDraft(draft: string) {
    let input: unknown;

    try {
      input = JSON.parse(draft);
    } catch {
      return {
        error: "Request input must be valid JSON.",
        input: undefined,
      };
    }

    if (!isJsonObject(input)) {
      return {
        error: "Request input must be a JSON object.",
        input: undefined,
      };
    }

    return {
      error: null,
      input,
    };
  }

  function readToolInputDraft() {
    const result = validateToolInputDraft(toolInputDraft);

    setToolInputError(result.error);

    return result.input;
  }

  function handleToolInputDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextDraft = event.target.value;

    setToolInputDraft(nextDraft);
    setRequestCopyStatus(null);

    if (toolInputError) {
      setToolInputError(validateToolInputDraft(nextDraft).error);
    }

    if (loadedSavedRequestId) {
      setHasLoadedSavedRequestChanges(true);
    }
  }

  function handleToolInputBlur() {
    setIsToolInputFocused(false);
    setToolInputError(validateToolInputDraft(toolInputDraft).error);
  }

  function handleGenerateExampleInput(options: { showRequestBody?: boolean } = {}) {
    setToolInputDraft(formatJson(createToolInputExample(selectedTool)));
    setToolInputError(null);
    setRequestCopyStatus(null);

    if (options.showRequestBody) {
      setActiveEditorTab("request");
    }

    if (loadedSavedRequestId) {
      setHasLoadedSavedRequestChanges(true);
    }
  }

  async function handleCopyToolInput() {
    await copyTextToClipboard(toolInputDraft);
    setRequestCopyStatus("Copied request JSON");
  }

  function handleFormatToolInput() {
    let parsedInput: unknown;

    try {
      parsedInput = JSON.parse(toolInputDraft);
    } catch {
      setToolInputError("Request input must be valid JSON before formatting.");
      return;
    }

    setToolInputDraft(formatJson(parsedInput));
    setToolInputError(null);
    setRequestCopyStatus(null);

    if (loadedSavedRequestId) {
      setHasLoadedSavedRequestChanges(true);
    }
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

  function openSavedRequestEditModal(savedRequest: SavedRequest) {
    setEditingSavedRequestId(savedRequest.id);
    setSavedRequestEdits((edits) => ({
      ...edits,
      [savedRequest.id]: {
        description: edits[savedRequest.id]?.description ?? savedRequest.description ?? "",
        name: edits[savedRequest.id]?.name ?? savedRequest.name,
      },
    }));
    setSavedRequestError(null);
  }

  function closeSavedRequestEditModal() {
    if (updatingSavedRequestId || deletingSavedRequestId) {
      return;
    }

    setEditingSavedRequestId(null);
    setSavedRequestError(null);
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
      setEditingSavedRequestId(null);
    } catch (error) {
      setSavedRequestError(getErrorMessage(error));
    } finally {
      setUpdatingSavedRequestId(null);
    }
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
      setEditingSavedRequestId(null);
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
        aria-hidden={hasBlockingModal ? true : undefined}
        className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}
        inert={hasBlockingModal ? true : undefined}
      >
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        {!isSidebarCollapsed ? (
          <button
            aria-label="Collapse sidebar"
            className="sidebar-collapse-button"
            onClick={() => setIsSidebarCollapsed(true)}
            title="Collapse sidebar"
            type="button"
          >
            <PanelLeftClose aria-hidden="true" size={17} strokeWidth={2.2} />
          </button>
        ) : null}
        <div className="sidebar-scroll">
        <div className="brand">
          {isSidebarCollapsed ? (
            <button
              aria-label="Expand sidebar"
              className="brand-mark brand-expand-button"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand sidebar"
              type="button"
            >
              dr-w
            </button>
          ) : (
            <span className="brand-mark">dr-w</span>
          )}
          {!isSidebarCollapsed ? (
            <div className="brand-copy">
              <h1>MCP Inspector</h1>
              <p>Local runtime - v0.1</p>
            </div>
          ) : null}
        </div>

        {isSidebarCollapsed ? (
          <nav className="sidebar-rail-nav" aria-label="Sidebar sections">
            <button
              aria-label={`Connections, ${connections.length}`}
              className={`sidebar-rail-button ${
                activeSidebarSection === "connections" ? "active" : ""
              }`}
              onClick={() => openSidebarSection("connections")}
              title="Connections"
              type="button"
            >
              <Server aria-hidden="true" size={19} strokeWidth={2.2} />
              <span>{connections.length}</span>
            </button>
            <button
              aria-label={`Saved Requests, ${runtimeData.savedRequests.length}`}
              className={`sidebar-rail-button ${
                activeSidebarSection === "savedRequests" ? "active" : ""
              }`}
              onClick={() => openSidebarSection("savedRequests")}
              title="Saved Requests"
              type="button"
            >
              <Save aria-hidden="true" size={19} strokeWidth={2.2} />
              <span>{runtimeData.savedRequests.length}</span>
            </button>
            <button
              aria-label={`Timeline, ${runtimeData.traces.length}`}
              className={`sidebar-rail-button ${
                activeSidebarSection === "timeline" ? "active" : ""
              }`}
              onClick={() => openSidebarSection("timeline")}
              title="Timeline"
              type="button"
            >
              <History aria-hidden="true" size={19} strokeWidth={2.2} />
              <span>{runtimeData.traces.length}</span>
            </button>
          </nav>
        ) : (
          <>
        <section className={`runtime-status ${runtimeTone}`} aria-live="polite">
          <div className="runtime-status-line">
            <span className={`status-dot ${runtimeTone}`} />
            <strong>
              {runtimeTone === "checking"
                ? "Checking runtime"
                : runtimeTone === "online"
                  ? "Runtime online"
                  : "Fallback dev data"}
            </strong>
          </div>
          <small>
            {runtimeTone === "checking"
              ? runtimeBaseUrl
              : runtimeTone === "online"
                ? runtimeBaseUrl.replace(/^https?:\/\//, "")
                : runtimeData.error ?? "Local runtime unavailable"}
          </small>
          {themeStatus ? (
            <small className="theme-status">
              {runtimeData.theme?.activeTheme.name ?? themeStatus.replace(/^Theme:\s*/, "")}
            </small>
          ) : null}
          {runtimeData.health ? (
            <small className="runtime-mode-status">
              {runtimeData.health.runtimeMode === "docker" ? "Docker runtime" : "Host runtime"}
            </small>
          ) : null}
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
            <button
              aria-expanded={!collapsedSidebarSections.connections}
              className="section-toggle"
              onClick={() => toggleSidebarSection("connections")}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
              <h2>Connections</h2>
              <small>{connections.length}</small>
            </button>
            <button
              aria-label="Create connection"
              className="ghost-button"
              onClick={openNewConnectionComposer}
              title="Create connection"
              type="button"
            >
              <Plus aria-hidden="true" size={15} strokeWidth={2.3} />
            </button>
          </div>

          {!collapsedSidebarSections.connections ? (
            <>
              <div className="connection-list">
                {connections.map((connection) => (
                  <div
                    className={`connection-item ${
                      connection.id === selectedConnection?.id ? "active" : ""
                    }`}
                    key={connection.id}
                  >
                    <button
                      className="connection-select-button"
                      onClick={() => void handleSelectConnection(connection.id)}
                      type="button"
                    >
                      <span className="status-dot online" />
                      <span className="connection-name">{connection.name}</span>
                    </button>
                    <span className="connection-transport">{connection.transport}</span>
                    <button
                      aria-label={`Edit ${connection.name}`}
                      className="connection-edit-button"
                      onClick={() => openEditConnectionComposer(connection)}
                      title={`Edit ${connection.name}`}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
              </div>
              {connectionActionError ? (
                <small className="inline-error connection-action-error">
                  {connectionActionError}
                </small>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="sidebar-section saved-requests-section">
          <div className="section-header">
            <button
              aria-expanded={!collapsedSidebarSections.savedRequests}
              className="section-toggle"
              onClick={() => toggleSidebarSection("savedRequests")}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
              <h2>Saved Requests</h2>
              <small>{runtimeData.savedRequests.length}</small>
            </button>
          </div>
          {!collapsedSidebarSections.savedRequests ? (
            <>
              {savedRequestError && !editingSavedRequest ? (
                <small className="inline-error saved-request-sidebar-error">
                  {savedRequestError}
                </small>
              ) : null}
              <div className="saved-request-sidebar-list">
                {savedRequestGroups.length > 0 ? (
                  savedRequestGroups.map((group) => (
                    <div className="saved-request-tool-group" key={group.toolName}>
                      <div className="saved-request-group-header">
                        <ChevronDown aria-hidden="true" size={12} strokeWidth={2.2} />
                        <span>{group.toolName}</span>
                        <small>{group.requests.length}</small>
                      </div>
                      {group.requests.map((savedRequest) => {
                        const isLoaded = loadedSavedRequestId === savedRequest.id;

                        return (
                          <article
                            className={`saved-request-nav-item ${isLoaded ? "loaded" : ""}`}
                            key={savedRequest.id}
                          >
                            <div className="saved-request-nav-row">
                              <button
                                className="saved-request-nav-main"
                                onClick={() => handleLoadSavedRequest(savedRequest)}
                                title={savedRequest.description ?? savedRequest.id}
                                type="button"
                              >
                                <span>
                                  {savedRequest.name}
                                  {isLoaded && hasLoadedSavedRequestChanges ? (
                                    <span
                                      className="dirty-indicator"
                                      aria-label="Unsaved changes"
                                    />
                                  ) : null}
                                </span>
                              </button>
                              <div className="saved-request-inline-actions">
                                <button
                                  aria-label={`Execute ${savedRequest.name}`}
                                  className="saved-request-icon-button"
                                  disabled={executingSavedRequestId === savedRequest.id}
                                  onClick={() =>
                                    void handleExecuteSavedRequest(savedRequest)
                                  }
                                  title="Execute"
                                  type="button"
                                >
                                  <Play aria-hidden="true" size={14} strokeWidth={2.2} />
                                </button>
                                <button
                                  aria-label={`Edit ${savedRequest.name}`}
                                  className="saved-request-icon-button"
                                  onClick={() => openSavedRequestEditModal(savedRequest)}
                                  title="Edit"
                                  type="button"
                                >
                                  <Pencil aria-hidden="true" size={14} strokeWidth={2.2} />
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="empty-state compact">
                    No saved requests for this connection.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

        <section className="sidebar-section timeline-section">
          <div className="section-header">
            <button
              aria-expanded={!collapsedSidebarSections.timeline}
              className="section-toggle"
              onClick={() => toggleSidebarSection("timeline")}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
              <h2>Timeline</h2>
              <small>{runtimeData.traces.length}</small>
            </button>
            {!collapsedSidebarSections.timeline ? (
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
            ) : null}
          </div>
          {!collapsedSidebarSections.timeline ? (
            <>
              {traceTransferError ? (
                <small className="inline-error trace-error">{traceTransferError}</small>
              ) : null}
              <div className="timeline">
                {runtimeData.traces.length > 0 ? (
                  runtimeData.traces.map((entry, index) => (
                    <button
                      className={`timeline-item ${
                        entry.id === selectedTraceEntry?.trace.id ? "selected" : ""
                      } ${index > 2 ? "older" : ""}`}
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
            </>
          ) : null}
        </section>

          </>
        )}
        </div>
        {!isSidebarCollapsed ? (
          <div className="sidebar-footer">Local-first - no cloud</div>
        ) : null}
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
            {runtimeData.capabilityError && runtimeData.source === "runtime" ? (
              <span className="warning-pill">Connection error</span>
            ) : null}
            <button
              className="connect-button"
              disabled={runtimeData.isLoading}
              onClick={() => void loadRuntimeData()}
              aria-label={
                runtimeData.isLoading
                  ? "Connecting"
                  : runtimeData.source === "runtime"
                    ? "Reconnect"
                    : "Connect"
              }
              title={
                runtimeData.isLoading
                  ? "Connecting"
                  : runtimeData.source === "runtime"
                    ? "Reconnect"
                    : "Connect"
              }
              type="button"
            >
              <RefreshCw aria-hidden="true" size={17} strokeWidth={2.2} />
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
              {runtimeData.capabilityError ? (
                <section className="capability-error-panel" role="alert">
                  <div className="capability-error-heading">
                    <TriangleAlert aria-hidden="true" size={18} strokeWidth={2.2} />
                    <div>
                      <strong>Capability discovery failed</strong>
                      <small>
                        {runtimeData.capabilityError.code ?? "connection_error"}
                        {runtimeData.capabilityError.status
                          ? ` - HTTP ${runtimeData.capabilityError.status}`
                          : ""}
                      </small>
                    </div>
                  </div>
                  <p>{runtimeData.capabilityError.message}</p>
                  {runtimeData.capabilityError.details?.length ? (
                    <ul>
                      {runtimeData.capabilityError.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                  {canAuthorizeSelectedConnection && selectedConnection ? (
                    <div className="capability-error-actions">
                      <button
                        className="primary"
                        disabled={isAuthorizingConnection}
                        onClick={() => void handleAuthorizeConnection(selectedConnection)}
                        type="button"
                      >
                        {isAuthorizingConnection ? "Waiting" : "Authorize"}
                      </button>
                      {oauthAuthorizationStatus ? (
                        <small>{oauthAuthorizationStatus}</small>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : filteredCapabilityItems.length > 0 ? (
                activeCapabilityTab === "tools" ? (
                  filteredCapabilityGroups.map((group) => (
                    <div className="capability-group" key={group.category.id}>
                      <div className="capability-group-header">
                        <span>{group.category.label}</span>
                        <small>{group.items.length}</small>
                      </div>
                      {group.items.map((item) => (
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
                              {item.requiredCount && item.requiredCount > 0 ? (
                                <small className="required-count">
                                  {item.requiredCount} required
                                </small>
                              ) : null}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
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
                )
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
                  {activeCapabilityTab === "tools" && selectedToolShortDescription ? (
                    <p className="detail-short-description">
                      {selectedToolShortDescription}
                    </p>
                  ) : null}
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
              <div
                className={`request-response-flow ${
                  isRequestCollapsed ? "request-collapsed" : ""
                } ${isResponseCollapsed ? "response-collapsed" : ""}`}
                ref={requestResponseFlowRef}
                style={
                  {
                    "--response-panel-height": `${responsePanelHeight}px`,
                  } as CSSProperties
                }
              >
                <section
                  className={`editor-tabs-panel ${
                    isRequestCollapsed ? "collapsed" : ""
                  }`}
                >
                  <div className="request-section-header">
                    <div>
                      <h3>Request</h3>
                      <div className="request-summary-line">
                        <small>
                          {activeEditorTab === "request"
                            ? requestBodySummary
                            : requestSchemaSummary}
                        </small>
                      </div>
                    </div>
                    <div className="request-header-actions">
                      {!isRequestCollapsed ? (
                        <div
                          className="editor-tab-list"
                          role="tablist"
                          aria-label="Tool editor"
                        >
                          <button
                            aria-controls="editor-tab-schema"
                            aria-selected={activeEditorTab === "schema"}
                            className={activeEditorTab === "schema" ? "selected" : ""}
                            id="editor-tab-schema-button"
                            onClick={() => setActiveEditorTab("schema")}
                            role="tab"
                            type="button"
                          >
                            {activeCapabilityTab === "tools" ? "Schema" : "Definition"}
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
                            Body
                          </button>
                        </div>
                      ) : null}
                      <button
                        aria-label={isRequestCollapsed ? "Expand request" : "Collapse request"}
                        className="secondary-button icon-only-button"
                        onClick={() => setIsRequestCollapsed((collapsed) => !collapsed)}
                        title={isRequestCollapsed ? "Expand request" : "Collapse request"}
                        type="button"
                      >
                        {isRequestCollapsed ? (
                          <PanelBottomOpen aria-hidden="true" size={17} strokeWidth={2.2} />
                        ) : (
                          <PanelBottomClose aria-hidden="true" size={17} strokeWidth={2.2} />
                        )}
                      </button>
                    </div>
                  </div>

                  {!isRequestCollapsed && activeEditorTab === "schema" ? (
                    <div
                      aria-labelledby="editor-tab-schema-button"
                      className="editor-tab-panel code-tab-panel"
                      id="editor-tab-schema"
                      role="tabpanel"
                    >
                      {activeCapabilityTab === "tools" && selectedTool ? (
                        <button
                          className="code-panel-corner-action"
                          onClick={() => handleGenerateExampleInput({ showRequestBody: true })}
                          type="button"
                        >
                          Generate example
                        </button>
                      ) : null}
                      <pre>{formatJson(detailPayload)}</pre>
                    </div>
                  ) : !isRequestCollapsed ? (
                    <div
                      aria-labelledby="editor-tab-request-button"
                      className="editor-tab-panel request-editor-panel"
                      id="editor-tab-request"
                      role="tabpanel"
                    >
                      {activeCapabilityTab === "tools" && selectedTool ? (
                        <div className="json-editor">
                          <div className="json-editor-toolbar">
                            <div>
                              <strong>Tool input JSON</strong>
                              <small>{requestRequiredSummary}</small>
                            </div>
                            <div className="json-editor-actions">
                              {requestCopyStatus ? (
                                <small aria-live="polite" className="copy-status" role="status">
                                  {requestCopyStatus}
                                </small>
                              ) : null}
                              <button onClick={() => handleGenerateExampleInput()} type="button">
                                Generate example
                              </button>
                              <button onClick={handleFormatToolInput} type="button">
                                Format JSON
                              </button>
                              <button
                                aria-label="Copy tool input JSON"
                                onClick={() => void handleCopyToolInput()}
                                type="button"
                              >
                                <Copy aria-hidden="true" size={14} strokeWidth={2.2} />
                                Copy input
                              </button>
                            </div>
                          </div>
                          <div
                            className={`json-editor-field ${
                              isToolInputFocused ? "focused" : ""
                            }`}
                          >
                            <textarea
                              aria-describedby={
                                toolInputError ? "tool-input-error" : undefined
                              }
                              aria-label="Tool input JSON"
                              onChange={handleToolInputDraftChange}
                              onBlur={handleToolInputBlur}
                              onClick={() => setIsToolInputFocused(true)}
                              onFocus={() => setIsToolInputFocused(true)}
                              onPointerDown={() => setIsToolInputFocused(true)}
                              placeholder="{\n  \n}"
                              spellCheck={false}
                              value={toolInputDraft}
                            />
                          </div>
                          {toolInputError ? (
                            <small className="inline-error" id="tool-input-error">
                              {toolInputError}
                            </small>
                          ) : null}
                        </div>
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
                  ) : null}
                </section>

                <section
                  className={`response-viewer ${
                    isResponseCollapsed ? "collapsed" : ""
                  }`}
                >
                  {!isResponseCollapsed && !isRequestCollapsed ? (
                    <button
                      aria-label="Resize response panel"
                      className="response-resize-handle"
                      onPointerDown={handleResponseResizePointerDown}
                      type="button"
                    />
                  ) : null}
                  <div className="response-header">
                    <div className="response-title-group">
                      <h3>Response</h3>
                      <div className="response-summary-line">
                        <small
                          className={
                            responseStatus === "success"
                              ? "response-status-pill success"
                              : responseStatus === "error"
                                ? "response-status-pill error"
                                : "response-status-pill"
                          }
                        >
                          {responseStatus}
                        </small>
                        {responseDurationMs !== undefined ? (
                          <small className="response-duration">
                            {responseDurationMs}ms
                          </small>
                        ) : null}
                      </div>
                    </div>
                    <div className="response-header-actions">
                      {responseCopyStatus ? (
                        <small className="copy-status">{responseCopyStatus}</small>
                      ) : null}
                      <button
                        className="secondary-button"
                        disabled={!responsePayload}
                        onClick={() => void handleCopyResponseJson()}
                        type="button"
                      >
                        <Copy aria-hidden="true" size={14} strokeWidth={2.2} />
                        Copy JSON
                      </button>
                      {responseErrorSummary?.detail ? (
                        <button
                          className="secondary-button"
                          onClick={() => void handleCopyResponseError()}
                          type="button"
                        >
                          <Copy aria-hidden="true" size={14} strokeWidth={2.2} />
                          Copy error
                        </button>
                      ) : null}
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
                      <button
                        aria-label={isResponseCollapsed ? "Expand response" : "Collapse response"}
                        className="secondary-button icon-only-button"
                        onClick={() => setIsResponseCollapsed((collapsed) => !collapsed)}
                        title={isResponseCollapsed ? "Expand response" : "Collapse response"}
                        type="button"
                      >
                        {isResponseCollapsed ? (
                          <PanelBottomOpen aria-hidden="true" size={17} strokeWidth={2.2} />
                        ) : (
                          <PanelBottomClose aria-hidden="true" size={17} strokeWidth={2.2} />
                        )}
                      </button>
                    </div>
                  </div>
                  {!isResponseCollapsed && responsePayload ? (
                    <div className="response-body">
                      {responseErrorSummary ? (
                        <section className="response-error-summary" aria-label="Error summary">
                          {responseErrorSummary.detail ? (
                            <pre>{responseErrorSummary.detail}</pre>
                          ) : (
                            <p>{responseErrorSummary.title}</p>
                          )}
                        </section>
                      ) : null}
                      {responseViewMode === "formatted" ? (
                        <>
                          <div className="response-tree-toolbar">
                            <button onClick={expandFullResponse} type="button">
                              Expand all
                            </button>
                            <button onClick={collapseFullResponse} type="button">
                              Collapse all
                            </button>
                          </div>
                          <ResponseJsonTreeViewer
                            expandedPaths={expandedResponsePaths}
                            onToggle={toggleResponseJsonPath}
                            value={responsePayload}
                          />
                        </>
                      ) : (
                        <pre className="response-output">{responsePayloadText}</pre>
                      )}
                    </div>
                  ) : !isResponseCollapsed ? (
                    <div className="response-empty">
                      Run a tool or select a trace to inspect details here.
                    </div>
                  ) : (
                    null
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      </section>
      </main>

      {isComposerOpen ? (
        <div className="modal-backdrop">
          <form
            aria-labelledby="connection-profile-modal-title"
            aria-modal="true"
            className="connection-profile-modal"
            onSubmit={handleSubmit}
            role="dialog"
          >
            <div className="composer-header">
              <div className="composer-title-group">
                <span className="composer-icon">
                  <Server aria-hidden="true" size={22} strokeWidth={2.1} />
                </span>
                <div>
                  <p className="eyebrow">MCP server</p>
                  <h2 id="connection-profile-modal-title">
                    {editingConnectionId ? "Edit connection" : "New connection"}
                  </h2>
                </div>
              </div>
              {editingConnectionId ? <small>{editingConnectionId}</small> : null}
            </div>

            <label className="field compact">
              <span>Name</span>
              <input
                autoFocus
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
                  aria-label="Add environment variable"
                  onClick={() => setEnvRows((rows) => [...rows, createBlankRow("env")])}
                  title="Add environment variable"
                  type="button"
                >
                  <Plus aria-hidden="true" size={15} strokeWidth={2.3} />
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
                    className="icon-button"
                    onClick={() =>
                      setEnvRows((rows) => removeRow(rows, row.id, "env"))
                    }
                    title="Remove environment variable"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} strokeWidth={2.1} />
                  </button>
                </div>
              ))}
            </div>

            {isRemoteTransport ? (
              <div className="key-value-section compact">
                <div className="key-value-header">
                  <h3>Headers</h3>
                  <button
                    aria-label="Add header"
                    onClick={() =>
                      setHeaderRows((rows) => [...rows, createBlankRow("header")])
                    }
                    title="Add header"
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} strokeWidth={2.3} />
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
                      className="icon-button"
                      onClick={() =>
                        setHeaderRows((rows) => removeRow(rows, row.id, "header"))
                      }
                      title="Remove header"
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={15} strokeWidth={2.1} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {composerError ? <small className="inline-error">{composerError}</small> : null}

            <div className="form-actions connection-modal-actions">
              <div>
                {canDeleteEditingConnection ? (
                  <button
                    className="danger"
                    disabled={isDeletingConnection || isSavingConnection}
                    onClick={openDeleteEditingConnectionModal}
                    type="button"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <div>
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
            </div>
          </form>
        </div>
      ) : null}

      {editingSavedRequest && editingSavedRequestDraft ? (
        <div className="modal-backdrop">
          <form
            aria-labelledby="saved-request-edit-modal-title"
            aria-modal="true"
            className="saved-request-edit-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void handleUpdateSavedRequest(editingSavedRequest);
            }}
            role="dialog"
          >
            <div className="composer-header">
              <div className="composer-title-group">
                <span className="composer-icon">
                  <Pencil aria-hidden="true" size={20} strokeWidth={2.1} />
                </span>
                <div>
                  <p className="eyebrow">Saved request</p>
                  <h2 id="saved-request-edit-modal-title">Edit request</h2>
                </div>
              </div>
              <small>{editingSavedRequest.toolName}</small>
            </div>

            <label className="field compact">
              <span>Name</span>
              <input
                autoFocus
                onChange={(event) =>
                  updateSavedRequestDraft(
                    editingSavedRequest,
                    "name",
                    event.target.value,
                  )
                }
                type="text"
                value={editingSavedRequestDraft.name}
              />
            </label>

            <label className="field compact">
              <span>Description</span>
              <input
                onChange={(event) =>
                  updateSavedRequestDraft(
                    editingSavedRequest,
                    "description",
                    event.target.value,
                  )
                }
                placeholder="Optional"
                type="text"
                value={editingSavedRequestDraft.description}
              />
            </label>

            <div className="saved-request-input-preview">
              <div className="key-value-header">
                <h3>Request body</h3>
              </div>
              <pre>{formatJson(editingSavedRequest.input)}</pre>
            </div>

            {savedRequestError ? (
              <small className="inline-error">{savedRequestError}</small>
            ) : null}

            <div className="form-actions connection-modal-actions">
              <div>
                <button
                  className="danger"
                  disabled={
                    deletingSavedRequestId === editingSavedRequest.id ||
                    updatingSavedRequestId === editingSavedRequest.id
                  }
                  onClick={() => void handleDeleteSavedRequest(editingSavedRequest)}
                  type="button"
                >
                  {deletingSavedRequestId === editingSavedRequest.id
                    ? "Deleting"
                    : "Delete"}
                </button>
              </div>
              <div>
                <button onClick={closeSavedRequestEditModal} type="button">
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={updatingSavedRequestId === editingSavedRequest.id}
                  type="submit"
                >
                  {updatingSavedRequestId === editingSavedRequest.id
                    ? "Saving"
                    : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

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
    </>
  );
}
