// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const getSkillSnapshot = mock(async ({ workspaceRoot }) => ({
  revision: 2,
  skillRoots: workspaceRoot ? [`${workspaceRoot}/.sentinel/skills/example`] : [],
  skills: [
    {
      description: "Helpful skill",
      directory: `${workspaceRoot ?? "/tmp/home"}/.sentinel/skills/example`,
      name: "example",
      preview: "# Example",
      scope: workspaceRoot ? "workspace" : "global",
      skillFile: `${workspaceRoot ?? "/tmp/home"}/.sentinel/skills/example/SKILL.md`,
      sourceKind: "sentinel",
    },
  ],
  updatedAt: 123,
}));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    query: (handler: any) => handler,
  },
}));

mock.module("@/lib/skills", () => ({
  getSkillSnapshot,
}));

const { skillsRouter } = await import("./skills");

afterEach(() => {
  mock.restore();
});

describe("skillsRouter", () => {
  it("returns a snapshot for the selected workspace root", async () => {
    const result = await skillsRouter.list({
      ctx: {
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
    });

    expect(getSkillSnapshot).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
    });
    expect(result.revision).toBe(2);
    expect(result.skills[0]?.name).toBe("example");
  });
});
