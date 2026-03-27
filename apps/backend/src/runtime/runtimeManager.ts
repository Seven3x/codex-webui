import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AppServerRequestMap,
  AppServerRequestMethod,
  AppServerServerRequestMethod,
  CommandExecParams,
  CommandExecResponse,
  CommandExecutionRequestApprovalParams,
  EventKind,
  FileChangeRequestApprovalParams,
  RuntimeEvent,
  RuntimeSnapshot,
} from "@codex-web/shared";
import {
  createEmptySnapshot,
  reduceRuntimeEvents,
} from "@codex-web/shared";
import type { JsonRpcNotificationMessage, JsonRpcRequestMessage, JsonRpcResponseMessage } from "../jsonRpc.js";
import { JsonRpcClient } from "../jsonRpc.js";
import { appConfig, appServerStderrLogFile, generatedSchemaDir, rootDir } from "../config.js";
import { appendRawLog, logger } from "../logger.js";
import { loadSnapshot, saveSnapshot } from "../persistence.js";

const execFileAsync = promisify(execFile);

type Broadcast = (events: RuntimeEvent[]) => void;

const supportedApprovals = new Set<AppServerServerRequestMethod>([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
]);

const extractThreadMeta = (payload: unknown): { threadId?: string; turnId?: string; itemId?: string } => {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const maybe = payload as Record<string, unknown>;
  return {
    threadId: typeof maybe.threadId === "string" ? maybe.threadId : undefined,
    turnId: typeof maybe.turnId === "string" ? maybe.turnId : undefined,
    itemId: typeof maybe.itemId === "string" ? maybe.itemId : undefined,
  };
};

const statusLabel = (status: unknown): string => {
  if (typeof status === "string") {
    return status;
  }
  if (status && typeof status === "object" && "type" in (status as Record<string, unknown>)) {
    return String((status as Record<string, unknown>).type);
  }
  return JSON.stringify(status);
};

export class RuntimeManager {
  private snapshot: RuntimeSnapshot = createEmptySnapshot();
  private rpc: JsonRpcClient | null = null;
  private broadcast: Broadcast = () => {};
  private restartTimer: NodeJS.Timeout | null = null;
  private codexVersion: string | undefined;

  constructor() {
    this.snapshot = loadSnapshot();
  }

  getSnapshot(): RuntimeSnapshot {
    return this.snapshot;
  }

  setBroadcaster(broadcast: Broadcast): void {
    this.broadcast = broadcast;
  }

  async start(): Promise<void> {
    await this.ensureCodexReady();
    await this.spawnRuntime("starting");
  }

  async dispatchAction(action: string, payload: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "thread.list":
        return this.request("thread/list", payload as AppServerRequestMap["thread/list"]["params"]);
      case "thread.read":
        return this.request("thread/read", payload as AppServerRequestMap["thread/read"]["params"], {
          mergeThreadResponse: "loaded",
          selectThreadId: String(payload.threadId ?? ""),
        });
      case "thread.start":
        return this.request("thread/start", payload as AppServerRequestMap["thread/start"]["params"], {
          mergeThreadResponse: "resumed",
          selectThreadIdFromResponse: true,
        });
      case "thread.resume":
        return this.request("thread/resume", payload as AppServerRequestMap["thread/resume"]["params"], {
          mergeThreadResponse: "resumed",
          selectThreadIdFromResponse: true,
        });
      case "thread.fork":
        return this.request("thread/fork", payload as AppServerRequestMap["thread/fork"]["params"], {
          mergeThreadResponse: "resumed",
          selectThreadIdFromResponse: true,
        });
      case "thread.archive":
        return this.request("thread/archive", payload as AppServerRequestMap["thread/archive"]["params"]);
      case "turn.start":
        return this.request("turn/start", payload as AppServerRequestMap["turn/start"]["params"]);
      case "turn.steer":
        return this.request("turn/steer", payload as AppServerRequestMap["turn/steer"]["params"]);
      case "turn.interrupt":
        return this.request("turn/interrupt", payload as AppServerRequestMap["turn/interrupt"]["params"]);
      case "review.start":
        return this.request("review/start", payload as AppServerRequestMap["review/start"]["params"]);
      case "approval.respond":
        return this.respondToApproval(String(payload.requestId), payload.decision);
      case "command.exec.start":
        return this.startTerminal(payload as AppServerRequestMap["command/exec"]["params"]);
      case "command.exec.write":
        return this.request("command/exec/write", payload as AppServerRequestMap["command/exec/write"]["params"]);
      case "command.exec.resize":
        return this.request("command/exec/resize", payload as AppServerRequestMap["command/exec/resize"]["params"]);
      case "command.exec.terminate":
        return this.request("command/exec/terminate", payload as AppServerRequestMap["command/exec/terminate"]["params"]);
      default:
        throw new Error(`unknown action ${action}`);
    }
  }

  exportThreadEvents(threadId: string): unknown {
    return {
      threadId,
      exportedAt: new Date().toISOString(),
      events: this.snapshot.threads[threadId]?.eventTrail ?? [],
    };
  }

  private applyEvents(events: RuntimeEvent[]): void {
    this.snapshot = reduceRuntimeEvents(this.snapshot, events);
    saveSnapshot(this.snapshot);
    this.broadcast(events);
  }

  private async ensureCodexReady(): Promise<void> {
    try {
      await execFileAsync("codex", ["--version"], { cwd: rootDir });
    } catch (error) {
      throw new Error(
        `codex CLI not found or not executable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const { stdout } = await execFileAsync("codex", ["--version"], { cwd: rootDir });
      this.codexVersion = stdout.trim();
    } catch {
      this.codexVersion = undefined;
    }
    try {
      await execFileAsync("codex", ["app-server", "generate-ts", "--experimental", "--out", generatedSchemaDir], {
        cwd: rootDir,
      });
    } catch (error) {
      throw new Error(
        `failed to generate TypeScript protocol bindings into ${generatedSchemaDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async spawnRuntime(connectionState: "starting" | "reconnecting"): Promise<void> {
    this.applyEvents([
      {
        type: "connection/state",
        connectionState,
        timestamp: Date.now(),
        serverInfo: {
          version: this.codexVersion,
          platform: process.platform,
          codexHome: appConfig.codexHome,
        },
      },
    ]);
    this.rpc = new JsonRpcClient({
      cwd: rootDir,
      command: "codex",
      args: ["app-server", "--listen", "stdio://"],
      timeoutMs: appConfig.requestTimeoutMs,
      onStdoutLine: (line) => {
        if (appConfig.debugProtocol) {
          logger.debug("rpc stdout", { line });
        }
      },
      onStderrLine: (line) => {
        if (appConfig.saveAppServerStderr) {
          appendRawLog(appServerStderrLogFile, line);
        }
      },
      onNotification: (message) => this.handleNotification(message),
      onServerRequest: (message) => this.handleServerRequest(message),
      onResponse: (message) => this.handleResponse(message),
      onProcessExit: (code, signal) => this.handleProcessExit(code, signal),
      onParseError: (line, error) => {
        logger.error("failed to parse app-server json line", {
          line,
          error: error instanceof Error ? error.message : String(error),
        });
        this.logProtocol("server->client", "parseError", "parse-error", { line });
      },
    });
    this.rpc.start();
    this.applyEvents([
      {
        type: "connection/state",
        connectionState: "initializing",
        timestamp: Date.now(),
        clientInfo: {
          name: "codex-web",
          title: "Codex Protocol-Faithful Client",
          version: "0.1.0",
        },
      },
    ]);
    const initializeResponse = await this.rpc.initialize({
      clientInfo: {
        name: "codex-web",
        title: "Codex Protocol-Faithful Client",
        version: "0.1.0",
      },
      capabilities: null,
    });
    this.applyEvents([
      {
        type: "connection/state",
        connectionState: "ready",
        timestamp: Date.now(),
        serverInfo: {
          userAgent: initializeResponse.userAgent,
          version: this.codexVersion,
          platform: process.platform,
          codexHome: appConfig.codexHome,
        },
      },
      {
        type: "note",
        message:
          "Current generated schema does not expose thread/shellCommand; the UI marks that capability as unavailable instead of inventing a surrogate method.",
      },
    ]);
    await this.refreshThreadsAfterReconnect();
  }

  private async refreshThreadsAfterReconnect(): Promise<void> {
    await this.request("thread/list", {
      limit: 50,
      archived: false,
      sortKey: "updated_at",
    });
    if (this.snapshot.selectedThreadId) {
      try {
        await this.request("thread/read", {
          threadId: this.snapshot.selectedThreadId,
          includeTurns: true,
        }, {
          mergeThreadResponse: "loaded",
          selectThreadId: this.snapshot.selectedThreadId,
        });
      } catch (error) {
        logger.warn("failed to restore selected thread after reconnect", {
          threadId: this.snapshot.selectedThreadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private logProtocol(
    direction: "client->server" | "server->client",
    kind: EventKind,
    method: string,
    payload: unknown,
    unknown = false,
  ): void {
    const meta = extractThreadMeta(payload);
    this.applyEvents([
      {
        type: "eventLog/append",
        record: {
          seq: this.snapshot.eventLog.length + 1,
          timestamp: Date.now(),
          direction,
          kind,
          method,
          payload,
          threadId: meta.threadId ?? null,
          turnId: meta.turnId ?? null,
          itemId: meta.itemId ?? null,
          unknown,
        },
      },
    ]);
  }

  private async request<M extends AppServerRequestMethod>(
    method: M,
    params: AppServerRequestMap[M]["params"],
    options?: {
      mergeThreadResponse?: "loaded" | "resumed";
      selectThreadId?: string | null;
      selectThreadIdFromResponse?: boolean;
    },
  ): Promise<AppServerRequestMap[M]["result"]> {
    if (!this.rpc) {
      throw new Error("runtime not initialized");
    }
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.applyEvents([{ type: "request/pending", requestId, active: true }]);
    this.logProtocol("client->server", "request", method, params);
    try {
      const result = await this.rpc.request(method, params);
      this.logProtocol("server->client", "response", method, result);
      const events: RuntimeEvent[] = [{ type: "request/pending", requestId, active: false }];
      if (method === "thread/list") {
        for (const thread of (result as AppServerRequestMap["thread/list"]["result"]).data) {
          events.push({ type: "thread/merged", thread, mode: "unloaded" });
        }
      }
      if (method === "thread/archive" && typeof (params as { threadId?: unknown }).threadId === "string") {
        events.push({
          type: "thread/status",
          threadId: String((params as { threadId: string }).threadId),
          status: "archived",
        });
      }
      if (options?.mergeThreadResponse && "thread" in (result as object)) {
        const thread = (result as { thread: AppServerRequestMap["thread/read"]["result"]["thread"] }).thread;
        events.push({ type: "thread/merged", thread, mode: options.mergeThreadResponse });
        if (options.selectThreadIdFromResponse || options.selectThreadId) {
          events.push({ type: "thread/selected", threadId: options.selectThreadId ?? thread.id });
        }
      }
      if (method === "turn/start" && typeof (params as { threadId?: unknown }).threadId === "string") {
        events.push({
          type: "turn/merged",
          threadId: String((params as { threadId: string }).threadId),
          turn: (result as AppServerRequestMap["turn/start"]["result"]).turn,
          kind: "response",
          timestamp: Date.now(),
        });
      }
      this.applyEvents(events);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.applyEvents([
        { type: "request/pending", requestId, active: false },
        { type: "runtime/error", message, timestamp: Date.now() },
      ]);
      if ((error as { code?: number }).code === -32001 || message.includes("Server overloaded")) {
        this.applyEvents([
          {
            type: "note",
            message: "Server overloaded (-32001). Retry later; request state preserved in event log.",
          },
        ]);
      }
      throw error;
    }
  }

  private handleNotification(message: JsonRpcNotificationMessage): void {
    this.logProtocol("server->client", "notification", message.method, message.params);
    const timestamp = Date.now();
    switch (message.method) {
      case "thread/started":
        this.applyEvents([
          {
            type: "thread/merged",
            thread: (message.params as { thread: AppServerRequestMap["thread/start"]["result"]["thread"] }).thread,
            mode: "unloaded",
          },
        ]);
        return;
      case "thread/archived":
        this.applyEvents([
          {
            type: "thread/status",
            threadId: String((message.params as { threadId: string }).threadId),
            status: "archived",
          },
        ]);
        return;
      case "thread/status/changed":
        this.applyEvents([
          {
            type: "thread/status",
            threadId: String((message.params as { threadId: string }).threadId),
            status: statusLabel((message.params as { status: unknown }).status),
          },
        ]);
        return;
      case "turn/started":
        this.applyEvents([
          {
            type: "turn/merged",
            threadId: String((message.params as { threadId: string }).threadId),
            turn: (message.params as { turn: AppServerRequestMap["turn/start"]["result"]["turn"] }).turn,
            kind: "started",
            timestamp,
          },
        ]);
        return;
      case "turn/completed":
        this.applyEvents([
          {
            type: "turn/merged",
            threadId: String((message.params as { threadId: string }).threadId),
            turn: (message.params as { turn: AppServerRequestMap["turn/start"]["result"]["turn"] }).turn,
            kind: "completed",
            timestamp,
          },
        ]);
        return;
      case "item/started":
        this.applyEvents([
          {
            type: "item/started",
            threadId: String((message.params as { threadId: string }).threadId),
            turnId: String((message.params as { turnId: string }).turnId),
            item: (message.params as { item: Record<string, unknown> }).item,
            timestamp,
          },
        ]);
        return;
      case "item/completed":
        this.applyEvents([
          {
            type: "item/completed",
            threadId: String((message.params as { threadId: string }).threadId),
            turnId: String((message.params as { turnId: string }).turnId),
            item: (message.params as { item: Record<string, unknown> }).item,
            timestamp,
          },
        ]);
        return;
      case "item/agentMessage/delta":
        this.applyEvents([
          {
            type: "item/delta",
            threadId: String((message.params as { threadId: string }).threadId),
            turnId: String((message.params as { turnId: string }).turnId),
            itemId: String((message.params as { itemId: string }).itemId),
            stream: "agentText",
            delta: String((message.params as { delta: string }).delta),
          },
        ]);
        return;
      case "item/commandExecution/outputDelta":
        this.applyEvents([
          {
            type: "item/delta",
            threadId: String((message.params as { threadId: string }).threadId),
            turnId: String((message.params as { turnId: string }).turnId),
            itemId: String((message.params as { itemId: string }).itemId),
            stream: "commandOutput",
            delta: String((message.params as { delta: string }).delta),
          },
        ]);
        return;
      case "item/fileChange/outputDelta":
        this.applyEvents([
          {
            type: "item/delta",
            threadId: String((message.params as { threadId: string }).threadId),
            turnId: String((message.params as { turnId: string }).turnId),
            itemId: String((message.params as { itemId: string }).itemId),
            stream: "fileChangeOutput",
            delta: String((message.params as { delta: string }).delta),
          },
        ]);
        return;
      case "command/exec/outputDelta": {
        const params = message.params as { processId: string; stream: "stdout" | "stderr"; deltaBase64: string; capReached: boolean };
        const decoded = Buffer.from(params.deltaBase64, "base64").toString("utf8");
        this.applyEvents([
          {
            type: "terminal/output",
            processId: params.processId,
            stream: params.stream,
            chunk: decoded,
            truncated: params.capReached,
          },
        ]);
        return;
      }
      case "skills/changed":
        this.applyEvents([{ type: "skills/changed" }]);
        return;
      case "serverRequest/resolved":
        this.applyEvents([
          {
            type: "approval/resolved",
            requestId: String((message.params as { requestId: string | number }).requestId),
            status: "resolved",
            response: null,
            resolvedAt: timestamp,
          },
        ]);
        return;
      default:
        this.logProtocol("server->client", "notification", message.method, message.params, true);
        this.applyEvents([
          {
            type: "note",
            message: `Unknown notification method received: ${message.method}`,
          },
        ]);
    }
  }

  private handleServerRequest(message: JsonRpcRequestMessage): void {
    this.logProtocol(
      "server->client",
      "serverRequest",
      message.method,
      message.params,
      !supportedApprovals.has(message.method as AppServerServerRequestMethod),
    );
    const timestamp = Date.now();
    const requestId = String(message.id);
    const meta = extractThreadMeta(message.params);
    this.applyEvents([
      {
        type: "approval/pending",
        request: {
          requestId,
          method: message.method,
          threadId: meta.threadId ?? "unknown-thread",
          turnId: meta.turnId ?? "unknown-turn",
          itemId: meta.itemId ?? "unknown-item",
          status: "pending",
          params: (message.params ?? {}) as CommandExecutionRequestApprovalParams | FileChangeRequestApprovalParams,
          createdAt: timestamp,
          resolvedAt: null,
          response: null,
        },
      },
    ]);
    if (!supportedApprovals.has(message.method as AppServerServerRequestMethod)) {
      this.applyEvents([
        {
          type: "note",
          message: `Unsupported server request ${message.method} captured in Raw Events and pending approvals.`,
        },
      ]);
    }
  }

  private handleResponse(message: JsonRpcResponseMessage): void {
    logger.debug("rpc response", {
      id: message.id,
      hasError: Boolean(message.error),
    });
  }

  private async respondToApproval(requestId: string, decision: unknown): Promise<{ ok: true }> {
    if (!this.rpc) {
      throw new Error("runtime not initialized");
    }
    const approval = this.snapshot.approvals[requestId];
    if (!approval) {
      throw new Error(`approval ${requestId} not found`);
    }
    this.rpc.respond(requestId, { decision });
    const statusMap = new Map<string, "accepted" | "acceptedForSession" | "declined" | "cancelled">([
      ["accept", "accepted"],
      ["acceptForSession", "acceptedForSession"],
      ["decline", "declined"],
      ["cancel", "cancelled"],
    ]);
    const mapped = typeof decision === "string" ? statusMap.get(decision) ?? "accepted" : "accepted";
    this.logProtocol("client->server", "serverResponse", approval.method, { requestId, decision });
    this.applyEvents([
      {
        type: "approval/resolved",
        requestId,
        status: mapped,
        response: { decision },
        resolvedAt: Date.now(),
      },
    ]);
    return { ok: true };
  }

  private async startTerminal(params: CommandExecParams): Promise<{ processId: string }> {
    if (!this.rpc) {
      throw new Error("runtime not initialized");
    }
    const processId = params.processId ?? `pty-${Date.now()}`;
    const terminalParams: CommandExecParams = {
      ...params,
      processId,
      tty: true,
      streamStdin: true,
      streamStdoutStderr: true,
    };
    this.applyEvents([
      {
        type: "terminal/upsert",
        terminal: {
          processId,
          command: terminalParams.command,
          cwd: terminalParams.cwd ?? null,
          tty: true,
          status: "starting",
          stdout: "",
          stderr: "",
          startedAt: Date.now(),
          completedAt: null,
          exitCode: null,
          truncated: false,
          disconnected: false,
        },
      },
    ]);
    this.request("command/exec", terminalParams)
      .then((result) => {
        const response = result as CommandExecResponse;
        this.applyEvents([
          {
            type: "terminal/completed",
            processId,
            exitCode: response.exitCode,
            status: response.exitCode === 0 ? "completed" : "failed",
            completedAt: Date.now(),
            stdout: response.stdout,
            stderr: response.stderr,
          },
        ]);
      })
      .catch((error) => {
        this.applyEvents([
          {
            type: "runtime/error",
            message: `terminal ${processId} failed: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: Date.now(),
          },
          {
            type: "terminal/completed",
            processId,
            exitCode: -1,
            status: "failed",
            completedAt: Date.now(),
          },
        ]);
      });
    return { processId };
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    logger.warn("app-server child exited", { code, signal });
    this.applyEvents([
      {
        type: "connection/state",
        connectionState: "error",
        lastError: `app-server exited with code=${code ?? "null"} signal=${signal ?? "null"}`,
        timestamp: Date.now(),
      },
      {
        type: "note",
        message: "app-server process exited; backend will reinitialize and reload thread state.",
      },
    ]);
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    this.restartTimer = setTimeout(() => {
      void this.spawnRuntime("reconnecting").catch((error) => {
        logger.error("failed to restart runtime", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 1500);
  }
}
