"use client";

import type { ToolPart as ToolPartType } from "./types";
import { getToolName, getToolStateLabel, stringifyJson } from "./types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] leading-5 text-muted">
      {stringifyJson(value)}
    </pre>
  );
}

export function ToolPart({ part }: { part: ToolPartType }) {
  const toolName = getToolName(part);
  const stateLabel = getToolStateLabel(part.state);
  const approval = "approval" in part ? part.approval : undefined;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;

  return (
    <div className="rounded-2xl border border-border/70 bg-default/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium capitalize text-foreground">
            {toolName.replace(/[-_]/g, " ")}
          </p>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {stateLabel}
          </p>
        </div>
        <div className="rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted">
          {part.toolCallId}
        </div>
      </div>

      {hasInput ? (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
            Input
          </p>
          <JsonBlock value={part.input} />
        </div>
      ) : null}

      {hasOutput ? (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
            Output
          </p>
          <JsonBlock value={part.output} />
        </div>
      ) : null}

      {"errorText" in part && part.errorText ? (
        <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
          {part.errorText}
        </div>
      ) : null}

      {approval ? (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
            Approval
          </p>
          <JsonBlock value={approval} />
        </div>
      ) : null}
    </div>
  );
}
