import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  getInstanceRuntimeKey,
  recordResolvedBinary,
  resolveBinaryStandard,
  type BinaryVerifier,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { probeBinaryVersion } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import {
  buildPlanOutput,
  toPlanTasks,
  type PlanTask,
} from "@/lib/ai/chat/runtime/external/acp-updates";
import {
  isReadOnlyKind,
  resolvePermissionDisposition,
  type PermissionDispositionInput,
} from "@/lib/ai/chat/runtime/external/permissions";
import { UNATTENDED_DECLINE_MESSAGE } from "@/lib/ai/chat/runtime/unattended";
import type { ExternalQuestion } from "@/lib/ai/chat/runtime/external/user-input";

import {
  findEffortOption,
  readConfigOptions,
  type AcpCatalogModel,
} from "../config-options";
import type {
  AcpAgentDescriptor,
  AcpBinaryResolution,
  AcpExtContext,
} from "../descriptor";
import {
  asRecord,
  readArray,
  readBoolean,
  readNonEmptyString,
  readRecord,
  readString,
} from "../schema";

// Cursor Agent on the shared ACP engine (design acp-and-agents §3.1). The
// wire facts below were read from cursor-agent 2026.08.04's own ACP server:
// - `initialize` advertises loadSession (no resume), image prompts, http and
//   sse MCP servers, and the `cursor_login` method; sessions fail with the
//   ACP auth error (-32000) until the user is signed in, and `authenticate`
//   opens a browser sign-in when no credentials exist — so it is only sent
//   when a session asks for it, in interactive runs;
// - modes agent / plan / ask through session/set_mode (or the `mode` config
//   option); with `_meta.parameterizedModelPicker` the model option lists
//   models and each model's parameters (reasoning as category
//   `thought_level`) come as separate config options;
// - `cursor/list_available_models` lists every model with its parameters
//   without a session (the probe uses it instead of setting every model);
// - session/request_permission covers writes (kind edit with a diff),
//   deletes (kind edit, title "Delete `path`", no content), shell commands
//   (execute), MCP tools (other), web fetches (fetch) and web searches
//   (search), each only when Cursor's own allowlist did not approve it;
// - extension requests (verbatim method names): cursor/ask_question answered
//   `{outcome:{outcome:"answered", answers:[{questionId,
//   selectedOptionIds}]}}` (or skipped / cancelled), cursor/create_plan
//   answered `{outcome:{outcome:"accepted"}}`, and cursor/update_todos,
//   cursor/task and cursor/generate_image sent as requests whose answer is
//   ignored.

const CURSOR_VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}/;
const RESOLUTION_TTL_MS = 15_000;
const LEGACY_ENV_KEYS = ["SENTINEL_CURSOR_PATH"] as const;
const FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/usr/bin/fish"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** A `--version` line that looks like a Cursor Agent build ("2026.08.04-…"). */
export function isCursorAgentVersion(version: string | null | undefined) {
  return version != null && CURSOR_VERSION_PATTERN.test(version.trim());
}

function versionVerifier(requirePattern: boolean): BinaryVerifier {
  return async (candidatePath, env) => {
    const probe = await probeBinaryVersion({
      acceptFailureOutput: true,
      command: candidatePath,
      env,
    });
    if (!probe.launchable) {
      return null;
    }
    if (requirePattern && !isCursorAgentVersion(probe.version)) {
      return null;
    }
    return { path: candidatePath, version: probe.version };
  };
}

const resolutions = new Map<
  string,
  { expiresAt: number; promise: Promise<AcpBinaryResolution> }
>();

async function resolveCursorBinaryUncached(
  instance: ResolvedEngineInstance,
): Promise<AcpBinaryResolution> {
  const env = instance.env;
  const loginShell = {
    markers: getLoginShellMarkers("cursor"),
    shells: getLoginShellCandidates(env, FALLBACK_SHELLS),
  };
  // `cursor-agent` first. `agent` is a generic name other tools use too, so
  // a binary found under it must print a Cursor Agent version.
  const named = await resolveBinaryStandard({
    command: "cursor-agent",
    env,
    instance,
    legacyEnvKeys: LEGACY_ENV_KEYS,
    loginShell,
    strategy: "pathext-or-bare",
    verify: versionVerifier(false),
  });
  const resolved =
    named.resolved ??
    (
      await resolveBinaryStandard({
        command: "agent",
        env,
        instance,
        legacyEnvKeys: [],
        loginShell,
        strategy: "pathext-or-bare",
        verify: versionVerifier(true),
      })
    ).resolved;

  if (!resolved) {
    return {
      binary: null,
      error: named.rejectedOverride
        ? `Cursor Agent at ${named.rejectedOverride.path} is not launchable.`
        : "Cursor Agent was not found in PATH.",
    };
  }

  await recordResolvedBinary(resolved, {
    instanceId: instance.id,
    legacyEnvKey: instance.isDefault ? "SENTINEL_CURSOR_PATH" : null,
  });
  return {
    binary: {
      env: resolved.env,
      path: resolved.path,
      source: resolved.source,
      version: resolved.version,
    },
    error: null,
  };
}

export function resolveCursorBinary(
  instance: ResolvedEngineInstance,
  options: { forceRefresh?: boolean } = {},
) {
  const key = getInstanceRuntimeKey(instance);
  const cached = resolutions.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  const promise = resolveCursorBinaryUncached(instance);
  resolutions.set(key, { expiresAt: Date.now() + RESOLUTION_TTL_MS, promise });
  promise.catch(() => resolutions.delete(key));
  return promise;
}

/** cursor/ask_question params as questions for the user-input card. */
export function readCursorQuestions(params: unknown): ExternalQuestion[] {
  const title = readNonEmptyString(params, "title");
  return (readArray(params, "questions") ?? []).flatMap((raw, index) => {
    const id = readNonEmptyString(raw, "id") ?? `question-${index + 1}`;
    const prompt = readNonEmptyString(raw, "prompt");
    if (!prompt) {
      return [];
    }
    return [
      {
        ...(index === 0 && title ? { header: title } : {}),
        id,
        multiSelect: readBoolean(raw, "allowMultiple") === true,
        options: (readArray(raw, "options") ?? []).flatMap((option) => {
          const optionId = readNonEmptyString(option, "id");
          return optionId
            ? [
                {
                  id: optionId,
                  label: readNonEmptyString(option, "label") ?? optionId,
                },
              ]
            : [];
        }),
        question: prompt,
      },
    ];
  });
}

export async function answerCursorQuestions(
  params: unknown,
  context: AcpExtContext,
) {
  const questions = readCursorQuestions(params);
  if (questions.length === 0) {
    return {
      outcome: { outcome: "skipped", reason: "No questions to answer." },
    };
  }
  const response = await context.askUser({
    questions,
    title: readString(params, "title"),
    toolCallId:
      readNonEmptyString(params, "toolCallId") ??
      `cursor-question-${Date.now()}`,
  });
  if (!response) {
    return context.interactive
      ? { outcome: { outcome: "cancelled" } }
      : { outcome: { outcome: "skipped", reason: UNATTENDED_DECLINE_MESSAGE } };
  }
  const answers = response.answers
    .filter((answer) => answer.selectedOptionIds.length > 0)
    .map((answer) => ({
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds,
    }));
  if (answers.length === 0) {
    const text = [
      ...response.answers.flatMap((answer) =>
        answer.text ? [answer.text] : [],
      ),
      response.additionalContext,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      outcome: {
        outcome: "skipped",
        reason: text || "The user chose no option.",
      },
    };
  }
  return { outcome: { outcome: "answered", answers } };
}

function readTodoTasks(params: unknown) {
  const todos = readArray(params, "todos") ?? [];
  const phases = (readArray(params, "phases") ?? []).flatMap(
    (phase) => readArray(phase, "todos") ?? [],
  );
  return [...todos, ...phases];
}

export function showCursorPlan(params: unknown, context: AcpExtContext) {
  const toolCallId = readNonEmptyString(params, "toolCallId") ?? "cursor-plan";
  const overview = readString(params, "overview");
  context.mirror.upsertTool({
    id: `plan:${toolCallId}`,
    input: {},
    kind: "plan",
    output: buildPlanOutput({
      document: readString(params, "plan") ?? "",
      goal: overview ?? "Cursor proposed a plan.",
      summary: overview ?? "",
      tasks: toPlanTasks(readTodoTasks(params)),
      title: readNonEmptyString(params, "name") ?? "Cursor plan",
    }),
    status: "completed",
    toolName: "create_plan",
  });
  context.update();
  // Sentinel shows the plan with its own "Start implementation" action.
  return { outcome: { outcome: "accepted" } };
}

const TODOS_TOOL_ID = "cursor-todos";

type TodoTask = PlanTask & { id?: string };

export function updateCursorTodos(params: unknown, context: AcpExtContext) {
  const raw = readArray(params, "todos") ?? [];
  const incoming: TodoTask[] = toPlanTasks(raw).map((task, index) => {
    const id = readNonEmptyString(raw[index], "id");
    return id ? { ...task, id } : task;
  });
  const existing = context.mirror.getTool(TODOS_TOOL_ID);
  const previous =
    (asRecord(existing?.output)?.tasks as TodoTask[] | undefined) ?? [];
  let tasks = incoming;
  if (readBoolean(params, "merge") === true && previous.length > 0) {
    const byKey = new Map(
      previous.map((task) => [task.id ?? task.title, task] as const),
    );
    for (const task of incoming) {
      byKey.set(task.id ?? task.title, task);
    }
    tasks = [...byKey.values()];
  }
  context.mirror.upsertTool({
    id: TODOS_TOOL_ID,
    input: {},
    kind: "plan",
    output: buildPlanOutput({ tasks, title: "Updated todo list" }),
    status: "completed",
    toolName: "update_plan",
  });
  context.update();
}

export function describeCursorTask(params: unknown, context: AcpExtContext) {
  const toolCallId = readNonEmptyString(params, "toolCallId");
  if (!toolCallId) {
    return;
  }
  const subagentType =
    readRecord(params, "subagentType") ?? readString(params, "subagentType");
  context.mirror.upsertTool({
    id: toolCallId,
    input: {
      description: readString(params, "description"),
      prompt: readString(params, "prompt"),
    },
    kind: "subagent",
    meta: {
      ...(readString(params, "agentId")
        ? { agentId: readString(params, "agentId") }
        : {}),
      ...(readString(params, "model")
        ? { model: readString(params, "model") }
        : {}),
      ...(subagentType ? { subagentType } : {}),
    },
    ...(readString(params, "description")
      ? { title: readString(params, "description") }
      : {}),
  });
  context.update();
}

const IMAGE_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function showCursorImage(params: unknown, context: AcpExtContext) {
  const filePath = readNonEmptyString(params, "filePath");
  const mediaType = filePath
    ? IMAGE_TYPES[path.extname(filePath).toLowerCase()]
    : undefined;
  if (!filePath || !mediaType || !path.isAbsolute(filePath)) {
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_IMAGE_BYTES) {
      return;
    }
    const data = await readFile(filePath);
    context.mirror.appendFile({
      filename: path.basename(filePath),
      mediaType,
      url: `data:${mediaType};base64,${data.toString("base64")}`,
    });
    context.update();
  } catch {
    // Best effort: the image card is optional.
  }
}

/**
 * Cursor asks only for what its own permission settings did not allow, and
 * never for a local read: a request of kind search is a web search, fetch a
 * web fetch. The shared policy's automatic approval of read-only kinds
 * therefore never applies; everything else follows the shared policy
 * (deletes come as kind edit with no file, so accept_edits still asks).
 */
export function cursorPermissionDisposition(input: PermissionDispositionInput) {
  return isReadOnlyKind(input.kind)
    ? resolvePermissionDisposition({ ...input, kind: "other" })
    : null;
}

/** cursor/list_available_models → catalog models with their effort options. */
export function readCursorModelList(result: unknown): AcpCatalogModel[] {
  return (readArray(result, "models") ?? []).flatMap((model) => {
    const id =
      readNonEmptyString(model, "value") ?? readNonEmptyString(model, "id");
    if (!id) {
      return [];
    }
    return [
      {
        effortOption: findEffortOption(
          readConfigOptions(readArray(model, "configOptions") ?? []),
        ),
        id,
        name: readNonEmptyString(model, "name") ?? id,
      },
    ];
  });
}

export const cursorAcpAgent: AcpAgentDescriptor = {
  auth: {
    loginHint: (binaryPath) =>
      `run \`${binaryPath ? path.basename(binaryPath) : "agent"} login\` in a terminal`,
    methodId: (methods) =>
      methods.find((method) => method.id === "cursor_login")?.id ??
      methods.find((method) => method.kind === "agent")?.id ??
      null,
    strategy: "lazy",
    timeoutMs: 3 * 60_000,
  },
  cancelGraceMs: 5_000,
  clientCapabilitiesMeta: { parameterizedModelPicker: true },
  driver: "cursor",
  fallbackModels: [{ id: "default", isDefault: true, name: "Auto" }],
  extNotifications: {
    "cursor/generate_image": showCursorImage,
    "cursor/task": describeCursorTask,
    "cursor/update_todos": updateCursorTodos,
  },
  extRequests: {
    "cursor/ask_question": answerCursorQuestions,
    "cursor/create_plan": async (params, context) =>
      showCursorPlan(params, context),
  },
  id: "cursor",
  invalidate: () => resolutions.clear(),
  label: "Cursor",
  launchArgs: ["acp"],
  permissionDisposition: cursorPermissionDisposition,
  permissionModes: DRIVER_CATALOG.cursor.capabilities.permissionModes,
  planMode: "native",
  probe: {
    async listModels(process, options) {
      const result = await process.request(
        "cursor/list_available_models",
        {},
        { timeoutMs: options.timeoutMs },
      );
      return readCursorModelList(result);
    },
    timeoutMs: 8_000,
  },
  processLabel: "Cursor Agent",
  resolveBinary: resolveCursorBinary,
  session: { prefer: "load" },
  toolPrefix: "cursor_",
};
