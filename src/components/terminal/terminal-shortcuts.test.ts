import { describe, expect, it } from "bun:test";

import { isTerminalToggleShortcut } from "./terminal-shortcuts";

describe("isTerminalToggleShortcut", () => {
  it("matches Command+J on macOS", () => {
    expect(
      isTerminalToggleShortcut(
        {
          altKey: false,
          ctrlKey: false,
          key: "j",
          metaKey: true,
          shiftKey: false,
        },
        "darwin",
      ),
    ).toBe(true);
  });

  it("matches Ctrl+J on non-mac platforms", () => {
    expect(
      isTerminalToggleShortcut(
        {
          altKey: false,
          ctrlKey: true,
          key: "j",
          metaKey: false,
          shiftKey: false,
        },
        "linux",
      ),
    ).toBe(true);
  });

  it("rejects modified variants that are not the terminal toggle shortcut", () => {
    expect(
      isTerminalToggleShortcut(
        {
          altKey: false,
          ctrlKey: true,
          key: "j",
          metaKey: true,
          shiftKey: false,
        },
        "darwin",
      ),
    ).toBe(false);
    expect(
      isTerminalToggleShortcut(
        {
          altKey: true,
          ctrlKey: false,
          key: "j",
          metaKey: true,
          shiftKey: false,
        },
        "darwin",
      ),
    ).toBe(false);
  });
});
