import { appendFileSync, existsSync, renameSync, statSync, writeFileSync } from "node:fs";
import { appConfig, backendLogFile } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const rotateIfNeeded = (filePath: string): void => {
  if (!existsSync(filePath)) {
    return;
  }
  const { size } = statSync(filePath);
  if (size < appConfig.maxLogSizeBytes) {
    return;
  }
  const third = `${filePath}.3`;
  const second = `${filePath}.2`;
  const first = `${filePath}.1`;
  if (existsSync(second)) {
    renameSync(second, third);
  }
  if (existsSync(first)) {
    renameSync(first, second);
  }
  renameSync(filePath, first);
  writeFileSync(filePath, "");
};

const writeLine = (filePath: string, line: string): void => {
  rotateIfNeeded(filePath);
  appendFileSync(filePath, `${line}\n`, "utf8");
};

export class Logger {
  constructor(private readonly filePath: string = backendLogFile) {}

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
    writeLine(this.filePath, line);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }
}

export const logger = new Logger();

export const appendRawLog = (filePath: string, line: string): void => {
  writeLine(filePath, line);
};

