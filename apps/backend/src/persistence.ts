import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { cacheFile } from "./config.js";
import { logger } from "./logger.js";
import { RuntimeSnapshot, createEmptySnapshot } from "@codex-web/shared";

export const loadSnapshot = (): RuntimeSnapshot => {
  try {
    const raw = readFileSync(cacheFile, "utf8");
    const parsed = JSON.parse(raw) as RuntimeSnapshot;
    return parsed;
  } catch {
    return createEmptySnapshot();
  }
};

const DEFAULT_DEBOUNCE_MS = 300;

export class SnapshotPersistence {
  private pendingSnapshot: RuntimeSnapshot | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private inFlightWrite: Promise<void> | null = null;

  schedule(snapshot: RuntimeSnapshot, options?: { immediate?: boolean; debounceMs?: number }): void {
    this.pendingSnapshot = snapshot;
    if (options?.immediate) {
      this.clearTimer();
      void this.flush();
      return;
    }
    const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, debounceMs);
  }

  async flush(): Promise<void> {
    this.clearTimer();
    if (this.inFlightWrite) {
      await this.inFlightWrite;
      if (!this.pendingSnapshot) {
        return;
      }
    }
    const snapshot = this.pendingSnapshot;
    if (!snapshot) {
      return;
    }
    this.pendingSnapshot = null;
    const payload = JSON.stringify(snapshot);
    this.inFlightWrite = writeFile(cacheFile, payload, "utf8")
      .catch((error) => {
        logger.error("failed to persist snapshot", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.inFlightWrite = null;
      });
    await this.inFlightWrite;
    if (this.pendingSnapshot) {
      await this.flush();
    }
  }

  private clearTimer(): void {
    if (!this.flushTimer) {
      return;
    }
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
