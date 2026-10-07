import { z } from "zod";

import { PERMISSION_MODES, type PermissionMode } from "@/server/db/enums";

import type { BuiltinDriverKind } from "../contract/ids";
import { acpThreadStateSchema, type AcpThreadState } from "./acp";
import {
  antigravityThreadStateSchema,
  type AntigravityThreadState,
} from "./antigravity";
import { claudeThreadStateSchema, type ClaudeThreadState } from "./claude";
import { codexThreadStateSchema, type CodexThreadState } from "./codex";
import { copilotThreadStateSchema, type CopilotThreadState } from "./copilot";
import { cursorThreadStateSchema, type CursorThreadState } from "./cursor";
import { grokThreadStateSchema, type GrokThreadState } from "./grok";
import {
  openCodeThreadStateSchema,
  type OpenCodeThreadState,
} from "./opencode";
import { piThreadStateSchema, type PiThreadState } from "./pi";
import { repoThreadStateSchema, type RepoThreadState } from "./repo";
import type { ThreadStateSessionMeta } from "./session";

/**
 * Where a driver keeps its state inside thread.chat_engine_state. The key is
 * the driver kind: a thread is bound to one instance, so instances of the
 * same driver never share a thread.
 */
export type ThreadStateBinding<S> = {
  key: string;
  schema: z.ZodType<S>;
};

export type ThreadStateByDriver = {
  acp: AcpThreadState;
  antigravity: AntigravityThreadState;
  claude: ClaudeThreadState;
  codex: CodexThreadState;
  copilot: CopilotThreadState;
  cursor: CursorThreadState;
  grok: GrokThreadState;
  opencode: OpenCodeThreadState;
  pi: PiThreadState;
};

export type ThreadStateDriverKind = keyof ThreadStateByDriver;

export const THREAD_STATE_BINDINGS = {
  acp: { key: "acp", schema: acpThreadStateSchema },
  antigravity: { key: "antigravity", schema: antigravityThreadStateSchema },
  claude: { key: "claude", schema: claudeThreadStateSchema },
  codex: { key: "codex", schema: codexThreadStateSchema },
  copilot: { key: "copilot", schema: copilotThreadStateSchema },
  cursor: { key: "cursor", schema: cursorThreadStateSchema },
  grok: { key: "grok", schema: grokThreadStateSchema },
  opencode: { key: "opencode", schema: openCodeThreadStateSchema },
  pi: { key: "pi", schema: piThreadStateSchema },
} as const satisfies {
  [K in ThreadStateDriverKind]: ThreadStateBinding<ThreadStateByDriver[K]>;
} & Partial<Record<BuiltinDriverKind, ThreadStateBinding<unknown>>>;

/** Top-level keys that belong to Sentinel, not to a driver. */
export const RESERVED_THREAD_STATE_KEYS = [
  "permissionModeOverride",
  "repo",
] as const;

/**
 * Known keys are validated; any other key (a driver this build does not
 * know, written by a newer build or a fork) is carried through unchanged
 * instead of being stripped on the next write.
 */
export const threadChatEngineStateSchema = z
  .object({
    acp: THREAD_STATE_BINDINGS.acp.schema.nullish(),
    antigravity: THREAD_STATE_BINDINGS.antigravity.schema.nullish(),
    claude: THREAD_STATE_BINDINGS.claude.schema.nullish(),
    codex: THREAD_STATE_BINDINGS.codex.schema.nullish(),
    copilot: THREAD_STATE_BINDINGS.copilot.schema.nullish(),
    cursor: THREAD_STATE_BINDINGS.cursor.schema.nullish(),
    grok: THREAD_STATE_BINDINGS.grok.schema.nullish(),
    opencode: THREAD_STATE_BINDINGS.opencode.schema.nullish(),
    permissionModeOverride: z.enum(PERMISSION_MODES).nullish(),
    pi: THREAD_STATE_BINDINGS.pi.schema.nullish(),
    repo: repoThreadStateSchema.nullish(),
  })
  .partial()
  .catchall(z.unknown());

export type ThreadChatEngineState = z.infer<typeof threadChatEngineStateSchema>;

/** The schema of every key this build knows, by top-level key. */
const THREAD_STATE_KEY_SCHEMAS: Readonly<Record<string, z.ZodType>> =
  Object.fromEntries([
    ...Object.values(THREAD_STATE_BINDINGS).map(
      (binding) => [binding.key, binding.schema] as const,
    ),
    ["permissionModeOverride", z.enum(PERMISSION_MODES)] as const,
    ["repo", repoThreadStateSchema] as const,
  ]);

/** The identity a stamped driver state is checked against. */
export type ThreadStateInstanceRef = {
  continuationKey: string;
  id: string;
  isDefault: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getThreadStateBinding(
  kind: string,
): ThreadStateBinding<unknown> | null {
  return Object.hasOwn(THREAD_STATE_BINDINGS, kind)
    ? THREAD_STATE_BINDINGS[kind as ThreadStateDriverKind]
    : null;
}

/**
 * Reads a chat_engine_state value key by key: a malformed entry (a known
 * driver's state written by a fork or another build) is left out instead of
 * hiding repo, permissionModeOverride and every other driver's entry. Keys
 * this build does not know are carried through. Null for a non-object.
 *
 * Do not write the result back: use patchStoredThreadChatEngineState, which
 * keeps malformed and unknown entries exactly as stored.
 */
export function parseThreadChatEngineState(
  value: unknown,
): ThreadChatEngineState | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed = threadChatEngineStateSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  // Object.fromEntries defines own properties, so a stored "__proto__" key
  // stays data.
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const schema = Object.hasOwn(THREAD_STATE_KEY_SCHEMAS, key)
        ? THREAD_STATE_KEY_SCHEMAS[key]
        : null;
      if (!schema || entry == null) {
        return [[key, entry]];
      }
      const entryResult = schema.safeParse(entry);
      return entryResult.success ? [[key, entryResult.data]] : [];
    }),
  ) as ThreadChatEngineState;
}

/**
 * Whether a driver state may continue on `instance`. Stamped state must
 * carry the instance's continuation key; legacy state (written before
 * instances existed) only continues on the default instance.
 */
export function isThreadStateForInstance(
  state: ThreadStateSessionMeta,
  instance: ThreadStateInstanceRef,
) {
  if (state.continuationKey == null) {
    return (
      instance.isDefault &&
      (state.instanceId == null || state.instanceId === instance.id)
    );
  }

  return state.continuationKey === instance.continuationKey;
}

/**
 * A driver's state from a raw chat_engine_state value. Only the driver's own
 * entry is parsed, so a malformed entry of another driver does not hide it.
 * With `instance`, state from a different home or instance comes back null:
 * the runtime then starts a fresh native session and replays history.
 */
export function getDriverThreadState<K extends ThreadStateDriverKind>(
  kind: K,
  raw: unknown,
  instance?: ThreadStateInstanceRef,
): ThreadStateByDriver[K] | null;
export function getDriverThreadState(
  kind: string,
  raw: unknown,
  instance?: ThreadStateInstanceRef,
): unknown;
export function getDriverThreadState(
  kind: string,
  raw: unknown,
  instance?: ThreadStateInstanceRef,
): unknown {
  const binding = getThreadStateBinding(kind);
  if (!binding || !isRecord(raw)) {
    return null;
  }

  const value = raw[binding.key];
  if (value == null) {
    return null;
  }

  const parsed = binding.schema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  if (
    instance &&
    !isThreadStateForInstance(parsed.data as ThreadStateSessionMeta, instance)
  ) {
    return null;
  }

  return parsed.data;
}

/** Adds the {instanceId, continuationKey} stamp before a state is written. */
export function stampThreadState<S extends object>(
  state: S,
  instance: Pick<ThreadStateInstanceRef, "continuationKey" | "id">,
): S & { continuationKey: string; instanceId: string } {
  return {
    ...state,
    continuationKey: instance.continuationKey,
    instanceId: instance.id,
  };
}

/**
 * Shallow merge by top-level key. The result is null only when every key is
 * empty, so a thread that only holds permissionModeOverride (or a driver this
 * build does not know) keeps it.
 */
export function mergeThreadChatEngineState(
  current: ThreadChatEngineState | null | undefined,
  patch: ThreadChatEngineState | null | undefined,
): ThreadChatEngineState | null {
  const next: ThreadChatEngineState = {
    ...(current ?? {}),
    ...(patch ?? {}),
  };

  return Object.values(next).some((value) => value != null) ? next : null;
}

/**
 * The value to write back after applying `patch` to a stored
 * chat_engine_state. Starts from the stored object itself rather than a
 * parse of it, so every key the patch does not touch (another driver's
 * entry, one this build cannot parse, one it does not know) is written back
 * exactly as stored. Null when no key is left.
 */
export function patchStoredThreadChatEngineState(
  stored: unknown,
  patch: ThreadChatEngineState | null | undefined,
): ThreadChatEngineState | null {
  return mergeThreadChatEngineState(
    isRecord(stored) ? (stored as ThreadChatEngineState) : null,
    patch,
  );
}

/** A patch that sets (or with null clears) one driver's state. */
export function buildThreadChatEngineState<K extends ThreadStateDriverKind>(
  kind: K,
  value: ThreadStateByDriver[K] | null,
): ThreadChatEngineState;
export function buildThreadChatEngineState(
  kind: string,
  value: unknown,
): ThreadChatEngineState;
export function buildThreadChatEngineState(
  kind: string,
  value: unknown,
): ThreadChatEngineState {
  if ((RESERVED_THREAD_STATE_KEYS as readonly string[]).includes(kind)) {
    throw new Error(`"${kind}" is not a driver thread-state key.`);
  }

  const key = getThreadStateBinding(kind)?.key ?? kind;
  return { [key]: value };
}

export function getRepoThreadState(value: unknown): RepoThreadState | null {
  return parseThreadChatEngineState(value)?.repo ?? null;
}

export function getThreadPermissionMode(value: unknown): PermissionMode | null {
  return parseThreadChatEngineState(value)?.permissionModeOverride ?? null;
}
