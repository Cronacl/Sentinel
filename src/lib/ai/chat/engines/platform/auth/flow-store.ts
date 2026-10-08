import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";

import { createLogger } from "@/lib/logger";

import {
  ENGINE_AUTH_TICKET_PATTERN,
  idleEngineAuthFlowState,
  MAX_ENGINE_AUTH_CREDENTIAL_FIELDS,
  MAX_ENGINE_AUTH_CREDENTIAL_LENGTH,
  type EngineAuthCredentialField,
  type EngineAuthFlowPurpose,
  type EngineAuthFlowState,
  type EngineAuthInteraction,
  type EngineAuthResponse,
  type EngineSnapshot,
  type ResolvedEngineInstance,
} from "../../contract";
import { emitEngineEvent, type EngineEventInput } from "../events";
import {
  EngineAuthError,
  EngineAuthFlowError,
  type EngineAuthClientCapabilities,
  type EngineAuthController,
  type EngineAuthFlowContext,
  type EngineAuthResult,
  type EngineAuthTerminalCommand,
} from "./controller";
import type { EngineInstanceSecrets } from "./instance-secrets";
import { resolveEngineAuthFlowOutcome } from "./outcome";
import type { RunAuthCommandInput } from "./run-command";
import {
  buildAuthTerminalEnv,
  formatAuthDisplayCommand,
  isSafeAuthUrl,
  type EngineAuthTerminalLaunchSpec,
} from "./terminal-command";

// Sign-in and sign-out flows, one per user and instance, in server memory
// (on globalThis, so dev-server module copies share them). Ported in spirit
// from t3code's ProviderAuthFlow (apps/server/src/provider/ProviderAuthFlow.ts,
// MIT): drivers run the login, this store owns the flow's lifetime (TTL,
// cancel, replacement by a new flow), the interaction the user answers and
// the verification that follows (a forced snapshot refresh).
//
// Security:
// - every request is checked against the user that started the flow;
// - credentials are handed to the driver once and kept only to redact them
//   from messages; no state, event or log carries them;
// - a terminal command is launched in the desktop app only through a
//   one-time ticket for a command a driver built (redeemTerminalTicket);
// - events broadcast the phase only: interactions (device codes, tickets)
//   are read back per user through `get`.

const log = createLogger("EngineAuthFlows");

const DEFAULT_FLOW_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_TICKET_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_RETAIN_FINISHED_MS = 5 * 60 * 1_000;
const DEFAULT_PROGRESS_WAIT_MS = 8_000;
const MAX_MESSAGE_LENGTH = 500;
const REDACTED = "••••";
// Control characters other than tab never belong in a token or key.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000a-\u001f\u007f]/;

export type EngineAuthFlowClock = {
  clearTimeout(handle: unknown): void;
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
};

export type EngineAuthFlowStoreDeps = {
  clock?: EngineAuthFlowClock;
  emit?: (event: EngineEventInput) => void;
  /** How long a flow may wait for the user (default 15 min). */
  flowTtlMs?: number;
  /** Working directory of sign-in terminal commands (default: home). */
  homeDirectory?: () => string;
  platform?: NodeJS.Platform;
  /** How long start/respond wait for the flow to move on (default 8 s). */
  progressWaitMs?: number;
  randomId?: () => string;
  randomTicket?: () => string;
  /** Forced full probe of the instance once a flow finished. */
  refreshSnapshot(
    userId: string,
    instanceId: string,
  ): Promise<EngineSnapshot | null>;
  /** How long a finished flow stays readable (default 5 min). */
  retainFinishedMs?: number;
  runCommand(input: RunAuthCommandInput): Promise<{ exitCode: number | null }>;
  secrets: EngineInstanceSecrets;
  /** How long a terminal launch ticket can be redeemed (default 5 min). */
  ticketTtlMs?: number;
};

export type StartEngineAuthFlowInput = {
  client: EngineAuthClientCapabilities;
  controller: EngineAuthController;
  instance: ResolvedEngineInstance;
  /** Login only; default: the first method the driver offers. */
  methodId?: string | null;
  purpose: EngineAuthFlowPurpose;
  userId: string;
};

export type RespondEngineAuthFlowInput = {
  flowId: string;
  instanceId: string;
  interactionId: string;
  response: EngineAuthResponse;
  userId: string;
};

export interface EngineAuthFlowStore {
  /** Starts a flow, ending any flow still running for the instance. */
  start(input: StartEngineAuthFlowInput): Promise<EngineAuthFlowState>;
  respond(input: RespondEngineAuthFlowInput): Promise<EngineAuthFlowState>;
  cancel(input: {
    flowId: string;
    instanceId: string;
    userId: string;
  }): Promise<EngineAuthFlowState>;
  /** The instance's current (or recently finished) flow, else idle. */
  get(userId: string, instanceId: string): EngineAuthFlowState;
  /**
   * The command a launch ticket stands for, once: null for an unknown,
   * used or expired ticket, or a flow that moved on.
   */
  redeemTerminalTicket(ticket: string): EngineAuthTerminalLaunchSpec | null;
  /** Ends every flow (tests, shutdown). */
  dispose(): void;
}

type PendingInteraction =
  | {
      fields: readonly EngineAuthCredentialField[];
      id: string;
      kind: "credentials";
      reject(error: unknown): void;
      resolve(values: Record<string, string>): void;
    }
  | {
      id: string;
      kind: "terminal";
      reject(error: unknown): void;
      resolve(result: { exitCode: number | null }): void;
      ticket: string | null;
    };

type FlowRecord = {
  abort: AbortController;
  done: boolean;
  expiresAt: number;
  expiryTimer: unknown;
  flowId: string;
  instance: ResolvedEngineInstance;
  interactionCount: number;
  key: string;
  listeners: Set<() => void>;
  pending: PendingInteraction | null;
  purpose: EngineAuthFlowPurpose;
  retainTimer: unknown;
  secrets: Set<string>;
  state: EngineAuthFlowState;
  terminalExitCode: number | null | undefined;
  userId: string;
};

type TicketEntry = {
  expiresAt: number;
  flowId: string;
  interactionId: string;
  key: string;
  spec: EngineAuthTerminalLaunchSpec;
};

/** Thrown into a driver's pending await when its flow ends. */
class EngineAuthFlowEndedError extends Error {
  constructor() {
    super("The sign-in flow ended.");
    this.name = "EngineAuthFlowEndedError";
  }
}

const SYSTEM_CLOCK: EngineAuthFlowClock = {
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    // A pending flow must not keep the server process alive.
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
};

function keyOf(userId: string, instanceId: string) {
  return `${userId}\u0000${instanceId}`;
}

function truncate(message: string) {
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}

function validateCredentialFields(
  fields: readonly EngineAuthCredentialField[],
) {
  const names = new Set(fields.map((field) => field.name));
  if (
    fields.length === 0 ||
    fields.length > MAX_ENGINE_AUTH_CREDENTIAL_FIELDS ||
    names.size !== fields.length
  ) {
    throw new EngineAuthError("This sign-in method asks for invalid fields.");
  }
}

/**
 * The values for `fields` from a response: every field present, trimmed and
 * non-empty, nothing else.
 */
export function normalizeEngineAuthCredentials(
  fields: readonly EngineAuthCredentialField[],
  values: Record<string, string>,
): Record<string, string> {
  const known = new Set(fields.map((field) => field.name));
  for (const name of Object.keys(values)) {
    if (!known.has(name)) {
      throw new EngineAuthFlowError("invalid", `Unexpected field "${name}".`);
    }
  }

  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name]?.trim() ?? "";
    if (!value) {
      throw new EngineAuthFlowError("invalid", `${field.label} is required.`);
    }
    if (
      value.length > MAX_ENGINE_AUTH_CREDENTIAL_LENGTH ||
      CONTROL_CHARACTERS.test(value)
    ) {
      throw new EngineAuthFlowError(
        "invalid",
        `${field.label} is not a valid value.`,
      );
    }
    result[field.name] = value;
  }
  return result;
}

export function createEngineAuthFlowStore(
  deps: EngineAuthFlowStoreDeps,
): EngineAuthFlowStore {
  const clock = deps.clock ?? SYSTEM_CLOCK;
  const flowTtlMs = deps.flowTtlMs ?? DEFAULT_FLOW_TTL_MS;
  const ticketTtlMs = deps.ticketTtlMs ?? DEFAULT_TICKET_TTL_MS;
  const retainFinishedMs = deps.retainFinishedMs ?? DEFAULT_RETAIN_FINISHED_MS;
  const progressWaitMs = deps.progressWaitMs ?? DEFAULT_PROGRESS_WAIT_MS;
  const platform = deps.platform ?? process.platform;
  const homeDirectory = deps.homeDirectory ?? (() => os.homedir());
  const randomId = deps.randomId ?? (() => randomUUID());
  const randomTicket =
    deps.randomTicket ?? (() => randomBytes(32).toString("hex"));

  const records = new Map<string, FlowRecord>();
  const tickets = new Map<string, TicketEntry>();

  const isCurrent = (record: FlowRecord) => records.get(record.key) === record;

  function redact(record: FlowRecord, text: string) {
    let result = text;
    for (const secret of record.secrets) {
      if (secret.length >= 4) {
        result = result.split(secret).join(REDACTED);
      }
    }
    return truncate(result);
  }

  function notify(record: FlowRecord) {
    for (const listener of [...record.listeners]) {
      listener();
    }
  }

  function update(record: FlowRecord, patch: Partial<EngineAuthFlowState>) {
    if (!isCurrent(record)) {
      return;
    }
    record.state = { ...record.state, ...patch };
    // The phase only: interactions carry device codes and launch tickets,
    // and engine events reach every subscriber.
    deps.emit?.({
      state: { ...record.state, interaction: null },
      type: "auth",
    });
    notify(record);
  }

  /** Resolves once `predicate` holds, the flow ended, or after the wait. */
  function waitForProgress(
    record: FlowRecord,
    predicate: (state: EngineAuthFlowState) => boolean,
  ) {
    return new Promise<void>((resolve) => {
      if (record.done || predicate(record.state)) {
        resolve();
        return;
      }

      let timer: unknown = null;
      const listener = () => {
        if (record.done || predicate(record.state)) {
          finish();
        }
      };
      const finish = () => {
        record.listeners.delete(listener);
        if (timer !== null) {
          clock.clearTimeout(timer);
        }
        resolve();
      };
      record.listeners.add(listener);
      timer = clock.setTimeout(finish, progressWaitMs);
    });
  }

  function revokeTicket(record: FlowRecord) {
    if (record.pending?.kind === "terminal" && record.pending.ticket) {
      tickets.delete(record.pending.ticket);
      record.pending.ticket = null;
    }
  }

  function settlePending(record: FlowRecord, error?: unknown) {
    const pending = record.pending;
    if (!pending) {
      return;
    }
    revokeTicket(record);
    record.pending = null;
    if (error) {
      pending.reject(error);
    }
  }

  function scheduleRetention(record: FlowRecord) {
    record.retainTimer = clock.setTimeout(() => {
      if (isCurrent(record)) {
        records.delete(record.key);
      }
    }, retainFinishedMs);
  }

  function close(record: FlowRecord) {
    record.done = true;
    if (record.expiryTimer !== null) {
      clock.clearTimeout(record.expiryTimer);
      record.expiryTimer = null;
    }
    settlePending(record, new EngineAuthFlowEndedError());
    notify(record);
  }

  /** Ends a flow that is still running: by the user, a newer flow or the TTL. */
  function end(
    record: FlowRecord,
    reason: "cancelled" | "expired" | "replaced",
  ) {
    if (record.done) {
      return;
    }

    const noun = record.purpose === "login" ? "Sign-in" : "Sign-out";
    update(record, {
      expiresAt: null,
      interaction: null,
      message:
        reason === "expired"
          ? `${noun} expired. Start again.`
          : reason === "replaced"
            ? `${noun} was replaced by a newer one.`
            : `${noun} cancelled.`,
      phase: reason === "expired" ? "failed" : "cancelled",
    });
    close(record);
    record.abort.abort(new EngineAuthFlowEndedError());
    scheduleRetention(record);
  }

  function complete(
    record: FlowRecord,
    outcome: { message: string; phase: "failed" | "succeeded" },
  ) {
    if (record.done) {
      return;
    }
    update(record, {
      expiresAt: null,
      interaction: null,
      message: redact(record, outcome.message),
      phase: outcome.phase,
    });
    close(record);
    scheduleRetention(record);
  }

  function assertActive(record: FlowRecord) {
    if (record.done || !isCurrent(record)) {
      throw new EngineAuthFlowEndedError();
    }
  }

  function nextInteractionId(record: FlowRecord) {
    record.interactionCount += 1;
    return `${record.flowId}:${record.interactionCount}`;
  }

  function wait(
    record: FlowRecord,
    interaction: EngineAuthInteraction,
    message: string,
  ) {
    update(record, { interaction, message, phase: "waiting" });
  }

  function createContext(
    record: FlowRecord,
    client: EngineAuthClientCapabilities,
  ): EngineAuthFlowContext {
    const { instance, userId } = record;

    return {
      async clearInstanceSecrets(names) {
        assertActive(record);
        return await deps.secrets.clear(userId, instance.id, names);
      },

      client,
      flowId: record.flowId,

      requestCredentials(fields, options) {
        assertActive(record);
        validateCredentialFields(fields);
        const id = nextInteractionId(record);

        return new Promise<Record<string, string>>((resolve, reject) => {
          record.pending = { fields, id, kind: "credentials", reject, resolve };
          wait(
            record,
            {
              ...(options?.description
                ? { description: options.description }
                : {}),
              fields: [...fields],
              id,
              type: "credentials",
            },
            "Enter the credentials to continue.",
          );
        });
      },

      async runBackgroundCommand(command) {
        assertActive(record);
        return await deps.runCommand({
          args: command.args,
          command: command.command,
          env: { ...instance.env, ...command.env },
          signal: record.abort.signal,
          ...(command.timeoutMs ? { timeoutMs: command.timeoutMs } : {}),
        });
      },

      async runTerminalCommand(command: EngineAuthTerminalCommand) {
        assertActive(record);
        const publicOverrides = await deps.secrets
          .publicOverrides(userId, instance)
          .catch(() => ({}));
        assertActive(record);

        const env = buildAuthTerminalEnv({
          commandEnv: command.env,
          path: instance.env.PATH ?? null,
          publicOverrides,
        });
        const display = command.display ?? {
          args: command.args,
          command: command.command,
        };
        const displayCommand = formatAuthDisplayCommand(
          {
            ...display,
            env: buildAuthTerminalEnv({
              commandEnv: command.display ? undefined : command.env,
              publicOverrides,
            }),
          },
          platform,
        );
        const cwd = homeDirectory();
        const id = nextInteractionId(record);
        const spec: EngineAuthTerminalLaunchSpec = {
          args: [...command.args],
          command: command.command,
          cwd,
          env,
          title: command.title,
          ...(command.windowsVerbatimArguments
            ? { windowsVerbatimArguments: true }
            : {}),
        };

        let ticket: string | null = null;
        let launch: { expiresAt: string; ticket: string } | null = null;
        if (client.terminal) {
          ticket = randomTicket();
          const expiresAt = Math.min(
            clock.now() + ticketTtlMs,
            record.expiresAt,
          );
          tickets.set(ticket, {
            expiresAt,
            flowId: record.flowId,
            interactionId: id,
            key: record.key,
            spec,
          });
          launch = { expiresAt: new Date(expiresAt).toISOString(), ticket };
        }

        return await new Promise<{ exitCode: number | null }>(
          (resolve, reject) => {
            record.pending = {
              id,
              kind: "terminal",
              reject,
              resolve: (result) => {
                record.terminalExitCode = result.exitCode;
                resolve(result);
              },
              ticket,
            };
            wait(
              record,
              { ...spec, displayCommand, id, launch, type: "terminal-command" },
              client.terminal
                ? "Finish in the terminal below."
                : "Run this command in a terminal, then confirm here.",
            );
          },
        );
      },

      async saveInstanceSecrets(values) {
        assertActive(record);
        for (const value of Object.values(values)) {
          record.secrets.add(value);
        }
        await deps.secrets.save(userId, instance.id, values);
      },

      setMessage(message) {
        if (!record.done) {
          update(record, { message: redact(record, message) });
        }
      },

      showBrowser(url) {
        assertActive(record);
        if (!isSafeAuthUrl(url)) {
          throw new EngineAuthError("The sign-in page address is not valid.");
        }
        wait(
          record,
          { id: nextInteractionId(record), type: "browser", url },
          "Open the sign-in page to continue.",
        );
      },

      showDeviceCode({ url, userCode }) {
        assertActive(record);
        if (!isSafeAuthUrl(url) || !userCode.trim()) {
          throw new EngineAuthError("The sign-in code is not valid.");
        }
        wait(
          record,
          {
            id: nextInteractionId(record),
            type: "device-code",
            url,
            userCode: userCode.trim(),
          },
          "Enter the code on the sign-in page.",
        );
      },

      signal: record.abort.signal,
    };
  }

  function failureMessage(record: FlowRecord, error: unknown) {
    if (error instanceof EngineAuthError) {
      return error.message;
    }

    const detail = error instanceof Error ? redact(record, error.message) : "";
    log.warn("auth_flow_failed", {
      driver: record.instance.driver,
      error: error instanceof Error ? error.name : typeof error,
      flowId: record.flowId,
      instanceId: record.instance.id,
      message: detail,
    });
    const noun = record.purpose === "login" ? "Sign-in" : "Sign-out";
    return detail ? `${noun} failed: ${detail}` : `${noun} failed. Try again.`;
  }

  function refreshInBackground(record: FlowRecord) {
    void deps
      .refreshSnapshot(record.userId, record.instance.id)
      .catch(() => null);
  }

  async function run(record: FlowRecord, input: StartEngineAuthFlowInput) {
    const context = createContext(record, input.client);
    const ended = new Promise<never>((_, reject) => {
      record.abort.signal.addEventListener(
        "abort",
        () => reject(new EngineAuthFlowEndedError()),
        { once: true },
      );
    });
    // The race below observes it; a flow that ends first must not leave an
    // unhandled rejection behind.
    ended.catch(() => undefined);

    let result: EngineAuthResult;
    let driverRan = false;
    try {
      if (input.purpose === "login") {
        const methods = await Promise.race([
          input.controller.methods(input.instance, input.client),
          ended,
        ]);
        const method = input.methodId
          ? methods.find((candidate) => candidate.id === input.methodId)
          : methods[0];
        if (!method) {
          throw new EngineAuthError(
            "This sign-in method is not available for this instance.",
          );
        }
        update(record, { methodId: method.id });
        driverRan = true;
        result = await Promise.race([
          input.controller.login(input.instance, method.id, context),
          ended,
        ]);
      } else {
        if (!input.controller.logout) {
          throw new EngineAuthError(
            "This engine cannot be signed out from Sentinel.",
          );
        }
        driverRan = true;
        result = await Promise.race([
          input.controller.logout(input.instance, context),
          ended,
        ]);
      }
    } catch (error) {
      if (record.done) {
        return;
      }
      complete(record, {
        message: failureMessage(record, error),
        phase: "failed",
      });
      if (driverRan) {
        refreshInBackground(record);
      }
      return;
    }

    if (record.done) {
      return;
    }
    settlePending(record);
    update(record, {
      interaction: null,
      message:
        input.purpose === "login"
          ? "Checking the sign-in."
          : "Checking the sign-out.",
      phase: "verifying",
    });

    const snapshot = await deps
      .refreshSnapshot(record.userId, record.instance.id)
      .catch((error: unknown) => {
        log.warn("auth_flow_refresh_failed", {
          error: error instanceof Error ? error.name : typeof error,
          instanceId: record.instance.id,
        });
        return null;
      });

    complete(
      record,
      resolveEngineAuthFlowOutcome({
        auth: snapshot?.auth ?? null,
        driverMessage: result?.message ?? null,
        exitCode: record.terminalExitCode,
        label: record.instance.label,
        purpose: input.purpose,
      }),
    );
  }

  function requireRecord(userId: string, instanceId: string, flowId: string) {
    const record = records.get(keyOf(userId, instanceId));
    if (!record || record.flowId !== flowId) {
      throw new EngineAuthFlowError(
        "not-found",
        "This sign-in is no longer active. Start again.",
      );
    }
    return record;
  }

  const store: EngineAuthFlowStore = {
    async start(input) {
      const key = keyOf(input.userId, input.instance.id);
      const previous = records.get(key);
      if (previous) {
        if (!previous.done) {
          end(previous, "replaced");
        }
        if (previous.retainTimer !== null) {
          clock.clearTimeout(previous.retainTimer);
        }
      }

      const now = clock.now();
      const flowId = randomId();
      const record: FlowRecord = {
        abort: new AbortController(),
        done: false,
        expiresAt: now + flowTtlMs,
        expiryTimer: null,
        flowId,
        instance: input.instance,
        interactionCount: 0,
        key,
        listeners: new Set(),
        pending: null,
        purpose: input.purpose,
        retainTimer: null,
        secrets: new Set(),
        state: {
          expiresAt: new Date(now + flowTtlMs).toISOString(),
          flowId,
          instanceId: input.instance.id,
          interaction: null,
          message:
            input.purpose === "login" ? "Starting sign-in." : "Signing out.",
          methodId: null,
          phase: "starting",
          purpose: input.purpose,
        },
        terminalExitCode: undefined,
        userId: input.userId,
      };
      records.set(key, record);
      record.expiryTimer = clock.setTimeout(
        () => end(record, "expired"),
        flowTtlMs,
      );
      update(record, {});

      void run(record, input);
      // Until the user has something to do, or the flow already finished.
      await waitForProgress(
        record,
        (state) => state.phase !== "starting" && state.phase !== "verifying",
      );
      return record.state;
    },

    async respond(input) {
      const record = requireRecord(
        input.userId,
        input.instanceId,
        input.flowId,
      );
      const pending = record.pending;
      if (record.done || !pending || pending.id !== input.interactionId) {
        throw new EngineAuthFlowError(
          "conflict",
          "This sign-in step is no longer waiting for an answer.",
        );
      }

      const { response } = input;
      if (pending.kind === "credentials" && response.type === "credentials") {
        const values = normalizeEngineAuthCredentials(
          pending.fields,
          response.values,
        );
        for (const field of pending.fields) {
          if (field.secret) {
            record.secrets.add(values[field.name]!);
          }
        }
        record.pending = null;
        update(record, {
          interaction: null,
          message: "Saving the credentials.",
          phase: "verifying",
        });
        pending.resolve(values);
      } else if (pending.kind === "terminal" && response.type === "terminal") {
        revokeTicket(record);
        record.pending = null;
        update(record, {
          interaction: null,
          message: "Checking the sign-in.",
          phase: "verifying",
        });
        pending.resolve({ exitCode: response.exitCode });
      } else {
        throw new EngineAuthFlowError(
          "invalid",
          "This answer does not match the sign-in step.",
        );
      }

      await waitForProgress(record, (state) => state.phase !== "verifying");
      return record.state;
    },

    async cancel(input) {
      const record = requireRecord(
        input.userId,
        input.instanceId,
        input.flowId,
      );
      end(record, "cancelled");
      return record.state;
    },

    get(userId, instanceId) {
      return (
        records.get(keyOf(userId, instanceId))?.state ??
        idleEngineAuthFlowState(instanceId)
      );
    },

    redeemTerminalTicket(ticket) {
      if (!ENGINE_AUTH_TICKET_PATTERN.test(ticket)) {
        return null;
      }
      const entry = tickets.get(ticket);
      if (!entry) {
        return null;
      }
      tickets.delete(ticket);

      const record = records.get(entry.key);
      if (
        entry.expiresAt <= clock.now() ||
        !record ||
        record.done ||
        record.flowId !== entry.flowId ||
        record.pending?.kind !== "terminal" ||
        record.pending.id !== entry.interactionId
      ) {
        return null;
      }
      record.pending.ticket = null;
      return entry.spec;
    },

    dispose() {
      for (const record of [...records.values()]) {
        end(record, "cancelled");
        if (record.retainTimer !== null) {
          clock.clearTimeout(record.retainTimer);
        }
      }
      records.clear();
      tickets.clear();
    },
  };

  return store;
}

const globalForAuthFlows = globalThis as unknown as {
  __sentinelEngineAuthFlows?: EngineAuthFlowStore;
};

/**
 * The process-wide store, wired to the snapshot service, the instance
 * registry and the engine event bus (loaded on first use).
 */
export function getEngineAuthFlowStore(): EngineAuthFlowStore {
  if (!globalForAuthFlows.__sentinelEngineAuthFlows) {
    globalForAuthFlows.__sentinelEngineAuthFlows = createEngineAuthFlowStore(
      createDefaultEngineAuthFlowDeps(),
    );
  }
  return globalForAuthFlows.__sentinelEngineAuthFlows;
}

function createDefaultEngineAuthFlowDeps(): EngineAuthFlowStoreDeps {
  const registry = async () =>
    (await import("../instances")).getEngineInstanceRegistry();
  const secrets = import("./instance-secrets").then((module) =>
    module.createEngineInstanceSecrets({
      listSummaries: async (userId) =>
        await (await registry()).listSummaries(userId),
      update: async (userId, instanceId, patch) =>
        await (await registry()).update(userId, instanceId, patch),
    }),
  );

  return {
    emit: (event) => {
      emitEngineEvent(event);
    },
    refreshSnapshot: async (userId, instanceId) =>
      await (
        await import("../snapshot-service")
      )
        .getEngineSnapshotService()
        .refresh(userId, instanceId, "auth"),
    runCommand: async (input) =>
      await (await import("./run-command")).runAuthCommand(input),
    secrets: {
      clear: async (...args) => await (await secrets).clear(...args),
      publicOverrides: async (...args) =>
        await (await secrets).publicOverrides(...args),
      save: async (...args) => await (await secrets).save(...args),
    },
  };
}
