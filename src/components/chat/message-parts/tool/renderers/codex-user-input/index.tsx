"use client";

import { memo, useCallback, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type UserInputInput = {
  prompt: string;
  requestId: string;
};

function isUserInputInput(value: unknown): value is UserInputInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.prompt === "string" && typeof v.requestId === "string";
}

export const CodexUserInputTool = memo(function CodexUserInputTool({
  onApprove,
  part,
}: RendererProps) {
  const isWaiting = part.state === "approval-requested";
  const isDone =
    part.state === "output-available" || part.state === "approval-responded";

  const input =
    "input" in part && isUserInputInput(part.input) ? part.input : null;
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const [response, setResponse] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmedResponse = response.trim();
    if (!approvalId || !trimmedResponse) return;
    onApprove?.(approvalId, trimmedResponse);
  }, [approvalId, onApprove, response]);

  if (!input) return null;

  const summary = (
    <>
      <Icon
        icon="solar:chat-round-line-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {isDone ? "Input provided" : "Codex is requesting input"}
    </>
  );

  return (
    <ToolLayout
      summary={summary}
      isRunning={false}
      isError={false}
      isExpandable={isWaiting}
      isExpanded={false}
      onExpandedChange={() => {}}
    >
      {isWaiting && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-foreground/70">{input.prompt}</p>
          <textarea
            className="min-h-[60px] w-full resize-y rounded-md border border-border/50 bg-background px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary/50"
            placeholder="Type your response..."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              className="h-7 rounded-md bg-primary px-3 text-[11px] text-primary-foreground disabled:opacity-50"
              disabled={!response.trim()}
              onClick={handleSubmit}
              type="button"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
});
