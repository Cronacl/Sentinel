import type { Editor } from "@tiptap/react";

import type {
  ComposerContext,
  ComposerPathEntry,
  ComposerSkillEntry,
} from "./types";

export function extractComposerContext(editor: Editor): ComposerContext {
  const paths: ComposerPathEntry[] = [];
  const skills: ComposerSkillEntry[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "pathMention") {
      paths.push({
        absolutePath: node.attrs.absolutePath as string,
        kind: node.attrs.kind as "file" | "directory",
        label: node.attrs.label as string,
        relativePath: node.attrs.relativePath as string,
      });
    }

    if (node.type.name === "skillMention") {
      const entry: ComposerSkillEntry = {
        engine: node.attrs.engine as ComposerSkillEntry["engine"],
        name: node.attrs.name as string,
      };

      if (node.attrs.sourceKind) {
        entry.sourceKind = node.attrs
          .sourceKind as ComposerSkillEntry["sourceKind"];
      }
      if (node.attrs.target) {
        entry.target = node.attrs.target as ComposerSkillEntry["target"];
      }
      if (node.attrs.scope) {
        entry.scope = node.attrs.scope as ComposerSkillEntry["scope"];
      }
      if (node.attrs.directory) {
        entry.directory = node.attrs.directory as string;
      }
      if (node.attrs.icon) {
        entry.icon = node.attrs.icon as string;
      }

      skills.push(entry);
    }
  });

  return { paths, skills };
}

export function hasComposerContext(ctx: ComposerContext): boolean {
  return ctx.paths.length > 0 || ctx.skills.length > 0;
}
