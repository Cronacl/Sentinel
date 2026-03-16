"use client";

import { memo, useEffect, useState } from "react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type LoadSkillInput = {
  name: string;
};

type LoadSkillOutput = {
  description: string;
  directory: string;
  files: string[];
  name: string;
  preview?: string;
  scope: "global" | "workspace";
  skillFile: string;
  sourceKind: "agents" | "claude" | "sentinel";
};

function getSummary(part: RendererProps["part"]) {
  if (part.state === "output-error") {
    return "Failed to load skill";
  }

  if (part.state === "output-denied") {
    return "Skill load denied";
  }

  if (part.state === "output-available" && "output" in part) {
    const output = part.output as LoadSkillOutput | undefined;
    return output ? `Loaded skill ${output.name}` : "Loaded skill";
  }

  const input =
    "input" in part ? (part.input as LoadSkillInput | undefined) : undefined;
  return `Loading skill ${input?.name ?? "..."}`;
}

export const SkillTool = memo(function SkillTool({ part }: RendererProps) {
  const output =
    "output" in part ? (part.output as LoadSkillOutput | undefined) : undefined;
  const errorText = "errorText" in part ? part.errorText : undefined;
  const isError =
    part.state === "output-error" || part.state === "output-denied";
  const isRunning =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-responded";
  const [isExpanded, setIsExpanded] = useState(
    part.state === "output-available" || part.state === "output-error",
  );

  useEffect(() => {
    setIsExpanded(part.state === "output-error");
  }, [part.state, part.toolCallId]);

  return (
    <ToolLayout
      errorText={isError ? errorText : undefined}
      footer={
        output ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{output.scope}</span>
            <span>·</span>
            <span>{output.sourceKind}</span>
            <span>·</span>
            <span>{output.files.length} bundled files sampled</span>
          </div>
        ) : undefined
      }
      isError={isError}
      isExpandable={Boolean(output)}
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={getSummary(part)}
    >
      {output ? (
        <div className="space-y-3 text-[12px]">
          <div>
            <p className="text-foreground/75">{output.description}</p>
            <p className="mt-1 font-mono text-[11px] text-foreground/45">
              {output.directory}
            </p>
          </div>

          {output.preview ? (
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[11px] text-foreground/70 whitespace-pre-wrap break-words">
              {output.preview}
            </pre>
          ) : null}
        </div>
      ) : null}
    </ToolLayout>
  );
});
