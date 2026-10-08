import "server-only";

import {
  query as sdkQuery,
  type SDKControlGetUsageResponse,
} from "@anthropic-ai/claude-agent-sdk";

import { withTimeout } from "@/lib/runtime/process/with-timeout";

import {
  makeUnavailableEngineUsageLimits,
  type EngineUsageLimits,
} from "../contract";
import {
  claudeUsageResponseToLimits,
  setClaudeScopedLimitNames,
} from "../usage/claude";
import {
  buildClaudeIdleQueryOptions,
  createIdleClaudePrompt,
  resolveClaudeCodeRuntime,
  type ClaudeRuntimeInstance,
} from "./index";

// Claude plan usage through the Agent SDK's usage control request, on an
// idle query like the status probe (no turn is ever sent). The request is
// experimental in the SDK, so it is looked up at run time: an SDK without
// it reports usage as unsupported instead of failing.

const INITIALIZE_TIMEOUT_MS = 8_000;
const USAGE_TIMEOUT_MS = 10_000;
const USAGE_METHOD =
  "usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET";

type UsageCapableQuery = {
  close(): void;
  initializationResult(): Promise<unknown>;
  [USAGE_METHOD]?: (options?: {
    skipBehaviors?: boolean;
  }) => Promise<SDKControlGetUsageResponse>;
};

export type ClaudeUsageReadDeps = {
  now?: () => number;
  query?: (input: {
    options: ReturnType<typeof buildClaudeIdleQueryOptions>;
    prompt: ReturnType<typeof createIdleClaudePrompt>;
  }) => UsageCapableQuery;
  resolveRuntime?: typeof resolveClaudeCodeRuntime;
};

export async function readClaudeUsageLimits(
  instance: ClaudeRuntimeInstance & { id: string },
  options: { signal: AbortSignal },
  deps: ClaudeUsageReadDeps = {},
): Promise<EngineUsageLimits> {
  const checkedAt = () => new Date((deps.now ?? Date.now)()).toISOString();
  const failed = (message: string) =>
    makeUnavailableEngineUsageLimits({
      checkedAt: checkedAt(),
      message,
      reason: "probeFailed",
    });

  const runtime = await (deps.resolveRuntime ?? resolveClaudeCodeRuntime)({
    instance,
  });
  if (!runtime.executablePath) {
    return failed("Claude Code is not available to read usage.");
  }

  const promptAbortController = new AbortController();
  let claudeQuery: UsageCapableQuery | null = null;
  try {
    claudeQuery = (deps.query ?? (sdkQuery as never))({
      options: buildClaudeIdleQueryOptions(runtime),
      prompt: createIdleClaudePrompt(promptAbortController.signal),
    });
    const readUsage = claudeQuery[USAGE_METHOD];
    if (typeof readUsage !== "function") {
      return makeUnavailableEngineUsageLimits({
        checkedAt: checkedAt(),
        message: "This Claude Code SDK does not report plan usage.",
        reason: "unsupported",
      });
    }

    const initialized = await withTimeout(
      claudeQuery.initializationResult(),
      INITIALIZE_TIMEOUT_MS,
      { nullOnError: true, signal: options.signal },
    );
    if (!initialized) {
      return failed("Claude Code did not start in time to read usage.");
    }

    const query = claudeQuery;
    const response = await withTimeout(
      // Only the plan windows: skip the local transcript scan.
      readUsage.call(query, { skipBehaviors: true }),
      USAGE_TIMEOUT_MS,
      { nullOnError: true, signal: options.signal },
    );
    if (!response) {
      return failed("Claude Code did not report usage.");
    }

    const { limits, names } = claudeUsageResponseToLimits({
      checkedAt: checkedAt(),
      response,
    });
    setClaudeScopedLimitNames(instance.id, names);
    return limits;
  } catch {
    return failed("Claude Code could not read usage.");
  } finally {
    claudeQuery?.close();
    promptAbortController.abort();
  }
}
