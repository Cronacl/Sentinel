import type {
  PermissionRequest,
  PermissionRequestResult,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";

import type { ReasoningEffort } from "@/lib/ai/providers/models";

import type { ToolApprovalPolicyMap } from "../../tools/policy";

type CopilotReasoningEffort = NonNullable<SessionConfig["reasoningEffort"]>;

const COPILOT_READ_TOOL_POLICIES = [
  "read",
  "list",
  "glob",
  "grep",
  "diff",
  "batch_read",
  "load_document",
] as const;

const COPILOT_WRITE_TOOL_POLICIES = [
  "edit",
  "multiedit",
  "create_file",
  "move_file",
  "delete_file",
  "apply_patch",
] as const;

// SDK 1.x permission decisions. The runtime reports outcomes such as
// "approved" or "denied-interactively-by-user" on session events; handlers
// answer with the present-tense decisions below.
export const COPILOT_AUTO_APPROVED_PERMISSION = {
  kind: "approve-once",
} as const satisfies PermissionRequestResult;

export const COPILOT_USER_APPROVED_PERMISSION = {
  approvedInteractively: true,
  kind: "approve-once",
} as const satisfies PermissionRequestResult;

// The run ended (stopped, failed or went idle) before the user answered.
export const COPILOT_USER_UNAVAILABLE_PERMISSION = {
  kind: "user-not-available",
} as const satisfies PermissionRequestResult;

export function buildCopilotRejectedPermission(
  feedback?: string | null,
): PermissionRequestResult {
  return feedback?.trim()
    ? { feedback: feedback.trim(), kind: "reject" }
    : { kind: "reject" };
}

export function buildCopilotPermissionToolName(request: PermissionRequest) {
  switch (request.kind) {
    case "shell":
      return "copilot_shell";
    case "read":
      return "copilot_read";
    case "write":
      return "copilot_write";
    case "url":
      return "copilot_url";
    case "memory":
      return "copilot_memory";
    case "mcp":
      return "copilot_mcp";
    case "custom-tool":
      return "copilot_custom_tool";
    case "hook":
      return "copilot_hook";
    case "extension-management":
    case "extension-permission-access":
    case "extension-env-access":
      return "copilot_extension";
    case "workflow":
      return "copilot_workflow";
    default:
      return "copilot_runtime";
  }
}

export function describeCopilotPermissionRequest(request: PermissionRequest) {
  switch (request.kind) {
    case "shell":
      return (
        request.intention || request.fullCommandText || "Run shell command"
      );
    case "read":
      return request.intention || request.path || "Read workspace path";
    case "write":
      return request.intention || request.fileName || "Write workspace file";
    case "url":
      return request.intention || request.url || "Fetch URL";
    case "memory":
      return request.subject
        ? `Save memory: ${request.subject}`
        : "Save memory";
    case "mcp": {
      const toolLabel = request.toolTitle || request.toolName;
      return `Call ${toolLabel} on the ${request.serverName} MCP server${
        request.readOnly ? " (read-only)" : ""
      }`;
    }
    case "custom-tool":
      return request.toolDescription
        ? `Custom tool ${request.toolName}: ${request.toolDescription}`
        : `Custom tool ${request.toolName}`;
    case "hook":
      return request.hookMessage || `Run a hook for ${request.toolName}`;
    case "extension-management":
      return request.extensionName
        ? `Extension ${request.operation}: ${request.extensionName}`
        : `Extension ${request.operation}`;
    case "extension-permission-access":
      return `Grant ${request.extensionName} access to ${request.capabilities.join(", ")}`;
    case "extension-env-access":
      return `Let ${request.extensionName} read ${request.environmentVariables.join(", ")}`;
    case "workflow":
      return request.description || `Run workflow ${request.name}`;
    default:
      return "Copilot permission request";
  }
}

/**
 * Whether Sentinel asks the user before answering a Copilot permission
 * request. Full access approves everything except requests that managed
 * policy marks as needing an explicit decision; default access follows the
 * matching Sentinel tool policies, and kinds without one (MCP, custom tools,
 * hooks, extensions, workflows) always ask.
 */
export function requiresApprovalForCopilotPermission(input: {
  permissionMode: "default" | "full";
  policies: ToolApprovalPolicyMap;
  request: PermissionRequest;
}) {
  if (input.request.managedApprovalRequired === true) {
    return true;
  }

  if (input.permissionMode === "full") {
    return false;
  }

  switch (input.request.kind) {
    case "shell":
      return input.policies.shell_command ?? true;
    case "url":
      return input.policies.webfetch ?? true;
    case "memory":
      return input.policies.save_memory ?? true;
    case "read":
      return COPILOT_READ_TOOL_POLICIES.some(
        (toolName) => input.policies[toolName] ?? true,
      );
    case "write":
      return COPILOT_WRITE_TOOL_POLICIES.some(
        (toolName) => input.policies[toolName] ?? true,
      );
    default:
      return true;
  }
}

/**
 * Sub-agent events carry `agentId` (and the deprecated
 * `data.parentToolCallId`). Since SDK 0.3 sub-agent output reaches the session
 * stream by default, so it has to stay out of the main assistant message.
 */
export function isCopilotSubAgentEvent(event: SessionEvent) {
  if (typeof event.agentId === "string" && event.agentId.length > 0) {
    return true;
  }

  const data = event.data as { parentToolCallId?: unknown } | null | undefined;
  return (
    typeof data?.parentToolCallId === "string" &&
    data.parentToolCallId.length > 0
  );
}

/**
 * Maps Sentinel's effort to the SDK's. `none`/`minimal` have no Copilot
 * equivalent and become `low`; `xhigh` passes through unless the model's
 * listed efforts are known and lack it. `max` is sent only to a model that
 * lists it and otherwise falls back like `xhigh`.
 */
export function toCopilotSdkReasoningEffort(
  reasoningEffort: ReasoningEffort | null | undefined,
  supportedEfforts?: readonly string[] | null,
): (CopilotReasoningEffort & ReasoningEffort) | undefined {
  switch (reasoningEffort) {
    case "none":
    case "minimal":
      return "low";
    case "low":
    case "medium":
    case "high":
      return reasoningEffort;
    case "max":
      if (supportedEfforts?.includes("max")) {
        return "max";
      }
      return supportedEfforts && !supportedEfforts.includes("xhigh")
        ? "high"
        : "xhigh";
    case "xhigh":
      return supportedEfforts && !supportedEfforts.includes("xhigh")
        ? "high"
        : "xhigh";
    default:
      return undefined;
  }
}
