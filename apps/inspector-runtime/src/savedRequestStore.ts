import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SavedRequest } from "@dr-w/core";

interface PersistedSavedRequestsFile {
  version: 1;
  source: "mcp-inspector-saved-requests";
  updatedAt: string;
  requests: SavedRequest[];
}

export interface SavedRequestStore {
  readonly storagePath: string;
  load(): Promise<SavedRequest[]>;
  save(requests: SavedRequest[]): Promise<void>;
}

const runtimeAppRoot = fileURLToPath(new URL("..", import.meta.url));

export function createSavedRequestStore(storagePath: string): SavedRequestStore {
  const resolvedStoragePath = resolveRuntimePath(
    storagePath,
    ".mcp-inspector/saved-requests.json",
  );

  return {
    storagePath: resolvedStoragePath,
    async load() {
      let fileContents: string;

      try {
        fileContents = await readFile(resolvedStoragePath, "utf8");
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return [];
        }

        throw error;
      }

      const parsedRequests = JSON.parse(fileContents) as unknown;

      if (!isPersistedSavedRequestsFile(parsedRequests)) {
        throw new Error(
          `Invalid Inspector saved requests file at ${resolvedStoragePath}. Delete the file to reset local saved requests.`,
        );
      }

      return parsedRequests.requests;
    },
    async save(requests) {
      await mkdir(dirname(resolvedStoragePath), { recursive: true });

      const tempPath = `${resolvedStoragePath}.${process.pid}.tmp`;
      const serializedRequests = `${JSON.stringify(
        createPersistedSavedRequestsFile(requests),
        null,
        2,
      )}\n`;

      await writeFile(tempPath, serializedRequests, "utf8");
      await rename(tempPath, resolvedStoragePath);
    },
  };
}

function resolveRuntimePath(pathValue: string, defaultPath: string) {
  const path = pathValue.trim() || defaultPath;

  return isAbsolute(path) ? path : resolve(runtimeAppRoot, path);
}

function createPersistedSavedRequestsFile(
  requests: SavedRequest[],
): PersistedSavedRequestsFile {
  return {
    requests,
    source: "mcp-inspector-saved-requests",
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function isPersistedSavedRequestsFile(
  value: unknown,
): value is PersistedSavedRequestsFile {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.source === "mcp-inspector-saved-requests" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.requests) &&
    value.requests.every(isSavedRequest)
  );
}

function isSavedRequest(value: unknown): value is SavedRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.name === "string" &&
    typeof value.toolName === "string" &&
    isJsonObject(value.input) &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    isJsonObject(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
