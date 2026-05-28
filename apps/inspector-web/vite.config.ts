import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readPort(value: string | undefined, fallback: number) {
  const port = Number.parseInt(value ?? "", 10);

  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");

  return {
    envDir: workspaceRoot,
    plugins: [react()],
    server: {
      host: env["INSPECTOR_WEB_HOST"] ?? "127.0.0.1",
      port: readPort(env["INSPECTOR_WEB_PORT"], 5000),
      strictPort: true,
    },
  };
});
