// Lenient readers for what ACP agents send. The SDK's inbound zod schemas
// strip unknown keys and reject shapes outside the 1.7 union (vendor update
// kinds, legacy auth methods, _meta-heavy payloads), so every frame Sentinel
// consumes goes through these instead: read what is there, ignore the rest,
// never throw. Client-safe: no Node imports.

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function readString(value: unknown, key: string): string | null {
  const field = asRecord(value)?.[key];
  return typeof field === "string" ? field : null;
}

export function readNonEmptyString(value: unknown, key: string) {
  const field = readString(value, key)?.trim();
  return field ? field : null;
}

export function readNumber(value: unknown, key: string): number | null {
  const field = asRecord(value)?.[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

export function readBoolean(value: unknown, key: string): boolean | null {
  const field = asRecord(value)?.[key];
  return typeof field === "boolean" ? field : null;
}

export function readArray(value: unknown, key: string): unknown[] | null {
  const field = asRecord(value)?.[key];
  return Array.isArray(field) ? field : null;
}

export function readRecord(value: unknown, key: string): JsonRecord | null {
  return asRecord(asRecord(value)?.[key]);
}

/** A `session/update` notification, whatever its update kind. */
export type AcpSessionUpdateEnvelope = {
  /** `params._meta` (Grok puts promptId there). */
  meta: JsonRecord | null;
  sessionId: string | null;
  update: AcpRawUpdate;
};

export type AcpRawUpdate = JsonRecord & { sessionUpdate: string };

export function parseSessionUpdateEnvelope(
  params: unknown,
): AcpSessionUpdateEnvelope | null {
  const record = asRecord(params);
  const update = readRecord(record, "update");
  const kind = readString(update, "sessionUpdate");
  if (!record || !update || !kind) {
    return null;
  }

  return {
    meta: readRecord(record, "_meta"),
    sessionId: readString(record, "sessionId"),
    update: update as AcpRawUpdate,
  };
}

export type AcpAuthMethodKind = "agent" | "env_var" | "terminal";

/** One advertised auth method, whichever schema generation it uses. */
export type AcpAuthMethodInfo = {
  /** Terminal methods: extra launch arguments. */
  args: string[];
  description: string | null;
  /** Terminal methods: extra environment. */
  env: Record<string, string>;
  id: string;
  kind: AcpAuthMethodKind;
  link: string | null;
  name: string;
  /** env_var methods: the variables the agent reads. */
  vars: Array<{ label: string | null; name: string; optional: boolean }>;
};

function readStringRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Auth methods from an initialize response. Untyped and `type:"agent"` are
 * agent methods; `terminal` runs a login command; `env_var` (registry
 * agents, or `_meta.vars`) names variables the user sets on the instance.
 */
export function readAuthMethods(
  initializeResult: unknown,
): AcpAuthMethodInfo[] {
  const methods = readArray(initializeResult, "authMethods") ?? [];
  return methods.flatMap((raw) => {
    const id = readNonEmptyString(raw, "id");
    if (!id) {
      return [];
    }

    const type = readString(raw, "type");
    const meta = readRecord(raw, "_meta");
    const vars = (readArray(raw, "vars") ?? readArray(meta, "vars") ?? [])
      .map((entry) =>
        typeof entry === "string"
          ? { label: null, name: entry, optional: false }
          : {
              label: readString(entry, "label"),
              name: readNonEmptyString(entry, "name") ?? "",
              optional: readBoolean(entry, "optional") === true,
            },
      )
      .filter((entry) => entry.name.length > 0);
    const kind: AcpAuthMethodKind =
      type === "terminal"
        ? "terminal"
        : type === "env_var" || (type == null && vars.length > 0)
          ? "env_var"
          : "agent";

    return [
      {
        args: (readArray(raw, "args") ?? []).filter(
          (arg): arg is string => typeof arg === "string",
        ),
        description: readString(raw, "description"),
        env: readStringRecord(asRecord(raw)?.env),
        id,
        kind,
        link: readString(raw, "link"),
        name: readNonEmptyString(raw, "name") ?? id,
        vars,
      },
    ];
  });
}

/** What Sentinel reads from `agentCapabilities`. */
export type AcpAgentCapabilityFlags = {
  additionalDirectories: boolean;
  audioPrompts: boolean;
  closeSession: boolean;
  embeddedContext: boolean;
  imagePrompts: boolean;
  loadSession: boolean;
  mcpHttp: boolean;
  mcpSse: boolean;
  resumeSession: boolean;
};

export function readAgentCapabilities(
  initializeResult: unknown,
): AcpAgentCapabilityFlags {
  const capabilities = readRecord(initializeResult, "agentCapabilities");
  const prompt = readRecord(capabilities, "promptCapabilities");
  const mcp = readRecord(capabilities, "mcpCapabilities");
  const session = readRecord(capabilities, "sessionCapabilities");
  // Some agents (older Cursor builds) put resume under `session`.
  const legacySession = readRecord(capabilities, "session");
  const has = (record: JsonRecord | null, key: string) =>
    record != null && record[key] != null && record[key] !== false;

  return {
    additionalDirectories: has(session, "additionalDirectories"),
    audioPrompts: readBoolean(prompt, "audio") === true,
    closeSession: has(session, "close"),
    embeddedContext: readBoolean(prompt, "embeddedContext") === true,
    imagePrompts: readBoolean(prompt, "image") === true,
    loadSession: readBoolean(capabilities, "loadSession") === true,
    mcpHttp: readBoolean(mcp, "http") === true,
    mcpSse: readBoolean(mcp, "sse") === true,
    resumeSession: has(session, "resume") || has(legacySession, "resume"),
  };
}

export type AcpAgentInfo = {
  name: string | null;
  title: string | null;
  version: string | null;
};

export function readAgentInfo(initializeResult: unknown): AcpAgentInfo {
  const info = readRecord(initializeResult, "agentInfo");
  return {
    name: readString(info, "name"),
    title: readString(info, "title"),
    version: readString(info, "version"),
  };
}

export type AcpModeInfo = {
  description: string | null;
  id: string;
  name: string;
};

export type AcpModeState = {
  availableModes: AcpModeInfo[];
  currentModeId: string | null;
};

export function readModeState(value: unknown): AcpModeState | null {
  const modes = asRecord(value);
  if (!modes) {
    return null;
  }

  return {
    availableModes: (readArray(modes, "availableModes") ?? []).flatMap(
      (mode) => {
        const id = readNonEmptyString(mode, "id");
        return id
          ? [
              {
                description: readString(mode, "description"),
                id,
                name: readNonEmptyString(mode, "name") ?? id,
              },
            ]
          : [];
      },
    ),
    currentModeId: readString(modes, "currentModeId"),
  };
}

export type AcpLegacyModelInfo = { modelId: string; name: string };

/** The unstable `models` state some agents still return (`session/set_model`). */
export function readLegacyModelState(value: unknown) {
  const models = asRecord(value);
  if (!models) {
    return null;
  }

  return {
    availableModels: (readArray(models, "availableModels") ?? []).flatMap(
      (model): AcpLegacyModelInfo[] => {
        const modelId = readNonEmptyString(model, "modelId");
        return modelId
          ? [{ modelId, name: readNonEmptyString(model, "name") ?? modelId }]
          : [];
      },
    ),
    currentModelId: readString(models, "currentModelId"),
  };
}

export type AcpCommandInfo = {
  description: string | null;
  inputHint: string | null;
  name: string;
};

export function readAvailableCommands(value: unknown): AcpCommandInfo[] {
  const commands = Array.isArray(value)
    ? value
    : (readArray(value, "availableCommands") ?? []);
  return commands.flatMap((command) => {
    const name = readNonEmptyString(command, "name");
    return name
      ? [
          {
            description: readString(command, "description"),
            inputHint: readString(readRecord(command, "input"), "hint"),
            name,
          },
        ]
      : [];
  });
}

export type AcpPermissionOptionKind =
  "allow_always" | "allow_once" | "reject_always" | "reject_once";

export type AcpPermissionOptionInfo = {
  kind: AcpPermissionOptionKind | null;
  name: string;
  optionId: string;
};

const PERMISSION_OPTION_KINDS = new Set<string>([
  "allow_always",
  "allow_once",
  "reject_always",
  "reject_once",
]);

export function readPermissionOptions(
  value: unknown,
): AcpPermissionOptionInfo[] {
  const options = Array.isArray(value)
    ? value
    : (readArray(value, "options") ?? []);
  return options.flatMap((option) => {
    const optionId = readNonEmptyString(option, "optionId");
    if (!optionId) {
      return [];
    }
    const kind = readString(option, "kind");
    return [
      {
        kind:
          kind && PERMISSION_OPTION_KINDS.has(kind)
            ? (kind as AcpPermissionOptionKind)
            : null,
        name: readNonEmptyString(option, "name") ?? optionId,
        optionId,
      },
    ];
  });
}

/** Stop reasons ACP defines; anything else (or none) reads as end_turn. */
export const ACP_STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
] as const;

export type AcpStopReason = (typeof ACP_STOP_REASONS)[number];

export function readStopReason(promptResponse: unknown): AcpStopReason | null {
  const value = readString(promptResponse, "stopReason");
  return value && (ACP_STOP_REASONS as readonly string[]).includes(value)
    ? (value as AcpStopReason)
    : null;
}

export type AcpPromptUsage = {
  cachedReadTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  thoughtTokens: number | null;
  totalTokens: number | null;
};

export function readPromptUsage(
  promptResponse: unknown,
): AcpPromptUsage | null {
  const usage = readRecord(promptResponse, "usage");
  if (!usage) {
    return null;
  }
  return {
    cachedReadTokens: readNumber(usage, "cachedReadTokens"),
    inputTokens: readNumber(usage, "inputTokens"),
    outputTokens: readNumber(usage, "outputTokens"),
    thoughtTokens: readNumber(usage, "thoughtTokens"),
    totalTokens: readNumber(usage, "totalTokens"),
  };
}
