import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { AppServerRequestMap, AppServerRequestMethod } from "@codex-web/shared";

export interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcRequestMessage {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotificationMessage {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponseMessage {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcErrorShape;
}

export interface JsonRpcClientOptions {
  cwd: string;
  command: string;
  args: string[];
  timeoutMs: number;
  onStdoutLine: (line: string) => void;
  onStderrLine: (line: string) => void;
  onNotification: (message: JsonRpcNotificationMessage) => void;
  onServerRequest: (message: JsonRpcRequestMessage) => void;
  onResponse: (message: JsonRpcResponseMessage) => void;
  onProcessExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onParseError: (line: string, error: unknown) => void;
}

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

type PendingServerRequest = JsonRpcRequestMessage;

export class JsonRpcClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutDecoder = new StringDecoder("utf8");
  private stderrDecoder = new StringDecoder("utf8");
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private nextId = 1;
  private pendingRequests = new Map<string, PendingRequest>();
  private pendingServerRequests = new Map<string, PendingServerRequest>();
  private lifecycleState: "idle" | "booted" | "initialized" | "ready" | "closed" = "idle";

  constructor(private readonly options: JsonRpcClientOptions) {}

  start(): void {
    if (this.child) {
      throw new Error("json-rpc client already started");
    }
    this.child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.lifecycleState = "booted";
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.consumeStdout(this.stdoutDecoder.write(chunk));
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.consumeStderr(this.stderrDecoder.write(chunk));
    });
    this.child.on("exit", (code, signal) => {
      this.lifecycleState = "closed";
      for (const pending of this.pendingRequests.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("app-server process exited"));
      }
      this.pendingRequests.clear();
      this.options.onProcessExit(code, signal);
    });
  }

  async initialize(params: AppServerRequestMap["initialize"]["params"]): Promise<AppServerRequestMap["initialize"]["result"]> {
    if (this.lifecycleState !== "booted") {
      throw new Error(`initialize called in invalid state ${this.lifecycleState}`);
    }
    const response = await this.request("initialize", params);
    this.lifecycleState = "initialized";
    this.notify("initialized");
    this.lifecycleState = "ready";
    return response;
  }

  request<M extends AppServerRequestMethod>(
    method: M,
    params: AppServerRequestMap[M]["params"],
    timeoutMs = this.options.timeoutMs,
  ): Promise<AppServerRequestMap[M]["result"]> {
    if (!this.child?.stdin.writable) {
      return Promise.reject(new Error("app-server is not running"));
    }
    if (method !== "initialize" && this.lifecycleState !== "ready") {
      return Promise.reject(new Error(`cannot send ${method} before initialized handshake completes`));
    }
    if (method === "initialize" && this.lifecycleState !== "booted") {
      return Promise.reject(new Error("repeated initialize is not allowed"));
    }
    const id = `${this.nextId++}`;
    const payload: JsonRpcRequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    this.write(payload);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`request timeout for ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
    });
  }

  notify(method: "initialized"): void {
    if (!this.child?.stdin.writable) {
      throw new Error("app-server is not running");
    }
    this.write({
      jsonrpc: "2.0",
      method,
    });
  }

  respond(id: string, result?: unknown, error?: JsonRpcErrorShape): void {
    const request = this.pendingServerRequests.get(id);
    if (!request) {
      throw new Error(`no pending server request ${id}`);
    }
    this.pendingServerRequests.delete(id);
    const payload: JsonRpcResponseMessage = {
      jsonrpc: "2.0",
      id: request.id,
      ...(error ? { error } : { result }),
    };
    this.write(payload);
  }

  getPendingRequestIds(): string[] {
    return [...this.pendingRequests.keys()];
  }

  getPendingServerRequests(): PendingServerRequest[] {
    return [...this.pendingServerRequests.values()];
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    while (true) {
      const index = this.stdoutBuffer.indexOf("\n");
      if (index < 0) {
        break;
      }
      const line = this.stdoutBuffer.slice(0, index).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      if (!line) {
        continue;
      }
      this.options.onStdoutLine(line);
      try {
        const message = JSON.parse(line) as JsonRpcRequestMessage | JsonRpcNotificationMessage | JsonRpcResponseMessage;
        if ("method" in message && "id" in message) {
          this.pendingServerRequests.set(String(message.id), message);
          this.options.onServerRequest(message);
          continue;
        }
        if ("method" in message) {
          this.options.onNotification(message);
          continue;
        }
        if ("id" in message) {
          const pending = this.pendingRequests.get(String(message.id));
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(String(message.id));
            if (message.error) {
              pending.reject(
                Object.assign(new Error(message.error.message), {
                  code: message.error.code,
                  data: message.error.data,
                }),
              );
            } else {
              pending.resolve(message.result);
            }
          }
          this.options.onResponse(message);
        }
      } catch (error) {
        this.options.onParseError(line, error);
      }
    }
  }

  private consumeStderr(chunk: string): void {
    this.stderrBuffer += chunk;
    while (true) {
      const index = this.stderrBuffer.indexOf("\n");
      if (index < 0) {
        break;
      }
      const line = this.stderrBuffer.slice(0, index);
      this.stderrBuffer = this.stderrBuffer.slice(index + 1);
      this.options.onStderrLine(line);
    }
  }

  private write(payload: JsonRpcRequestMessage | JsonRpcNotificationMessage | JsonRpcResponseMessage): void {
    this.child?.stdin.write(`${JSON.stringify(payload)}\n`, "utf8");
  }
}
