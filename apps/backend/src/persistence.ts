import { readFileSync, writeFileSync } from "node:fs";
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

export const saveSnapshot = (snapshot: RuntimeSnapshot): void => {
  try {
    writeFileSync(cacheFile, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (error) {
    logger.error("failed to persist snapshot", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
