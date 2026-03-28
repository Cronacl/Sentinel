import { mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

import type { SuggestionItem } from "./suggestion-list";

export type PathMentionOptions = {
  suggestion: Omit<SuggestionOptions<SuggestionItem, SuggestionItem>, "editor">;
};

export const PathMentionPluginKey = new PluginKey("pathMention");

export const PathMention = Node.create<PathMentionOptions>({
  name: "pathMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      suggestion: {
        char: "@",
        allowSpaces: true,
        pluginKey: PathMentionPluginKey,
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
                  absolutePath: (props as Record<string, unknown>).absolutePath,
                  kind: (props as Record<string, unknown>).kind,
                  label: props.label,
                  relativePath: (props as Record<string, unknown>).relativePath,
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
      absolutePath: { default: "" },
      kind: { default: "file" },
      label: { default: "" },
      relativePath: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-path-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "sentinel-chip sentinel-chip--path",
        "data-path-mention": node.attrs.kind as string,
      }),
      `${node.attrs.label as string}`,
    ];
  },

  renderText({ node }) {
    return `${node.attrs.relativePath as string}`;
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
