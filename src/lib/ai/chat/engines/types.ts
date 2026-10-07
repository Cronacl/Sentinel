// Compatibility facade. Driver thread-state schemas live in ./state/* and the
// generic registry in ./state/registry.ts; runtimes keep importing the named
// getters from here.
import { z } from "zod";

import { CHAT_ENGINES } from "@/server/db/enums";

import type { AcpThreadState } from "./state/acp";
import type { ClaudeThreadState } from "./state/claude";
import type { CodexThreadState } from "./state/codex";
import type { CopilotThreadState } from "./state/copilot";
import type { CursorThreadState } from "./state/cursor";
import type { OpenCodeThreadState } from "./state/opencode";
import type { PiThreadState } from "./state/pi";
import { getDriverThreadState } from "./state/registry";

export { acpThreadStateSchema } from "./state/acp";
export type { AcpThreadState } from "./state/acp";
export {
  antigravityThreadStateSchema,
  type AntigravityThreadState,
} from "./state/antigravity";
export {
  claudePermissionModeSchema,
  claudeThreadStateSchema,
  type ClaudePermissionMode,
  type ClaudeThreadState,
} from "./state/claude";
export {
  codexApprovalPolicySchema,
  codexSandboxModeSchema,
  codexThreadStateSchema,
  type CodexApprovalPolicy,
  type CodexSandboxMode,
  type CodexThreadState,
} from "./state/codex";
export {
  copilotThreadStateSchema,
  type CopilotThreadState,
} from "./state/copilot";
export {
  cursorThreadStateSchema,
  type CursorThreadState,
} from "./state/cursor";
export { grokThreadStateSchema, type GrokThreadState } from "./state/grok";
export {
  openCodeThreadStateSchema,
  type OpenCodeThreadState,
} from "./state/opencode";
export { piThreadStateSchema, type PiThreadState } from "./state/pi";
export {
  repoLastPullRequestSchema,
  repoProjectModeSchema,
  repoThreadStateSchema,
  type RepoLastPullRequest,
  type RepoProjectMode,
  type RepoThreadState,
} from "./state/repo";
export {
  THREAD_STATE_BINDINGS,
  buildThreadChatEngineState,
  getDriverThreadState,
  getRepoThreadState,
  getThreadPermissionMode,
  isThreadStateForInstance,
  mergeThreadChatEngineState,
  parseThreadChatEngineState,
  stampThreadState,
  threadChatEngineStateSchema,
  type ThreadChatEngineState,
  type ThreadStateBinding,
  type ThreadStateByDriver,
  type ThreadStateDriverKind,
  type ThreadStateInstanceRef,
} from "./state/registry";

export const chatEngineSchema = z.enum(CHAT_ENGINES);

export function getCodexThreadState(value: unknown): CodexThreadState | null {
  return getDriverThreadState("codex", value);
}

export function getClaudeThreadState(value: unknown): ClaudeThreadState | null {
  return getDriverThreadState("claude", value);
}

export function getCopilotThreadState(
  value: unknown,
): CopilotThreadState | null {
  return getDriverThreadState("copilot", value);
}

export function getCursorThreadState(value: unknown): CursorThreadState | null {
  return getDriverThreadState("cursor", value);
}

export function getOpenCodeThreadState(
  value: unknown,
): OpenCodeThreadState | null {
  return getDriverThreadState("opencode", value);
}

export function getAcpThreadState(value: unknown): AcpThreadState | null {
  return getDriverThreadState("acp", value);
}

export function getPiThreadState(value: unknown): PiThreadState | null {
  return getDriverThreadState("pi", value);
}
