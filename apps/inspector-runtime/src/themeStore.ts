import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeThemeResponse, ThemeDefinition, ThemeDiagnostic } from "@dr-w/core";

export const defaultTheme: ThemeDefinition = {
  id: "default",
  name: "MCP Toolkit Default",
  tokens: {
    "--color-accent": "#3abff8",
    "--color-accent-border": "rgba(58, 191, 248, 0.48)",
    "--color-accent-contrast": "#051017",
    "--color-accent-soft": "rgba(58, 191, 248, 0.08)",
    "--color-accent-softer": "rgba(58, 191, 248, 0.1)",
    "--color-background": "#0f1115",
    "--color-border": "#2a2f3a",
    "--color-code-background": "#0f1115",
    "--color-code-text": "#dbeafe",
    "--color-danger": "#ef4444",
    "--color-danger-soft": "rgba(239, 68, 68, 0.12)",
    "--color-focus-ring": "rgba(58, 191, 248, 0.14)",
    "--color-panel": "#0f1115",
    "--color-panel-muted": "#11141a",
    "--color-schema-accent": "#8b7cff",
    "--color-selection": "rgba(58, 191, 248, 0.14)",
    "--color-success": "#22c55e",
    "--color-success-soft": "rgba(34, 197, 94, 0.12)",
    "--color-surface": "#171b21",
    "--color-surface-elevated": "#202631",
    "--color-text": "#eef2f7",
    "--color-text-muted": "#9aa4b2",
    "--color-text-secondary": "#c8d1dc",
    "--color-text-strong": "#ffffff",
    "--color-text-subtle": "#5f6b7a",
    "--color-warning": "#f59e0b",
    "--color-warning-border": "rgba(245, 158, 11, 0.55)",
    "--color-warning-border-muted": "rgba(245, 158, 11, 0.42)",
    "--color-warning-soft": "rgba(245, 158, 11, 0.08)",
    "--color-warning-softer": "rgba(245, 158, 11, 0.06)",
  },
};

const requiredTokenNames = Object.keys(defaultTheme.tokens);
const inspectorWebRoot = fileURLToPath(new URL("../../inspector-web", import.meta.url));

export interface ThemeStoreOptions {
  requestedThemeId?: string;
  themesPath?: string;
}

export interface ThemeStore {
  getTheme(): Promise<RuntimeThemeResponse>;
}

export function createThemeStore(options: ThemeStoreOptions = {}): ThemeStore {
  const requestedThemeId = options.requestedThemeId?.trim() || undefined;
  const themesPath = resolveWebPath(options.themesPath, ".mcp-inspector/theme");

  return {
    async getTheme() {
      const diagnostics: ThemeDiagnostic[] = [];
      const customThemes = await loadCustomThemes(themesPath, diagnostics);
      const availableThemes = [defaultTheme, ...customThemes];
      const activeTheme = resolveActiveTheme(availableThemes, requestedThemeId, diagnostics);

      return {
        activeTheme,
        availableThemes,
        diagnostics,
        requestedThemeId,
        themesPath,
      };
    },
  };
}

function resolveWebPath(pathValue: string | undefined, defaultPath: string) {
  const path = pathValue?.trim() || defaultPath;

  return isAbsolute(path) ? path : resolve(inspectorWebRoot, path);
}

async function loadCustomThemes(themesPath: string, diagnostics: ThemeDiagnostic[]) {
  let entries: string[];

  try {
    entries = await readdir(themesPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    diagnostics.push({
      level: "warning",
      message: `Unable to read themes directory at ${themesPath}. Using the default theme.`,
    });
    return [];
  }

  const themes: ThemeDefinition[] = [];
  const seenThemeIds = new Set([defaultTheme.id]);

  for (const entry of entries.filter((item) => item.endsWith(".json")).sort()) {
    const themePath = resolve(themesPath, entry);

    try {
      const parsedTheme = JSON.parse(await readFile(themePath, "utf8")) as unknown;
      const theme = parseThemeDefinition(parsedTheme);

      if (seenThemeIds.has(theme.id)) {
        diagnostics.push({
          level: "warning",
          message: `Theme file ${entry} uses duplicate theme id "${theme.id}" and was ignored.`,
        });
        continue;
      }

      seenThemeIds.add(theme.id);
      themes.push(theme);
    } catch (error) {
      diagnostics.push({
        level: "warning",
        message: `Theme file ${entry} is invalid and was ignored: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`,
      });
    }
  }

  return themes;
}

function resolveActiveTheme(
  availableThemes: ThemeDefinition[],
  requestedThemeId: string | undefined,
  diagnostics: ThemeDiagnostic[],
) {
  if (!requestedThemeId || requestedThemeId === defaultTheme.id) {
    return defaultTheme;
  }

  const selectedTheme = availableThemes.find((theme) => theme.id === requestedThemeId);

  if (selectedTheme) {
    return selectedTheme;
  }

  diagnostics.push({
    level: "warning",
    message: `Theme "${requestedThemeId}" was not found. Using the default theme.`,
  });
  return defaultTheme;
}

function parseThemeDefinition(value: unknown): ThemeDefinition {
  if (!isRecord(value)) {
    throw new Error("theme must be a JSON object");
  }

  if (typeof value.id !== "string" || !isThemeId(value.id)) {
    throw new Error("id must use lowercase letters, numbers, and dashes");
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error("name must be a non-empty string");
  }

  if (!isRecord(value.tokens)) {
    throw new Error("tokens must be an object");
  }

  const tokens = value.tokens;
  const missingTokens = requiredTokenNames.filter((tokenName) => !(tokenName in tokens));
  const invalidTokens = Object.entries(tokens)
    .filter(
      ([tokenName, tokenValue]) =>
        !requiredTokenNames.includes(tokenName) ||
        typeof tokenValue !== "string" ||
        tokenValue.trim().length === 0,
    )
    .map(([tokenName]) => tokenName);

  if (missingTokens.length > 0 || invalidTokens.length > 0) {
    throw new Error(
      [
        missingTokens.length > 0 ? `missing tokens: ${missingTokens.join(", ")}` : undefined,
        invalidTokens.length > 0 ? `invalid tokens: ${invalidTokens.join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join("; "),
    );
  }

  return {
    id: value.id,
    name: value.name.trim(),
    tokens: Object.fromEntries(
      requiredTokenNames.map((tokenName) => [tokenName, tokens[tokenName] as string]),
    ),
  };
}

function isThemeId(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(value) || /^[a-z0-9]$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
