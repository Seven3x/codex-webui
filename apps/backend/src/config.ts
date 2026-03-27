import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, "../../..");
export const generatedSchemaDir = resolve(rootDir, "generated/codex-schema");
export const cacheFile = resolve(rootDir, "data/runtime-cache.json");
export const logsDir = resolve(rootDir, "logs");
export const backendLogFile = resolve(logsDir, "backend.log");
export const appServerStderrLogFile = resolve(logsDir, "app-server.stderr.log");

export const appConfig = {
  port: Number(process.env.PORT ?? "8787"),
  host: process.env.HOST ?? "127.0.0.1",
  requestTimeoutMs: Number(process.env.CODEX_RPC_TIMEOUT_MS ?? "30000"),
  debugProtocol: process.env.CODEX_DEBUG_PROTOCOL === "1",
  saveAppServerStderr: process.env.CODEX_SAVE_APP_SERVER_STDERR !== "0",
  codexHome: process.env.CODEX_HOME ?? resolve(homedir(), ".codex"),
  maxLogSizeBytes: 5 * 1024 * 1024,
};

export const ensureRuntimeDirs = (): void => {
  for (const dir of [resolve(rootDir, "data"), logsDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
};

