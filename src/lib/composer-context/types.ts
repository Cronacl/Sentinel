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
  icon?: string;
  name: string;
  scope?: "global" | "workspace";
  sourceKind?: SkillSourceKind;
  target?: "claude" | "codex" | "copilot" | "cursor" | "opencode" | "sentinel";
};

export type ComposerContext = {
  paths: ComposerPathEntry[];
  skills: ComposerSkillEntry[];
};
