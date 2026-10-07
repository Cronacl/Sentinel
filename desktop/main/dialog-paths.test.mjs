import { describe, expect, it } from "bun:test";
import path from "node:path";

import { createDialogDefaultPathTracker } from "./dialog-paths.mjs";

describe("dialog default path tracker", () => {
  it("leaves the first dialog on the platform default", () => {
    expect(createDialogDefaultPathTracker().current()).toBeUndefined();
  });

  it("reopens dialogs in the folder of the last selection", () => {
    const tracker = createDialogDefaultPathTracker();
    const projectPath = path.join(path.sep, "Users", "dev", "code", "sentinel");

    tracker.remember({ canceled: false, filePaths: [projectPath] });
    expect(tracker.current()).toBe(path.join(path.sep, "Users", "dev", "code"));

    tracker.remember({
      canceled: false,
      filePaths: [
        path.join(path.sep, "tmp", "notes", "a.md"),
        path.join(path.sep, "tmp", "notes", "b.md"),
      ],
    });
    expect(tracker.current()).toBe(path.join(path.sep, "tmp", "notes"));
  });

  it("keeps the last folder when a dialog is cancelled", () => {
    const tracker = createDialogDefaultPathTracker();
    tracker.remember({
      canceled: false,
      filePaths: [path.join(path.sep, "work", "repo")],
    });

    tracker.remember({ canceled: true, filePaths: [] });
    tracker.remember({
      canceled: true,
      filePaths: [path.join(path.sep, "other", "repo")],
    });
    expect(tracker.current()).toBe(path.join(path.sep, "work"));
  });
});
