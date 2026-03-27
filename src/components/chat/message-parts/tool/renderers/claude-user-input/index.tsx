"use client";

import { memo, useCallback, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { unwrapClaudeInput } from "../claude-helpers";

type QuestionOption = {
  description: string;
  label: string;
  preview?: string;
};

type Question = {
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
  question: string;
};

type ClaudeUserInputInput = {
  questions: Question[];
};

function isUserInputInput(value: unknown): value is ClaudeUserInputInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.questions);
}

function getPromptText(input: ClaudeUserInputInput): string {
  if (input.questions.length === 0) return "Requesting input";
  return input.questions.map((q) => q.question).join("\n");
}

export const ClaudeUserInputTool = memo(function ClaudeUserInputTool({
  onApprove,
  part,
}: RendererProps) {
  const isWaiting = part.state === "approval-requested";
  const isDone =
    part.state === "output-available" || part.state === "approval-responded";

  const rawInput = "input" in part ? part.input : undefined;
  const unwrapped = unwrapClaudeInput<ClaudeUserInputInput>(rawInput);
  const userInput = unwrapped && isUserInputInput(unwrapped) ? unwrapped : null;
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const [response, setResponse] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmedResponse = response.trim();
    if (!approvalId || !trimmedResponse) return;
    onApprove?.(approvalId, trimmedResponse);
  }, [approvalId, onApprove, response]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const promptText = userInput ? getPromptText(userInput) : "Requesting input";

  const summary = (
    <>
      <Icon
        icon="solar:chat-round-line-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {isDone ? "Input provided" : "Claude is requesting input"}
    </>
  );

  return (
    <ToolLayout
      summary={summary}
      isRunning={false}
      isError={false}
      isExpandable={isWaiting}
      isExpanded={isWaiting}
      onExpandedChange={() => {}}
    >
      {isWaiting && (
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-[12px] text-foreground/70">
            {promptText}
          </p>
          {userInput?.questions.some((q) => q.options.length > 0) && (
            <div className="flex flex-col gap-1">
              {userInput.questions.flatMap((q) =>
                q.options.map((opt, i) => (
                  <button
                    key={`${opt.label}-${i}`}
                    className="w-full rounded-md border border-border/50 px-3 py-1.5 text-left text-[12px] text-foreground/70 transition-colors hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => {
                      if (approvalId) {
                        onApprove?.(approvalId, opt.label);
                      }
                    }}
                    type="button"
                  >
                    <span className="font-medium text-foreground/90">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="ml-2 text-foreground/50">
                        {opt.description}
                      </span>
                    )}
                  </button>
                )),
              )}
            </div>
          )}
          <textarea
            className="min-h-[60px] w-full resize-y rounded-md border border-border/50 bg-background px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary/50"
            placeholder="Type your response..."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground/30">
              {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter to
              submit
            </span>
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
