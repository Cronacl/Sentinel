import "server-only";

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";

type JsonRpcId = number | string;

type JsonRpcError = {
  code: number;
  data?: unknown;
  message: string;
};

type JsonRpcRequestMessage = {
  id: JsonRpcId;
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcNotificationMessage = {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcResultMessage = {
  id: JsonRpcId;
  jsonrpc?: "2.0";
  result?: unknown;
  error?: JsonRpcError;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

export type AcpServerNotification = {
  method: string;
  params?: unknown;
  type: "notification";
};

export type AcpServerRequest = {
  id: string;
  method: string;
  params?: unknown;
  type: "request";
};

export type AcpServerEvent = AcpServerNotification | AcpServerRequest;

export type AcpSpawnOptions = {
  args?: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type AcpSpawnedProcess = Pick<
  ChildProcessByStdio<Writable, Readable, Readable>,
  "kill" | "on" | "once" | "off" | "removeAllListeners"
> & {
  stderr: Readable;
  stdin: Writable;
  stdout: Readable;
};

export type SpawnAcpProcess = (
  options: AcpSpawnOptions,
) => Promise<AcpSpawnedProcess> | AcpSpawnedProcess;

export type AcpClientOptions = AcpSpawnOptions & {
  spawnProcess?: SpawnAcpProcess;
};

type AcpRequestHandler = (
  request: AcpServerRequest,
) => Promise<unknown> | unknown;

function defaultSpawnProcess(
  options: AcpSpawnOptions,
): ChildProcessByStdio<Writable, Readable, Readable> {
  return spawn(options.command, options.args ?? [], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

function isJsonRpcErrorResponse(value: unknown): value is JsonRpcResultMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    ("result" in value || "error" in value),
  );
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequestMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    "method" in value &&
    typeof (value as { method?: unknown }).method === "string",
  );
}

function isJsonRpcNotification(
  value: unknown,
): value is JsonRpcNotificationMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    !("id" in value) &&
    "method" in value &&
    typeof (value as { method?: unknown }).method === "string",
  );
}

function isMethodNotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const lower = error.message.toLowerCase();
  return lower.includes("method not found") || lower.includes("-32601");
}

export class AcpClient {
  private buffer = "";
  private child: AcpSpawnedProcess | null = null;
  private listeners = new Set<(event: AcpServerEvent) => void>();
  private nextRequestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestHandlers = new Map<string, AcpRequestHandler>();
  private startPromise: Promise<void> | null = null;

  constructor(private readonly options: AcpClientOptions) {}

  subscribe(listener: (event: AcpServerEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onRequest(method: string, handler: AcpRequestHandler) {
    this.requestHandlers.set(method, handler);
    return () => {
      this.requestHandlers.delete(method);
    };
  }

  async initialize(params: unknown) {
    return await this.call("initialize", params);
  }

  async authenticate(params: unknown) {
    return await this.call("authenticate", params);
  }

  async newSession(params: unknown) {
    return await this.callWithFallback(["session/new", "newSession"], params);
  }

  async loadSession(params: unknown) {
    return await this.callWithFallback(["session/load", "loadSession"], params);
  }

  async prompt(params: unknown) {
    return await this.callWithFallback(["session/prompt", "prompt"], params);
  }

  async setSessionMode(params: unknown) {
    return await this.callWithFallback(
      ["session/set_mode", "setSessionMode"],
      params,
    );
  }

  async setSessionModel(params: unknown) {
    return await this.callWithFallback(
      ["unstable_setSessionModel", "session/set_config_option"],
      params,
    );
  }

  async cancel(params: unknown) {
    await this.ensureStarted();
    this.notify("session/cancel", params);
  }

  async respond(id: string, result: unknown) {
    await this.ensureStarted();
    this.writeMessage({ id, result });
  }

  async respondError(
    id: string,
    error: {
      code: number;
      data?: unknown;
      message: string;
    },
  ) {
    await this.ensureStarted();
    this.writeMessage({ error, id });
  }

  async close() {
    this.resetProcess(new Error("ACP client closed."));
  }

  private emit(event: AcpServerEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private async ensureStarted() {
    if (this.child) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      const child =
        (await this.options.spawnProcess?.({
          args: this.options.args,
          command: this.options.command,
          cwd: this.options.cwd,
          env: this.options.env,
        })) ??
        defaultSpawnProcess({
          args: this.options.args,
          command: this.options.command,
          cwd: this.options.cwd,
          env: this.options.env,
        });

      this.child = child;
      this.buffer = "";

      child.stdout.setEncoding?.("utf8");
      child.stderr.setEncoding?.("utf8");
      child.stdout.on("data", (chunk: string | Buffer) => {
        this.handleStdout(String(chunk));
      });
      child.stderr.on("data", () => {});
      child.on("exit", (code, signal) => {
        this.resetProcess(
          new Error(
            `ACP process exited${code != null ? ` with code ${code}` : ""}${
              signal ? ` (${signal})` : ""
            }.`,
          ),
        );
      });
      child.on("error", (error) => {
        this.resetProcess(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private resetProcess(error: Error) {
    if (this.child) {
      this.child.stdout.removeAllListeners();
      this.child.stderr.removeAllListeners();
      this.child.removeAllListeners();
      this.child.kill();
    }

    this.child = null;
    this.buffer = "";

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch {
        continue;
      }

      void this.handleMessage(parsed);
    }
  }

  private async handleMessage(message: unknown) {
    if (isJsonRpcErrorResponse(message)) {
      const id = String(message.id);
      const pending = this.pendingRequests.get(id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(id);
      if (message.error) {
        const error = new Error(
          `${message.error.message} (${message.error.code})`,
        );
        pending.reject(error);
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcRequest(message)) {
      const request: AcpServerRequest = {
        id: String(message.id),
        method: message.method,
        params: message.params,
        type: "request",
      };
      const handler = this.requestHandlers.get(request.method);
      if (handler) {
        try {
          const result = await handler(request);
          await this.respond(request.id, result);
        } catch (error) {
          await this.respondError(request.id, {
            code: -32000,
            ...(error instanceof Error ? { data: { stack: error.stack } } : {}),
            message:
              error instanceof Error ? error.message : "Unhandled ACP request",
          });
        }
        return;
      }

      this.emit(request);
      return;
    }

    if (isJsonRpcNotification(message)) {
      this.emit({
        method: message.method,
        params: message.params,
        type: "notification",
      });
    }
  }

  private async callWithFallback(methods: string[], params: unknown) {
    let lastError: unknown = null;

    for (const method of methods) {
      try {
        return await this.call(method, params);
      } catch (error) {
        lastError = error;
        if (!isMethodNotFoundError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No ACP method variant succeeded.");
  }

  private async call(method: string, params: unknown) {
    await this.ensureStarted();

    const id = String(++this.nextRequestId);

    return await new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { reject, resolve });
      this.writeMessage({
        id,
        method,
        params,
      });
    });
  }

  private notify(method: string, params: unknown) {
    this.writeMessage({
      method,
      params,
    });
  }

  private writeMessage(
    message:
      | (JsonRpcRequestMessage & { error?: never; result?: never })
      | (JsonRpcNotificationMessage & {
          error?: never;
          id?: never;
          result?: never;
        })
      | (JsonRpcResultMessage & { method?: never; params?: never }),
  ) {
    if (!this.child) {
      throw new Error("ACP process is not running.");
    }

    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`,
    );
  }
}
