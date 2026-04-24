import { describe, expect, it } from "bun:test";

import {
  filterSkillsForEngine,
  getHarnessSlashCommands,
  getSkillSuggestionTitle,
} from "./use-composer-editor";

describe("filterSkillsForEngine", () => {
  const skills = [
    {
      description: "Agents fallback",
      directory: "/tmp/agents/shared",
      name: "shared",
      scope: "workspace",
      sourceKind: "agents",
      target: "sentinel",
    },
    {
      description: "Sentinel primary",
      directory: "/tmp/sentinel/shared",
      name: "shared",
      scope: "workspace",
      sourceKind: "sentinel",
      target: "sentinel",
    },
    {
      description: "Claude primary",
      directory: "/tmp/claude/shared",
      name: "shared",
      scope: "workspace",
      sourceKind: "claude",
      target: "claude",
    },
    {
      description: "Codex primary",
      directory: "/tmp/codex/shared",
      name: "shared",
      scope: "global",
      sourceKind: "codex",
      target: "codex",
    },
    {
      description: "Copilot primary",
      directory: "/tmp/copilot/shared",
      name: "shared",
      scope: "workspace",
      sourceKind: "copilot",
      target: "copilot",
    },
    {
      description: "Another sentinel skill",
      directory: "/tmp/sentinel/other",
      name: "other",
      scope: "workspace",
      sourceKind: "sentinel",
      target: "sentinel",
    },
  ];

  it("prefers Sentinel installs over agents for the Sentinel engine", () => {
    expect(filterSkillsForEngine(skills, "sentinel")).toEqual([
      expect.objectContaining({
        name: "shared",
        sourceKind: "sentinel",
      }),
      expect.objectContaining({
        name: "other",
        sourceKind: "sentinel",
      }),
    ]);
  });

  it("prefers Claude installs over agents fallback for the Claude engine", () => {
    expect(filterSkillsForEngine(skills, "claude")).toEqual([
      expect.objectContaining({
        name: "shared",
        sourceKind: "claude",
        target: "claude",
      }),
    ]);
  });

  it("prefers Sentinel-managed metadata over external metadata for duplicate names", () => {
    expect(
      filterSkillsForEngine(
        [
          {
            description: "External shared",
            directory: "/tmp/external/shared",
            installOrigin: "external",
            isExternal: true,
            name: "shared",
            scope: "workspace",
            sourceKind: "sentinel",
            target: "sentinel",
          },
          {
            description: "Managed shared",
            directory: "/tmp/managed/shared",
            installOrigin: "sentinel",
            isExternal: false,
            name: "shared",
            scope: "global",
            sourceKind: "sentinel",
            target: "sentinel",
          },
        ],
        "sentinel",
      ),
    ).toEqual([
      expect.objectContaining({
        description: "Managed shared",
        installOrigin: "sentinel",
      }),
    ]);
  });

  it("keeps external-only skills available when no managed overlap exists", () => {
    expect(
      filterSkillsForEngine(
        [
          {
            description: "External only",
            directory: "/tmp/external/only",
            installOrigin: "external",
            isExternal: true,
            name: "external-only",
            scope: "workspace",
            sourceKind: "sentinel",
            target: "sentinel",
          },
        ],
        "sentinel",
      ),
    ).toEqual([
      expect.objectContaining({
        installOrigin: "external",
        name: "external-only",
      }),
    ]);
  });

  it("only returns Codex installs for the Codex engine", () => {
    expect(filterSkillsForEngine(skills, "codex")).toEqual([
      expect.objectContaining({
        name: "shared",
        sourceKind: "codex",
        target: "codex",
      }),
    ]);
  });

  it("only returns Copilot-targeted installs for the Copilot engine", () => {
    expect(filterSkillsForEngine(skills, "copilot")).toEqual([
      expect.objectContaining({
        name: "shared",
        sourceKind: "copilot",
        target: "copilot",
      }),
    ]);
  });
});

describe("getSkillSuggestionTitle", () => {
  it("returns a visible title for each engine", () => {
    expect(getSkillSuggestionTitle("sentinel")).toBe("Showing Sentinel skills");
    expect(getSkillSuggestionTitle("claude")).toBe("Showing Claude skills");
    expect(getSkillSuggestionTitle("copilot")).toBe("Showing Copilot skills");
    expect(getSkillSuggestionTitle("codex")).toBe("Showing Codex skills");
  });
});

describe("getHarnessSlashCommands", () => {
  it("returns only fully supported harness slash commands", () => {
    expect(
      getHarnessSlashCommands("claude").map((command) => command.command),
    ).toContain("compact");
    expect(
      getHarnessSlashCommands("codex").map((command) => command.command),
    ).toContain("review");
    expect(
      getHarnessSlashCommands("codex").map((command) => command.mode),
    ).toEqual(["execute", "execute", "execute"]);
    expect(getHarnessSlashCommands("copilot")).toEqual([]);
    expect(getHarnessSlashCommands("cursor")).toEqual([]);
    expect(getHarnessSlashCommands("opencode")).toEqual([]);
  });

  it("does not add provider commands for Sentinel", () => {
    expect(getHarnessSlashCommands("sentinel")).toEqual([]);
  });
});
