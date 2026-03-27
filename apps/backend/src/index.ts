import Fastify from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { ensureRuntimeDirs, appConfig } from "./config.js";
import { logger } from "./logger.js";
import { RuntimeManager } from "./runtime/runtimeManager.js";
import type { RuntimeEvent } from "@codex-web/shared";

const runtime = new RuntimeManager();

const main = async (): Promise<void> => {
  ensureRuntimeDirs();
  const app = Fastify({
    logger: false,
  });

  app.get("/api/health", async () => ({
    ok: true,
  }));

  app.get("/api/runtime", async () => runtime.getSnapshot());

  app.get("/api/threads/:threadId/export", async (request, reply) => {
    const params = request.params as { threadId: string };
    reply.header("content-type", "application/json");
    return runtime.exportThreadEvents(params.threadId);
  });

  app.post("/api/action", async (request) => {
    const body = request.body as { action: string; payload?: Record<string, unknown> };
    return runtime.dispatchAction(body.action, body.payload ?? {});
  });

  const server = await app.listen({
    port: appConfig.port,
    host: appConfig.host,
  });
  const ws = new WebSocketServer({ server: app.server, path: "/ws" });
  runtime.setBroadcaster((events: RuntimeEvent[]) => {
    const payload = JSON.stringify({
      type: "runtime/events",
      events,
    });
    for (const client of ws.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  ws.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "runtime/snapshot",
        snapshot: runtime.getSnapshot(),
      }),
    );
  });

  await runtime.start();
  logger.info("backend started", {
    url: server,
    ws: `ws://${appConfig.host}:${appConfig.port}/ws`,
  });

  let shuttingDown = false;
  const flushOnExit = async (signal?: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await runtime.flushSnapshot();
    } finally {
      await app.close();
      ws.close();
      if (signal) {
        process.exit(0);
      }
    }
  };

  process.once("SIGINT", () => {
    void flushOnExit("SIGINT");
  });
  process.once("SIGTERM", () => {
    void flushOnExit("SIGTERM");
  });
  process.once("beforeExit", () => {
    void flushOnExit();
  });
};

main().catch((error) => {
  logger.error("backend failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
