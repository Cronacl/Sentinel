import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance } =
  await import("@/lib/ai/chat/engines/contract/testing");
const {
  getGlobalInstallDirectory,
  getInstanceGlobalSkillsDirectory,
  resolveSkillInstanceContext,
} = await import("./instance-skills");

const claudeWork = makeFakeInstance({
  driver: "claude",
  envOverrides: { CLAUDE_CONFIG_DIR: "/homes/claude-work" },
  id: "claude-work",
  isDefault: false,
});
const copilotDefault = makeFakeInstance({
  driver: "copilot",
  envOverrides: { COPILOT_HOME: "/homes/copilot" },
  id: "copilot",
});

describe("instance skill folders", () => {
  it("puts global skills under the instance's home", () => {
    expect(getInstanceGlobalSkillsDirectory(claudeWork)).toBe(
      "/homes/claude-work/skills",
    );
    expect(
      getInstanceGlobalSkillsDirectory(
        makeFakeInstance({ driver: "claude", id: "claude" }),
      ),
    ).toBeNull();
    expect(getInstanceGlobalSkillsDirectory(null)).toBeNull();
  });

  it("uses the selected instance for its driver and defaults elsewhere", async () => {
    const resolveDefault = mock(async (_userId: string, driver: string) =>
      driver === "copilot" ? copilotDefault : null,
    );
    const context = await resolveSkillInstanceContext("user-1", "claude-work", {
      getInstance: async (_userId, instanceId) =>
        instanceId === "claude-work" ? claudeWork : null,
      resolveDefault,
    });

    expect(context.instances.claude).toBe(claudeWork);
    expect(context.instances.copilot).toBe(copilotDefault);
    expect(context.instances.codex).toBeNull();
    expect(context.globalDirectories).toEqual({
      claude: "/homes/claude-work/skills",
      copilot: "/homes/copilot/skills",
    });
    expect(
      resolveDefault.mock.calls.map((call: unknown[]) => call[1]).sort(),
    ).toEqual(["codex", "copilot"]);
    expect(getGlobalInstallDirectory(context, "claude")).toBe(
      "/homes/claude-work/skills",
    );
    expect(getGlobalInstallDirectory(context, "codex")).toBeNull();
    expect(getGlobalInstallDirectory(context, "sentinel")).toBeNull();
  });

  it("ignores an unknown or non-home instance", async () => {
    const context = await resolveSkillInstanceContext("user-1", "cursor", {
      getInstance: async () => makeFakeInstance({ driver: "cursor" }),
      resolveDefault: async () => null,
    });
    expect(context.globalDirectories).toEqual({});
  });
});
