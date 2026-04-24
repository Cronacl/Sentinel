import { mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

import { SkillMentionView } from "./skill-mention-view";
import type { SuggestionItem } from "./suggestion-list";

export type SkillMentionOptions = {
  slashSuggestion: Omit<
    SuggestionOptions<SuggestionItem, SuggestionItem>,
    "editor"
  >;
  suggestion: Omit<SuggestionOptions<SuggestionItem, SuggestionItem>, "editor">;
};

export const SkillMentionPluginKey = new PluginKey("skillMention");
export const SlashCommandPluginKey = new PluginKey("slashCommand");

function insertSkillMention({
  editor,
  name,
  range,
  type,
  props,
}: Parameters<NonNullable<SkillMentionOptions["suggestion"]["command"]>>[0] & {
  name: string;
  type: string;
}) {
  const nodeAfter = editor.view.state.selection.$to.nodeAfter;
  const overrideSpace = nodeAfter?.text?.startsWith(" ");

  if (overrideSpace) {
    range.to += 1;
  }

  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        attrs: {
          directory: (props as Record<string, unknown>).directory ?? null,
          engine: (props as Record<string, unknown>).engine ?? null,
          icon: (props as Record<string, unknown>).skillIcon ?? null,
          name,
          scope: (props as Record<string, unknown>).scope ?? null,
          sourceKind: (props as Record<string, unknown>).sourceKind ?? null,
          target: (props as Record<string, unknown>).target ?? null,
        },
        type,
      },
      { text: " ", type: "text" },
    ])
    .run();
}

function insertPlainCommand({
  editor,
  label,
  range,
}: Parameters<NonNullable<SkillMentionOptions["suggestion"]["command"]>>[0] & {
  label: string;
}) {
  const nodeAfter = editor.view.state.selection.$to.nodeAfter;
  const overrideSpace = nodeAfter?.text?.startsWith(" ");

  if (overrideSpace) {
    range.to += 1;
  }

  editor.chain().focus().insertContentAt(range, `${label} `).run();
}

export const SkillMention = Node.create<SkillMentionOptions>({
  name: "skillMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      slashSuggestion: {
        char: "/",
        pluginKey: SlashCommandPluginKey,
        command: ({ editor, range, props }) => {
          const itemKind = (props as Record<string, unknown>).kind;

          if (itemKind === "skill") {
            insertSkillMention({
              editor,
              name: props.label,
              props,
              range,
              type: this.name,
            });
            return;
          }

          if (typeof props.execute === "function") {
            props.execute();
            editor.chain().focus().deleteRange(range).run();
            return;
          }

          insertPlainCommand({
            editor,
            label: props.label.startsWith("/")
              ? props.label
              : `/${props.label}`,
            props,
            range,
          });
        },
      },
      suggestion: {
        char: "$",
        pluginKey: SkillMentionPluginKey,
        command: ({ editor, range, props }) => {
          insertSkillMention({
            editor,
            name: props.label,
            props,
            range,
            type: this.name,
          });
        },
      },
    };
  },

  addAttributes() {
    return {
      directory: { default: null },
      engine: { default: "sentinel" },
      icon: { default: null },
      name: { default: "" },
      scope: { default: null },
      sourceKind: { default: null },
      target: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-skill-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "sentinel-chip sentinel-chip--skill sentinel-chip--with-icon",
        "data-skill-icon": node.attrs.icon ?? "",
        "data-skill-mention": "",
      }),
      ["span", { class: "sentinel-chip-label" }, node.attrs.name as string],
    ];
  },

  renderText({ node }) {
    return `$${node.attrs.name as string}`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
      Suggestion({
        editor: this.editor,
        ...this.options.slashSuggestion,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SkillMentionView);
  },
});
