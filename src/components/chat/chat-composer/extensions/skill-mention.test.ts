import { describe, expect, it } from "bun:test";

import { SkillMention } from "./skill-mention";

function createFakeEditor() {
  const inserts: unknown[] = [];
  const editor = {
    chain() {
      return {
        focus() {
          return this;
        },
        insertContentAt(_range: unknown, content: unknown) {
          inserts.push(content);
          return this;
        },
        deleteRange(_range: unknown) {
          return this;
        },
        run() {
          return true;
        },
      };
    },
    view: {
      state: {
        selection: {
          $to: {
            nodeAfter: null,
          },
        },
      },
    },
  };

  return { editor, inserts };
}

describe("SkillMention", () => {
  it("uses dollar suggestions for canonical skill mentions", () => {
    expect(SkillMention.options.suggestion.char).toBe("$");
    expect(SkillMention.options.slashSuggestion.char).toBe("/");
  });

  it("inserts skills as skillMention nodes from dollar suggestions", () => {
    const { editor, inserts } = createFakeEditor();

    SkillMention.options.suggestion.command?.({
      editor: editor as never,
      props: {
        id: "skill:pdf",
        label: "pdf",
        skillIcon: "logos:adobe-acrobat",
      },
      range: { from: 0, to: 4 },
    });

    expect(inserts[0]).toEqual([
      {
        attrs: expect.objectContaining({
          icon: "logos:adobe-acrobat",
          name: "pdf",
        }),
        type: "skillMention",
      },
      { text: " ", type: "text" },
    ]);
  });

  it("inserts skills from slash suggestions as canonical skillMention nodes", () => {
    const { editor, inserts } = createFakeEditor();

    SkillMention.options.slashSuggestion.command?.({
      editor: editor as never,
      props: { id: "skill:playwright", kind: "skill", label: "playwright" },
      range: { from: 0, to: 11 },
    });

    expect(inserts[0]).toEqual([
      {
        attrs: expect.objectContaining({
          name: "playwright",
        }),
        type: "skillMention",
      },
      { text: " ", type: "text" },
    ]);
  });

  it("inserts harness slash commands as plain text", () => {
    const { editor, inserts } = createFakeEditor();

    SkillMention.options.slashSuggestion.command?.({
      editor: editor as never,
      props: {
        id: "provider:compact",
        kind: "provider-command",
        label: "/compact",
      },
      range: { from: 0, to: 8 },
    });

    expect(inserts[0]).toBe("/compact ");
  });

  it("executes app-backed slash commands without inserting text", () => {
    const { editor, inserts } = createFakeEditor();
    let executed = false;

    SkillMention.options.slashSuggestion.command?.({
      editor: editor as never,
      props: {
        execute: () => {
          executed = true;
        },
        id: "provider:review",
        kind: "provider-command",
        label: "/review",
      },
      range: { from: 0, to: 7 },
    });

    expect(executed).toBe(true);
    expect(inserts).toEqual([]);
  });
});
