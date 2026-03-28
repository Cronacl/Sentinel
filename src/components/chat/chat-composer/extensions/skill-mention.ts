import { mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

import type { SuggestionItem } from "./suggestion-list";

export type SkillMentionOptions = {
  suggestion: Omit<SuggestionOptions<SuggestionItem, SuggestionItem>, "editor">;
};

export const SkillMentionPluginKey = new PluginKey("skillMention");

export const SkillMention = Node.create<SkillMentionOptions>({
  name: "skillMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: SkillMentionPluginKey,
        command: ({ editor, range, props }) => {
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
                  directory:
                    (props as Record<string, unknown>).directory ?? null,
                  engine: (props as Record<string, unknown>).engine ?? null,
                  name: props.label,
                  scope: (props as Record<string, unknown>).scope ?? null,
                  sourceKind:
                    (props as Record<string, unknown>).sourceKind ?? null,
                  target: (props as Record<string, unknown>).target ?? null,
                },
                type: this.name,
              },
              { text: " ", type: "text" },
            ])
            .run();
        },
      },
    };
  },

  addAttributes() {
    return {
      directory: { default: null },
      engine: { default: "sentinel" },
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
        class: "sentinel-chip sentinel-chip--skill",
        "data-skill-mention": "",
      }),
      `${node.attrs.name as string}`,
    ];
  },

  renderText({ node }) {
    return `${node.attrs.name as string}`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
