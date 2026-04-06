import { describe, expect, it } from "bun:test";

import { resolveWorkspaceFileLink } from "./file-link";

describe("resolveWorkspaceFileLink", () => {
  const workspaceRootPath =
    "/Users/mohamedachaq/rework/cronacl-saas/sentinel-projects/sentinel";

  it("resolves absolute workspace paths with line anchors", () => {
    expect(
      resolveWorkspaceFileLink(
        `${workspaceRootPath}/src/components/chat/chat-message.tsx#L846`,
        workspaceRootPath,
      ),
    ).toEqual({
      filePath: `${workspaceRootPath}/src/components/chat/chat-message.tsx`,
      lineNumber: 846,
    });
  });

  it("resolves colon-based line suffixes", () => {
    expect(
      resolveWorkspaceFileLink(
        `${workspaceRootPath}/src/components/chat/chat-message.tsx:1034`,
        workspaceRootPath,
      ),
    ).toEqual({
      filePath: `${workspaceRootPath}/src/components/chat/chat-message.tsx`,
      lineNumber: 1034,
    });
  });

  it("resolves file URLs", () => {
    expect(
      resolveWorkspaceFileLink(
        `file://${workspaceRootPath}/src/components/chat/chat-message.tsx#L643`,
        workspaceRootPath,
      ),
    ).toEqual({
      filePath: `${workspaceRootPath}/src/components/chat/chat-message.tsx`,
      lineNumber: 643,
    });
  });

  it("ignores normal app routes and external URLs", () => {
    expect(resolveWorkspaceFileLink("/settings", workspaceRootPath)).toBeNull();
    expect(
      resolveWorkspaceFileLink("https://example.com/docs", workspaceRootPath),
    ).toBeNull();
  });

  it("does not intercept file-looking links without workspace context", () => {
    expect(
      resolveWorkspaceFileLink(
        `${workspaceRootPath}/src/components/chat/chat-message.tsx#L846`,
        null,
      ),
    ).toBeNull();
  });
});
