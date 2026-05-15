import { describe, expect, it } from "bun:test";

import {
  computerAutomationCommandInputSchema,
  computerAutomationCommandResultSchema,
} from "./automation-types";

describe("computer automation schemas", () => {
  it("accepts a conservative batched desktop action command", () => {
    const parsed = computerAutomationCommandInputSchema.parse({
      actions: [
        { type: "move", x: 10, y: 20 },
        {
          button: "left",
          clickCount: 1,
          modifiers: ["shift"],
          type: "click",
          x: 10,
          y: 20,
        },
        {
          button: "left",
          path: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
          type: "drag",
        },
        { deltaY: -400, type: "scroll", x: 10, y: 20 },
        { text: "hello", type: "type" },
        { key: "Enter", modifiers: ["command"], type: "keypress" },
        { durationMs: 250, type: "wait" },
        { type: "screenshot" },
      ],
      type: "action",
    });

    expect(parsed.type).toBe("action");
    if (parsed.type !== "action") {
      throw new Error("Expected action command.");
    }
    expect(parsed.actions).toHaveLength(8);
  });

  it("accepts macOS app and clipboard helper commands", () => {
    expect(
      computerAutomationCommandInputSchema.parse({
        appName: "Craft",
        type: "screenshot",
      }).type,
    ).toBe("screenshot");
    expect(
      computerAutomationCommandInputSchema.parse({
        actions: [{ type: "wait" }],
        bundleId: "com.lukilabs.lukiapp",
        type: "action",
      }).type,
    ).toBe("action");
    expect(
      computerAutomationCommandInputSchema.parse({ type: "apps" }).type,
    ).toBe("apps");
    expect(
      computerAutomationCommandInputSchema.parse({
        appName: "Finder",
        mode: "focus",
        type: "app",
      }).type,
    ).toBe("app");
    expect(
      computerAutomationCommandInputSchema.parse({
        text: "paste me",
        type: "clipboard",
      }).type,
    ).toBe("clipboard");
    expect(
      computerAutomationCommandInputSchema.parse({
        maxDepth: 3,
        query: { role: "AXButton", title: "Open" },
        type: "ax_find",
      }).type,
    ).toBe("ax_find");
    expect(
      computerAutomationCommandInputSchema.parse({
        action: "press",
        axPath: "0/1",
        type: "ax_action",
      }).type,
    ).toBe("ax_action");
  });

  it("rejects invalid action batches", () => {
    expect(() =>
      computerAutomationCommandInputSchema.parse({
        actions: [],
        type: "action",
      }),
    ).toThrow();
    expect(() =>
      computerAutomationCommandInputSchema.parse({
        actions: Array.from({ length: 26 }, () => ({ type: "wait" })),
        type: "action",
      }),
    ).toThrow();
    expect(() =>
      computerAutomationCommandInputSchema.parse({
        actions: [{ path: [[10, 20]], type: "drag" }],
        type: "action",
      }),
    ).toThrow();
    expect(() =>
      computerAutomationCommandInputSchema.parse({
        mode: "focus",
        type: "app",
      }),
    ).toThrow();
  });

  it("accepts unsupported platform status results", () => {
    const parsed = computerAutomationCommandResultSchema.parse({
      accessibilityTrusted: null,
      cursor: null,
      displays: [],
      message: "Desktop computer use is currently supported only on macOS.",
      platform: "linux",
      screenCaptureTrusted: null,
      supported: false,
      type: "status",
    });

    expect(parsed.supported).toBe(false);
  });

  it("validates display bounds in screenshot results", () => {
    expect(() =>
      computerAutomationCommandResultSchema.parse({
        bounds: { height: 0, width: 100, x: 0, y: 0 },
        dataUrl: "data:image/png;base64,abc",
        displayId: 1,
        platform: "darwin",
        supported: true,
        type: "screenshot",
      }),
    ).toThrow();
  });

  it("accepts unsupported app and clipboard results", () => {
    expect(
      computerAutomationCommandResultSchema.parse({
        apps: [],
        frontmostApp: null,
        platform: "linux",
        supported: false,
        type: "apps",
      }).supported,
    ).toBe(false);
    expect(
      computerAutomationCommandResultSchema.parse({
        message: "unsupported",
        platform: "win32",
        supported: false,
        textLength: 0,
        type: "clipboard",
      }).supported,
    ).toBe(false);
  });

  it("accepts Accessibility tree and action results", () => {
    expect(
      computerAutomationCommandResultSchema.parse({
        frontmostApp: { bundleId: "com.apple.finder", name: "Finder" },
        nodeCount: 1,
        platform: "darwin",
        root: {
          actions: ["AXPress"],
          axPath: "",
          bounds: { height: 44, width: 120, x: 10, y: 20 },
          role: "AXButton",
          title: "Open",
        },
        supported: true,
        type: "ax_tree",
      }).type,
    ).toBe("ax_tree");
    const actionResult = computerAutomationCommandResultSchema.parse({
      action: "press",
      element: { axPath: "0/1", role: "AXButton", title: "Open" },
      ok: true,
      platform: "darwin",
      supported: true,
      type: "ax_action",
    });
    expect(actionResult.type).toBe("ax_action");
    if (actionResult.type !== "ax_action") {
      throw new Error("Expected ax_action result.");
    }
    expect(actionResult.ok).toBe(true);
  });
});
