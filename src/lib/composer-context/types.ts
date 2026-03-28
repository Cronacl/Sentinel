import type { SkillSourceKind } from "@/lib/skills";
import type { ChatEngine } from "@/server/db/enums";

export type ComposerPathEntry = {
  absolutePath: string;
  kind: "file" | "directory";
  label: string;
  relativePath: string;
};

export type ComposerSkillEntry = {
  directory?: string;
  engine: ChatEngine;
  name: string;
  scope?: "global" | "workspace";
  sourceKind?: SkillSourceKind;
  target?: "codex" | "sentinel";
};

export type ComposerContext = {
  paths: ComposerPathEntry[];
  skills: ComposerSkillEntry[];
};
