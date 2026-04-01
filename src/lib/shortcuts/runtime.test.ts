import { describe, expect, it, mock } from "bun:test";

import { resolveShortcutDispatch } from "./runtime";
import type { ShortcutBindingsMap } from "./schema";

describe("resolveShortcutDispatch", () => {
  it("prefers the topmost active scoped handler over a global one", () => {
    const globalRun = mock(() => undefined);
    const overlayRun = mock(() => undefined);

    const candidate = resolveShortcutDispatch({
      bindings: {
        "commandPalette.toggle": ["escape"],
        "overlay.close": ["escape"],
      } satisfies ShortcutBindingsMap,
      event: {
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        isComposing: false,
        key: "Escape",
        metaKey: false,
        shiftKey: false,
        target: null,
      } as KeyboardEvent,
      handlers: [
        {
          actionId: "commandPalette.toggle",
          enabled: true,
          id: "global",
          order: 1,
          run: globalRun,
        },
        {
          actionId: "overlay.close",
          enabled: true,
          id: "overlay",
          order: 2,
          run: overlayRun,
          scopeId: "overlay-scope",
        },
      ],
      platform: "darwin",
      scopes: [
        {
          active: true,
          id: "overlay-scope",
          kind: "overlay",
          order: 5,
        },
      ],
    });

    expect(candidate?.actionId).toBe("overlay.close");
  });

  it("suppresses shortcuts in editable targets by default", () => {
    const candidate = resolveShortcutDispatch({
      bindings: {
        "thread.new": ["mod+n"],
      },
      event: {
        altKey: false,
        ctrlKey: true,
        defaultPrevented: false,
        isComposing: false,
        key: "n",
        metaKey: false,
        shiftKey: false,
        target: {
          tagName: "INPUT",
        },
      } as unknown as KeyboardEvent,
      handlers: [
        {
          actionId: "thread.new",
          enabled: true,
          id: "global",
          order: 1,
          run: () => undefined,
        },
      ],
      platform: "linux",
      scopes: [],
    });

    expect(candidate).toBeNull();
  });

  it("allows opted-in shortcuts inside editable targets", () => {
    const candidate = resolveShortcutDispatch({
      bindings: {
        "overlay.close": ["escape"],
      },
      event: {
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        isComposing: false,
        key: "Escape",
        metaKey: false,
        shiftKey: false,
        target: {
          tagName: "TEXTAREA",
        },
      } as unknown as KeyboardEvent,
      handlers: [
        {
          actionId: "overlay.close",
          enabled: true,
          id: "overlay",
          order: 1,
          run: () => undefined,
          scopeId: "overlay-scope",
        },
      ],
      platform: "linux",
      scopes: [
        {
          active: true,
          id: "overlay-scope",
          kind: "overlay",
          order: 10,
        },
      ],
    });

    expect(candidate?.actionId).toBe("overlay.close");
  });
});
