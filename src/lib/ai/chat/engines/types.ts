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
import {
  getDriverThreadState,
  type ThreadStateInstanceRef,
} from "./state/registry";

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
  patchStoredThreadChatEngineState,
  stampThreadState,
  threadChatEngineStateSchema,
  type ThreadChatEngineState,
  type ThreadStateBinding,
  type ThreadStateByDriver,
  type ThreadStateDriverKind,
  type ThreadStateInstanceRef,
} from "./state/registry";

export const chatEngineSchema = z.enum(CHAT_ENGINES);

// With `instance`, the getters return null for state written under another
// instance or home (continuation key mismatch): the runtime then starts a
// fresh native session. Read without it where any stored session must be
// reached (stopping a run, answering its approvals).

export function getCodexThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): CodexThreadState | null {
  return getDriverThreadState("codex", value, instance ?? undefined);
}

export function getClaudeThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): ClaudeThreadState | null {
  return getDriverThreadState("claude", value, instance ?? undefined);
}

export function getCopilotThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): CopilotThreadState | null {
  return getDriverThreadState("copilot", value, instance ?? undefined);
}

export function getCursorThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): CursorThreadState | null {
  return getDriverThreadState("cursor", value, instance ?? undefined);
}

export function getOpenCodeThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): OpenCodeThreadState | null {
  return getDriverThreadState("opencode", value, instance ?? undefined);
}

export function getAcpThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): AcpThreadState | null {
  return getDriverThreadState("acp", value, instance ?? undefined);
}

export function getPiThreadState(
  value: unknown,
  instance?: ThreadStateInstanceRef | null,
): PiThreadState | null {
  return getDriverThreadState("pi", value, instance ?? undefined);
}
