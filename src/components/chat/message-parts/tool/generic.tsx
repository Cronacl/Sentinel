"use client";

import { memo } from "react";

import type { RendererProps } from "./renderer";
import { getToolName, getToolStateLabel, stringifyJson } from "../types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted">
      {stringifyJson(value)}
    </pre>
  );
}

export const GenericTool = memo(function GenericTool({ part }: RendererProps) {
  const toolName = getToolName(part);
  const stateLabel = getToolStateLabel(part.state);
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const partErrorText = "errorText" in part ? part.errorText : undefined;

  return (
    <div className="rounded-xl border border-border/70 bg-default/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize text-foreground">
            {toolName.replace(/[-_]/g, " ")}
          </p>
          <p className="text-[11px] text-muted">
            {stateLabel}
          </p>
        </div>
        <div className="rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted">
          {part.toolCallId}
        </div>
      </div>

      {hasInput ? (
        <div className="mt-3">
          <p className="text-[11px] text-muted">Input</p>
          <JsonBlock value={part.input} />
        </div>
      ) : null}

      {hasOutput ? (
        <div className="mt-3">
          <p className="text-[11px] text-muted">Output</p>
          <JsonBlock value={part.output} />
        </div>
      ) : null}

      {partErrorText ? (
        <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
          {partErrorText}
        </div>
      ) : null}
    </div>
  );
});
