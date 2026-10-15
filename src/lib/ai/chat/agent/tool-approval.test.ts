import { describe, expect, it } from "bun:test";
import type { Tool } from "ai";

import { UNATTENDED_DECLINE_MESSAGE } from "../runtime/unattended";
import { withToolApproval, type ToolApprovalCheck } from "../tools/approval";
import {
  askUserForToolApproval,
  declineUserApprovalsWhenUnattended,
} from "./tool-approval";

type Decide = typeof askUserForToolApproval;

function decide(
  approval: Decide,
  toolName: string,
  tools: Record<string, object>,
  input: unknown = {},
) {
  return approval({
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

function checked<INPUT>(check: ToolApprovalCheck<INPUT>): object {
  return withToolApproval({} as Tool, check);
}

describe("askUserForToolApproval", () => {
  it("puts a call to the user when its tool check says so", async () => {
    expect(
      await decide(askUserForToolApproval, "edit", {
        edit: checked(async () => true),
      }),
    ).toBe("user-approval");
  });

  it("lets every other call run", async () => {
    expect(
      await decide(askUserForToolApproval, "read", {
        read: checked(() => false),
      }),
    ).toBe("not-applicable");
    expect(
      await decide(askUserForToolApproval, "manage_task", { manage_task: {} }),
    ).toBe("not-applicable");
    expect(await decide(askUserForToolApproval, "unknown_tool", {})).toBe(
      "not-applicable",
    );
    // Only the tool set's own entries count.
    expect(await decide(askUserForToolApproval, "toString", {})).toBe(
      "not-applicable",
    );
  });

  it("keeps the check when the tool is copied with spread", async () => {
    const copy = { ...checked(() => true), description: "copy" };
    expect(await decide(askUserForToolApproval, "copy", { copy })).toBe(
      "user-approval",
    );
  });
});

describe("declineUserApprovalsWhenUnattended", () => {
  it("declines a call its policy would put to the user", async () => {
    expect(
      await decide(declineUserApprovalsWhenUnattended, "shell_command", {
        shell_command: checked(() => true),
      }),
    ).toEqual({ reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" });
    expect(
      await decide(declineUserApprovalsWhenUnattended, "edit", {
        edit: checked(async () => true),
      }),
    ).toEqual({ reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" });
  });

  it("lets calls that do not ask run as they would attended", async () => {
    expect(
      await decide(declineUserApprovalsWhenUnattended, "read", {
        read: checked(() => false),
      }),
    ).toBe("not-applicable");
    expect(
      await decide(declineUserApprovalsWhenUnattended, "manage_task", {
        manage_task: {},
      }),
    ).toBe("not-applicable");
    expect(
      await decide(declineUserApprovalsWhenUnattended, "unknown_tool", {}),
    ).toBe("not-applicable");
  });

  it("asks the tool's own check with the call's input", async () => {
    const seen: unknown[] = [];
    const tools = {
      computer_app: checked((input: { mode: string }) => {
        seen.push(input);
        return input.mode !== "focus";
      }),
    };

    expect(
      await decide(declineUserApprovalsWhenUnattended, "computer_app", tools, {
        mode: "focus",
      }),
    ).toBe("not-applicable");
    expect(
      await decide(declineUserApprovalsWhenUnattended, "computer_app", tools, {
        mode: "launch",
      }),
    ).toEqual({ reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" });
    expect(seen).toEqual([{ mode: "focus" }, { mode: "launch" }]);
  });
});
