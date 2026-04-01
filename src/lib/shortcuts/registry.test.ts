import { describe, expect, it } from "bun:test";

import {
  findShortcutConflicts,
  formatShortcutChordLabel,
  getDefaultShortcutBindings,
  mergeShortcutBindings,
} from "./registry";
import { normalizeShortcutOverrides, type ShortcutOverrides } from "./schema";

describe("shortcut registry", () => {
  it("formats platform shortcut labels", () => {
    expect(formatShortcutChordLabel("mod+k", "darwin")).toBe("\u2318K");
    expect(formatShortcutChordLabel("shift+mod+a", "linux")).toBe(
      "Ctrl Shift A",
    );
  });

  it("merges overrides on top of platform defaults", () => {
    const overrides = normalizeShortcutOverrides({
      bindings: {
        "commandPalette.toggle": [],
        "settings.open": ["shift+mod+,"],
      },
      version: 1,
    });

    const effectiveBindings = mergeShortcutBindings("darwin", overrides);

    expect(effectiveBindings["commandPalette.toggle"]).toEqual([]);
    expect(effectiveBindings["settings.open"]).toEqual(["shift+mod+,"]);
    expect(effectiveBindings["thread.new"]).toEqual(
      getDefaultShortcutBindings("darwin")["thread.new"],
    );
  });

  it("finds same-scope conflicts after defaults and overrides are merged", () => {
    const conflicts = findShortcutConflicts(
      normalizeShortcutOverrides({
        bindings: {
          "settings.open": ["mod+n"],
        },
        version: 1,
      }),
    );

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionIds: expect.arrayContaining(["settings.open", "thread.new"]),
          platform: "darwin",
          scope: "global",
        }),
      ]),
    );
  });

  it("does not flag the same chord across different scopes", () => {
    const overrides: ShortcutOverrides = {
      bindings: {
        "automations.open": ["shift+mod+a"],
      },
      version: 1,
    };

    const conflicts = findShortcutConflicts(overrides);

    expect(
      conflicts.some(
        (conflict) =>
          conflict.actionIds.includes("thread.archive") &&
          conflict.actionIds.includes("automations.open"),
      ),
    ).toBe(false);
  });
});
