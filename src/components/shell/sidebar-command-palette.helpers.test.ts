import { describe, expect, it } from "bun:test";

import {
  buildSidebarCommandPaletteState,
  type SidebarCommandPaletteAction,
  type SidebarCommandPaletteThread,
} from "./sidebar-command-palette.helpers";

const actions: SidebarCommandPaletteAction[] = [
  {
    id: "new-thread",
    keywords: ["compose", "chat"],
    label: "New thread",
    subtitle: "Start a fresh conversation",
  },
  {
    id: "settings",
    keywords: ["preferences"],
    label: "Settings",
    subtitle: "Open preferences",
  },
];

const recentThreads: SidebarCommandPaletteThread[] = [
  {
    id: "thread-2",
    summary: "Pull request review notes",
    title: "Review the release branch",
    updatedAt: new Date("2026-03-28T12:00:00.000Z"),
    workspace: { id: "workspace-1", name: "Sentinel" },
  },
  {
    id: "thread-1",
    summary: "Investigate the command palette",
    title: "Sidebar command palette polish",
    updatedAt: new Date("2026-03-29T12:00:00.000Z"),
    workspace: { id: "workspace-1", name: "Sentinel" },
  },
];

describe("buildSidebarCommandPaletteState", () => {
  it("shows all actions and recent threads for an empty query", () => {
    const result = buildSidebarCommandPaletteState({
      actions,
      query: "",
      recentThreads,
      searchThreads: [],
    });

    expect(result.hasQuery).toBe(false);
    expect(result.actions.map((action) => action.id)).toEqual([
      "new-thread",
      "settings",
    ]);
    expect(result.threadsHeading).toBe("Recent threads");
    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-1",
      "thread-2",
    ]);
  });

  it("keeps action matches ahead of thread matches for a text query", () => {
    const result = buildSidebarCommandPaletteState({
      actions,
      query: "set",
      recentThreads,
      searchThreads: [
        {
          id: "thread-3",
          summary: "Tuning appearance settings",
          title: "Appearance tweaks",
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
          workspace: { id: "workspace-2", name: "Desktop" },
        },
      ],
    });

    expect(result.actions.map((action) => action.id)).toEqual(["settings"]);
    expect(result.threads.map((thread) => thread.id)).toEqual(["thread-3"]);
  });

  it("ranks title matches ahead of summary-only matches", () => {
    const result = buildSidebarCommandPaletteState({
      actions,
      query: "palette",
      recentThreads,
      searchThreads: [
        {
          id: "summary-match",
          summary: "Palette regression checklist",
          title: "Regression tracking",
          updatedAt: new Date("2026-03-31T12:00:00.000Z"),
          workspace: { id: "workspace-2", name: "Desktop" },
        },
        {
          id: "title-match",
          summary: "Polish pass",
          title: "Palette keyboard shortcuts",
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
          workspace: { id: "workspace-2", name: "Desktop" },
        },
      ],
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "title-match",
      "summary-match",
    ]);
  });
});
