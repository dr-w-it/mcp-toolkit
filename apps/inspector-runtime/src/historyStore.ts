import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  TraceArtifactEntry,
  ToolCallRequest,
  ToolCallResponse,
  TraceEntry,
} from "@dr-w/core";

interface PersistedHistoryFile {
  version: 1;
  source: "mcp-inspector-history";
  updatedAt: string;
  entries: TraceArtifactEntry[];
}

export interface HistoryStore {
  readonly storagePath: string | undefined;
  load(): Promise<TraceArtifactEntry[]>;
  save(entries: TraceArtifactEntry[]): Promise<void>;
}

const runtimeAppRoot = fileURLToPath(new URL("..", import.meta.url));

export function createHistoryStore(storagePath: string | undefined): HistoryStore {
  const normalizedStoragePath = storagePath?.trim();
  const resolvedStoragePath = normalizedStoragePath
    ? resolveRuntimePath(normalizedStoragePath)
    : undefined;

  return {
    storagePath: resolvedStoragePath,
    async load() {
      if (!resolvedStoragePath) {
        return [];
      }

      let fileContents: string;

      try {
        fileContents = await readFile(resolvedStoragePath, "utf8");
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return [];
        }

        throw error;
      }

      const parsedHistory = JSON.parse(fileContents) as unknown;

      if (!isPersistedHistoryFile(parsedHistory)) {
        throw new Error(
          `Invalid Inspector history file at ${resolvedStoragePath}. Delete the file to reset local persisted history.`,
        );
      }

      return parsedHistory.entries;
    },
    async save(entries) {
      if (!resolvedStoragePath) {
        return;
      }

      await mkdir(dirname(resolvedStoragePath), { recursive: true });

      const tempPath = `${resolvedStoragePath}.${process.pid}.tmp`;
      const serializedHistory = `${JSON.stringify(
        createPersistedHistoryFile(entries),
        null,
        2,
      )}\n`;

      await writeFile(tempPath, serializedHistory, "utf8");
      await rename(tempPath, resolvedStoragePath);
    },
  };
}

function resolveRuntimePath(pathValue: string) {
  return isAbsolute(pathValue) ? pathValue : resolve(runtimeAppRoot, pathValue);
}

export function isTraceArtifactEntry(value: unknown): value is TraceArtifactEntry {
  return (
    isRecord(value) &&
    isTraceEntry(value.trace) &&
    (value.request === undefined || isToolCallRequest(value.request)) &&
    (value.response === undefined || isToolCallResponse(value.response))
  );
}

function createPersistedHistoryFile(entries: TraceArtifactEntry[]): PersistedHistoryFile {
  return {
    entries,
    source: "mcp-inspector-history",
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function isPersistedHistoryFile(value: unknown): value is PersistedHistoryFile {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.source === "mcp-inspector-history" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.entries) &&
    value.entries.every(isTraceArtifactEntry)
  );
}

function isTraceEntry(value: unknown): value is TraceEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.operation === "string" &&
    (value.status === "success" || value.status === "error") &&
    typeof value.startedAt === "string" &&
    typeof value.durationMs === "number"
  );
}

function isToolCallRequest(value: unknown): value is ToolCallRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.toolName === "string" &&
    "input" in value &&
    typeof value.createdAt === "string"
  );
}

function isToolCallResponse(value: unknown): value is ToolCallResponse {
  return (
    isRecord(value) &&
    typeof value.requestId === "string" &&
    (value.status === "success" || value.status === "error") &&
    typeof value.durationMs === "number" &&
    typeof value.completedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
