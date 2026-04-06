import { describe, expect, it } from "bun:test";

import {
  deriveWorkspaceNameFromPath,
  normalizeWorkspaceDirectoryPath,
} from "@/lib/workspaces/picker";

describe("workspace picker helpers", () => {
  it("normalizes trailing separators before comparing directory paths", () => {
    expect(normalizeWorkspaceDirectoryPath("/tmp/project///")).toBe(
      "/tmp/project",
    );
    expect(normalizeWorkspaceDirectoryPath("C:\\repo\\\\")).toBe("C:\\repo");
  });

  it("derives a workspace name from the normalized path", () => {
    expect(deriveWorkspaceNameFromPath("/Users/sentinel/my-app/")).toBe(
      "my-app",
    );
    expect(deriveWorkspaceNameFromPath("  ")).toBe("Workspace");
  });
});
