import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance } = await import("../contract/testing");
const { getInstanceHomeDirectory } = await import("./instance-homes");

describe("getInstanceHomeDirectory", () => {
  it("reads the driver's home variable from the instance's own environment", () => {
    expect(
      getInstanceHomeDirectory(
        makeFakeInstance({
          driver: "codex",
          envOverrides: { CODEX_HOME: "/Users/me/.codex-work" },
        }),
      ),
    ).toBe("/Users/me/.codex-work");
    expect(
      getInstanceHomeDirectory(
        makeFakeInstance({
          driver: "claude",
          envOverrides: { CLAUDE_CONFIG_DIR: " /Users/me/.claude-b " },
        }),
      ),
    ).toBe("/Users/me/.claude-b");
  });

  it("is null without a home, or for drivers without a home variable", () => {
    expect(
      getInstanceHomeDirectory(makeFakeInstance({ driver: "codex" })),
    ).toBeNull();
    expect(
      getInstanceHomeDirectory(
        makeFakeInstance({
          driver: "cursor",
          envOverrides: { CODEX_HOME: "/x" },
        }),
      ),
    ).toBeNull();
  });
});
