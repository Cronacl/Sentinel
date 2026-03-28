import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateObject } from "ai";
import { z } from "zod";

import { spawnCodexCli } from "@/lib/ai/chat/engines/codex-cli";
import {
  getReasoningProviderOptions,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";
import { normalizeSelectedModelId } from "@/lib/ai/providers/model-selection";
import type { ChatEngine } from "@/server/db/enums";

type ChildProcessLike = {
  stdin: {
    end: (chunk?: string) => void;
  };
  stderr: {
    on: (event: "data", listener: (chunk: Buffer | string) => void) => void;
  };
  stdout: {
    on: (event: "data", listener: (chunk: Buffer | string) => void) => void;
  };
  on: (
    event: "close" | "error",
    listener: ((code: number | null) => void) | ((error: Error) => void),
  ) => void;
  kill?: () => void;
};

type CommitMessagePromptInput = {
  branch: string | null;
  patch: string;
  summary: string;
};

export type CommitMessageGenerationContext = {
  branch: string | null;
  patch: string;
  repoRoot: string;
  summary: string;
};

export type GeneratedCommitMessage = {
  body: string;
  message: string;
  subject: string;
};

type GenerateCommitMessageInput = {
  context: CommitMessageGenerationContext;
  defaultChatModelId?: string | null;
  engine: ChatEngine;
  modelId: string | null;
  reasoningEffort?: ReasoningEffort | null;
  userId: string;
};

type GenerateCodexCommitMessageInput = {
  context: CommitMessageGenerationContext;
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
};

type GenerateClaudeCommitMessageInput = {
  context: CommitMessageGenerationContext;
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
};

type GenerateSentinelCommitMessageInput = {
  context: CommitMessageGenerationContext;
  defaultChatModelId?: string | null;
  modelId: string | null;
  reasoningEffort?: ReasoningEffort | null;
  userId: string;
};

type GenerateCodexDependencies = {
  createProcess?: (input: {
    args: string[];
    cwd: string;
  }) => Promise<ChildProcessLike>;
};

type GenerateClaudeDependencies = {
  spawnProcess?: (input: {
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
  }) => ChildProcessLike;
};

const CODEX_TIMEOUT_MS = 180_000;
const CLAUDE_TIMEOUT_MS = 180_000;
const CODEX_DEFAULT_REASONING_EFFORT = "low";

const COMMIT_MESSAGE_OUTPUT_SCHEMA = z.object({
  body: z.string(),
  subject: z.string(),
});

const CLAUDE_OUTPUT_ENVELOPE_SCHEMA = z.object({
  structured_output: COMMIT_MESSAGE_OUTPUT_SCHEMA,
});

function getCommitMessageJsonSchema() {
  return {
    additionalProperties: false,
    properties: {
      body: {
        type: "string",
      },
      subject: {
        type: "string",
      },
    },
    required: ["subject", "body"],
    type: "object",
  } as const;
}

export function limitCommitSection(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated]`;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  return [
    "You write concise git commit messages.",
    "Return a JSON object with keys: subject, body.",
    "Rules:",
    "- subject must be imperative, <= 72 chars, and no trailing period",
    "- body can be empty string or short bullet points",
    "- capture the primary user-visible or developer-visible change",
    "",
    `Branch: ${input.branch ?? "(detached)"}`,
    "",
    "Changed files:",
    limitCommitSection(input.summary, 6_000),
    "",
    "Working tree patch:",
    limitCommitSection(input.patch, 40_000),
  ].join("\n");
}

export function sanitizeCommitSubject(raw: string) {
  const singleLine = raw.trim().split(/\r?\n/g)[0]?.trim() ?? "";
  const withoutTrailingPeriod = singleLine.replace(/[.]+$/g, "").trim();

  if (!withoutTrailingPeriod) {
    return "Update project files";
  }

  if (withoutTrailingPeriod.length <= 72) {
    return withoutTrailingPeriod;
  }

  return withoutTrailingPeriod.slice(0, 72).trimEnd();
}

export function sanitizeCommitBody(raw: string) {
  return raw.trim();
}

export function formatCommitMessage(subject: string, body: string) {
  const normalizedSubject = sanitizeCommitSubject(subject);
  const normalizedBody = sanitizeCommitBody(body);

  return normalizedBody
    ? `${normalizedSubject}\n\n${normalizedBody}`
    : normalizedSubject;
}

export function parseCommitMessage(message: string) {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return {
      body: "",
      subject: "",
    };
  }

  const [subjectLine = ""] = normalized.split("\n");
  const subject = subjectLine.trim();
  const body = normalized.slice(subjectLine.length).replace(/^\n+/, "").trim();

  return {
    body,
    subject,
  };
}

function normalizeCommitResult(
  result: z.infer<typeof COMMIT_MESSAGE_OUTPUT_SCHEMA>,
) {
  const subject = sanitizeCommitSubject(result.subject);
  const body = sanitizeCommitBody(result.body);

  return {
    body,
    message: formatCommitMessage(subject, body),
    subject,
  } satisfies GeneratedCommitMessage;
}

async function resolveSentinelGenerationModel(input: {
  defaultChatModelId?: string | null;
  modelId: string | null;
  reasoningEffort?: ReasoningEffort | null;
  userId: string;
}) {
  const [
    { getEnabledModels, getLanguageModel, parseModelId },
    { resolveThreadTitleModel },
  ] = await Promise.all([
    import("@/lib/ai/providers/resolver"),
    import("@/lib/ai/chat/title/model"),
  ]);
  const enabledModels = await getEnabledModels(input.userId);
  if (enabledModels.length === 0) {
    return null;
  }

  const normalizedThreadModelId = normalizeSelectedModelId(
    input.modelId,
    enabledModels,
  );
  if (normalizedThreadModelId) {
    const { model, provider } = parseModelId(normalizedThreadModelId);

    return {
      languageModel: await getLanguageModel(
        input.userId,
        normalizedThreadModelId,
      ),
      providerOptions: getReasoningProviderOptions(
        provider,
        model,
        input.reasoningEffort,
      ),
    };
  }

  const normalizedDefaultModelId =
    normalizeSelectedModelId(input.defaultChatModelId ?? null, enabledModels) ??
    enabledModels[0]?.compositeId ??
    null;

  if (!normalizedDefaultModelId) {
    return null;
  }

  const { provider } = parseModelId(normalizedDefaultModelId);

  return await resolveThreadTitleModel({
    providerId: provider,
    userId: input.userId,
  });
}

async function collectProcessResult({
  child,
  input,
  timeoutMs,
}: {
  child: ChildProcessLike;
  input: string;
  timeoutMs: number;
}) {
  return await new Promise<{
    code: number;
    stderr: string;
    stdout: string;
  }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      child.kill?.();
      finish(() => reject(new Error("Request timed out.")));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: Error) => {
      finish(() => reject(error));
    });
    child.on("close", (code: number | null) => {
      finish(() =>
        resolve({
          code: code ?? 1,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        }),
      );
    });

    child.stdin.end(input);
  });
}

function mapClaudeEffort(effort: ReasoningEffort | null | undefined) {
  switch (effort) {
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "minimal":
    case "low":
      return "low";
    default:
      return null;
  }
}

async function createTempDirectory(prefix: string) {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

async function cleanupTempDirectory(directory: string) {
  await rm(directory, { force: true, recursive: true }).catch(() => undefined);
}

export async function generateSentinelCommitMessage(
  input: GenerateSentinelCommitMessageInput,
) {
  const model = await resolveSentinelGenerationModel({
    defaultChatModelId: input.defaultChatModelId,
    modelId: input.modelId,
    reasoningEffort: input.reasoningEffort,
    userId: input.userId,
  });
  if (!model) {
    throw new Error("No enabled model is available for commit generation.");
  }

  const result = await generateObject({
    model: model.languageModel as Parameters<typeof generateObject>[0]["model"],
    output: "object",
    prompt: buildCommitMessagePrompt(input.context),
    schema: COMMIT_MESSAGE_OUTPUT_SCHEMA,
    ...(model.providerOptions
      ? { providerOptions: model.providerOptions }
      : {}),
  });

  return normalizeCommitResult(result.object);
}

export async function generateCodexCommitMessage(
  input: GenerateCodexCommitMessageInput,
  dependencies?: GenerateCodexDependencies,
) {
  const createProcess =
    dependencies?.createProcess ??
    (async ({ args, cwd }: { args: string[]; cwd: string }) =>
      (await spawnCodexCli(args, {
        cwd,
      })) as ChildProcessWithoutNullStreams);

  const tempDirectory = await createTempDirectory("sentinel-codex-commit-");
  const schemaPath = path.join(tempDirectory, "schema.json");
  const outputPath = path.join(tempDirectory, "output.json");

  try {
    await writeFile(
      schemaPath,
      JSON.stringify(getCommitMessageJsonSchema()),
      "utf8",
    );
    await writeFile(outputPath, "", "utf8");

    const reasoningEffort =
      input.reasoningEffort ?? CODEX_DEFAULT_REASONING_EFFORT;
    const child = await createProcess({
      args: [
        "exec",
        "-s",
        "read-only",
        "--model",
        input.modelId,
        "--config",
        `model_reasoning_effort="${reasoningEffort}"`,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ],
      cwd: input.context.repoRoot,
    });

    const result = await collectProcessResult({
      child,
      input: buildCommitMessagePrompt(input.context),
      timeoutMs: CODEX_TIMEOUT_MS,
    });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Codex CLI failed.");
    }

    const output = await readFile(outputPath, "utf8");
    const parsed = COMMIT_MESSAGE_OUTPUT_SCHEMA.parse(JSON.parse(output));
    return normalizeCommitResult(parsed);
  } finally {
    await cleanupTempDirectory(tempDirectory);
  }
}

export async function generateClaudeCommitMessage(
  input: GenerateClaudeCommitMessageInput,
  dependencies?: GenerateClaudeDependencies,
) {
  const spawnProcess =
    dependencies?.spawnProcess ??
    (({
      args,
      cwd,
      env,
    }: {
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
    }) =>
      spawn("claude", args, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams);

  const mappedEffort = mapClaudeEffort(input.reasoningEffort ?? null);
  const child = spawnProcess({
    args: [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(getCommitMessageJsonSchema()),
      "--model",
      input.modelId,
      ...(mappedEffort ? ["--effort", mappedEffort] : []),
      "--dangerously-skip-permissions",
    ],
    cwd: input.context.repoRoot,
    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP:
        process.env.CLAUDE_AGENT_SDK_CLIENT_APP ?? "sentinel",
    },
  });

  const result = await collectProcessResult({
    child,
    input: buildCommitMessagePrompt(input.context),
    timeoutMs: CLAUDE_TIMEOUT_MS,
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Claude CLI failed.");
  }

  const envelope = CLAUDE_OUTPUT_ENVELOPE_SCHEMA.parse(
    JSON.parse(result.stdout),
  );
  return normalizeCommitResult(envelope.structured_output);
}

export async function generateGitCommitMessage(
  input: GenerateCommitMessageInput,
) {
  if (input.engine === "codex" && input.modelId) {
    return await generateCodexCommitMessage({
      context: input.context,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
    });
  }

  if (input.engine === "claude" && input.modelId) {
    return await generateClaudeCommitMessage({
      context: input.context,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
    });
  }

  return await generateSentinelCommitMessage({
    context: input.context,
    defaultChatModelId: input.defaultChatModelId,
    modelId: input.engine === "sentinel" ? input.modelId : null,
    reasoningEffort: input.reasoningEffort,
    userId: input.userId,
  });
}
