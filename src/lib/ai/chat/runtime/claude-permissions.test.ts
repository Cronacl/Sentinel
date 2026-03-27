import { describe, expect, it } from "bun:test";

import {
  buildClaudePermissionResult,
  normalizeClaudePermissionInput,
  resolveClaudePermissionInput,
} from "./claude-permissions";

describe("Claude permission helpers", () => {
  it("returns the original tool input when an approval is accepted", () => {
    expect(
      buildClaudePermissionResult({
        approved: true,
        toolInput: normalizeClaudePermissionInput({
          command: "ls -la",
          description: "List files",
        }),
      }),
    ).toEqual({
      behavior: "allow",
      updatedInput: {
        command: "ls -la",
        description: "List files",
      },
    });
  });

  it("normalizes non-object tool input to an empty object", () => {
    expect(normalizeClaudePermissionInput("ls -la")).toEqual({});
  });

  it("recovers the original tool input from the persisted Claude tool payload", () => {
    expect(
      resolveClaudePermissionInput({
        pendingInput: undefined,
        persistedToolInput: {
          command: "ls -la",
        },
      }),
    ).toEqual({
      command: "ls -la",
    });
  });

  it("returns a deny result with a message when approval is rejected", () => {
    expect(
      buildClaudePermissionResult({
        approved: false,
        message: "No",
        toolInput: {},
      }),
    ).toEqual({
      behavior: "deny",
      message: "No",
    });
  });

  it("returns an empty record instead of undefined for stale approvals", () => {
    expect(
      buildClaudePermissionResult({
        approved: true,
        toolInput: undefined,
      }),
    ).toEqual({
      behavior: "allow",
      updatedInput: {},
    });
  });
});
