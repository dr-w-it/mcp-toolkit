import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionProfile } from "@dr-w/core";

interface PersistedConnectionProfilesFile {
  version: 1;
  source: "mcp-inspector-connection-profiles";
  updatedAt: string;
  profiles: ConnectionProfile[];
}

export interface ConnectionProfileStore {
  readonly storagePath: string;
  load(): Promise<ConnectionProfile[]>;
  save(profiles: ConnectionProfile[]): Promise<void>;
}

const runtimeAppRoot = fileURLToPath(new URL("..", import.meta.url));

export function createConnectionProfileStore(storagePath: string): ConnectionProfileStore {
  const resolvedStoragePath = resolveRuntimePath(
    storagePath,
    ".mcp-inspector/connections.json",
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

      const parsedProfiles = JSON.parse(fileContents) as unknown;

      if (!isPersistedConnectionProfilesFile(parsedProfiles)) {
        throw new Error(
          `Invalid Inspector connection profile file at ${resolvedStoragePath}. Delete the file to reset local persisted connection profiles.`,
        );
      }

      return parsedProfiles.profiles;
    },
    async save(profiles) {
      await mkdir(dirname(resolvedStoragePath), { recursive: true });

      const tempPath = `${resolvedStoragePath}.${process.pid}.tmp`;
      const serializedProfiles = `${JSON.stringify(
        createPersistedConnectionProfilesFile(profiles),
        null,
        2,
      )}\n`;

      await writeFile(tempPath, serializedProfiles, "utf8");
      await rename(tempPath, resolvedStoragePath);
    },
  };
}

function resolveRuntimePath(pathValue: string, defaultPath: string) {
  const path = pathValue.trim() || defaultPath;

  return isAbsolute(path) ? path : resolve(runtimeAppRoot, path);
}

function createPersistedConnectionProfilesFile(
  profiles: ConnectionProfile[],
): PersistedConnectionProfilesFile {
  return {
    profiles: profiles.map(toPersistedConnectionProfile),
    source: "mcp-inspector-connection-profiles",
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function toPersistedConnectionProfile(profile: ConnectionProfile): ConnectionProfile {
  const {
    env: _env,
    headers: _headers,
    isBuiltIn: _isBuiltIn,
    ...persistedProfile
  } = profile;

  return persistedProfile;
}

function isPersistedConnectionProfilesFile(
  value: unknown,
): value is PersistedConnectionProfilesFile {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.source === "mcp-inspector-connection-profiles" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.profiles) &&
    value.profiles.every(isPersistedConnectionProfile)
  );
}

function isPersistedConnectionProfile(value: unknown): value is ConnectionProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.transport === "stdio" || value.transport === "http" || value.transport === "sse") &&
    (value.command === undefined || typeof value.command === "string") &&
    (value.args === undefined || isStringArray(value.args)) &&
    (value.url === undefined || typeof value.url === "string") &&
    value.headers === undefined &&
    value.env === undefined &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
