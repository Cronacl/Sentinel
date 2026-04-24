"use client";

import { memo, useState } from "react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type LoadSkillInput = {
  commandName?: string;
  name?: string;
  skill?: string;
};

type LoadSkillStructuredOutput = {
  description: string;
  directory: string;
  files: string[];
  installOrigin: "external" | "sentinel";
  isExternal: boolean;
  name: string;
  preview?: string;
  scope: "global" | "workspace";
  skillFile: string;
  sourceKind:
    | "agents"
    | "claude"
    | "copilot"
    | "codex"
    | "cursor"
    | "opencode"
    | "sentinel";
  target: "claude" | "codex" | "copilot" | "cursor" | "opencode" | "sentinel";
};

type LoadSkillOutput = LoadSkillStructuredOutput | string;

function isStructuredOutput(
  value: LoadSkillOutput | undefined,
): value is LoadSkillStructuredOutput {
  return Boolean(value) && typeof value === "object" && "name" in value;
}

function getSkillName(part: RendererProps["part"]) {
  const input =
    "input" in part ? (part.input as LoadSkillInput | undefined) : undefined;

  if (typeof input?.name === "string" && input.name.length > 0) {
    return input.name;
  }

  if (typeof input?.skill === "string" && input.skill.length > 0) {
    return input.skill;
  }

  if (typeof input?.commandName === "string" && input.commandName.length > 0) {
    return input.commandName;
  }

  if ("output" in part && typeof part.output === "string") {
    const match = /^Launching skill:\s*(.+)$/i.exec(part.output);
    return match?.[1]?.trim() || null;
  }

  return null;
}

function getSummary(part: RendererProps["part"]) {
  const skillName = getSkillName(part);

  if (part.state === "output-error") {
    return skillName
      ? `Failed to load skill ${skillName}`
      : "Failed to load skill";
  }

  if (part.state === "output-denied") {
    return skillName ? `Skill ${skillName} denied` : "Skill load denied";
  }

  if (part.state === "output-available" && "output" in part) {
    const output = part.output as LoadSkillOutput | undefined;
    if (isStructuredOutput(output)) {
      return `Loaded skill ${output.name}`;
    }

    return skillName ? `Loaded skill ${skillName}` : "Loaded skill";
  }

  return `Loading skill ${skillName ?? "..."}`;
}

export const SkillTool = memo(function SkillTool({ part }: RendererProps) {
  const output =
    "output" in part ? (part.output as LoadSkillOutput | undefined) : undefined;
  const structuredOutput = isStructuredOutput(output) ? output : null;
  const textOutput = typeof output === "string" ? output : null;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const isRunning =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-responded";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested",
  );

  return (
    <ToolLayout
      errorText={isError ? errorText : undefined}
      footer={
        structuredOutput ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{structuredOutput.scope}</span>
            <span>·</span>
            <span>{structuredOutput.sourceKind}</span>
            <span>·</span>
            <span>{structuredOutput.files.length} bundled files sampled</span>
          </div>
        ) : undefined
      }
      isError={isError}
      isExpandable={Boolean(structuredOutput || textOutput)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={getSummary(part)}
    >
      {structuredOutput ? (
        <div className="space-y-3 text-[12px]">
          <div>
            <p className="text-foreground/75">{structuredOutput.description}</p>
            <p className="mt-1 font-mono text-[11px] text-foreground/45">
              {structuredOutput.directory}
            </p>
          </div>

          {structuredOutput.preview ? (
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[11px] text-foreground/70 whitespace-pre-wrap break-words">
              {structuredOutput.preview}
            </pre>
          ) : null}
        </div>
      ) : textOutput ? (
        <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[11px] text-foreground/70 whitespace-pre-wrap break-words">
          {textOutput}
        </pre>
      ) : null}
    </ToolLayout>
  );
});
