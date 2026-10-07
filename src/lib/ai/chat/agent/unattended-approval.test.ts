import { describe, expect, it } from "bun:test";

import { UNATTENDED_DECLINE_MESSAGE } from "../runtime/unattended";
import { declineUserApprovalsWhenUnattended } from "./unattended-approval";

function decide(
  toolName: string,
  tools: Record<string, { needsApproval?: unknown }>,
  input: unknown = {},
) {
  return declineUserApprovalsWhenUnattended({
    messages: [],
    runtimeContext: undefined,
    toolCall: {
      input,
      toolCallId: "call-1",
      toolName,
      type: "tool-call",
    } as never,
    tools: tools as never,
    toolsContext: {},
  });
}

describe("declineUserApprovalsWhenUnattended", () => {
  it("declines a call its policy would put to the user", async () => {
    expect(
      await decide("shell_command", { shell_command: { needsApproval: true } }),
    ).toEqual({
      reason: UNATTENDED_DECLINE_MESSAGE,
      type: "denied",
    });
    expect(
      await decide("edit", { edit: { needsApproval: async () => true } }),
    ).toEqual({ reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" });
  });

  it("lets calls that do not ask run as they would attended", async () => {
    expect(await decide("read", { read: { needsApproval: false } })).toBe(
      "not-applicable",
    );
    expect(await decide("read", { read: { needsApproval: () => false } })).toBe(
      "not-applicable",
    );
    expect(await decide("manage_task", { manage_task: {} })).toBe(
      "not-applicable",
    );
    expect(await decide("unknown_tool", {})).toBe("not-applicable");
  });

  it("asks the tool's own policy with the call's input", async () => {
    const seen: unknown[] = [];
    const tools = {
      computer_apps: {
        needsApproval: (input: { action: string }, options: unknown) => {
          seen.push(input, options);
          return input.action === "launch";
        },
      },
    };

    expect(await decide("computer_apps", tools, { action: "list" })).toBe(
      "not-applicable",
    );
    expect(await decide("computer_apps", tools, { action: "launch" })).toEqual({
      reason: UNATTENDED_DECLINE_MESSAGE,
      type: "denied",
    });
    expect(seen[1]).toMatchObject({ messages: [], toolCallId: "call-1" });
  });
});
