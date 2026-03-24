"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { extractLastTitle } from "@/components/chat/message-parts/reasoning/reasoning-utils";

import { FilePart } from "./message-parts/file";
import { ReasoningPart } from "./message-parts/reasoning";
import { CopyButton } from "./message-parts/shared";
import { TextPart } from "./message-parts/text";
import { ToolPart } from "./message-parts/tool";
import {
  coalesceReasoningEntries,
  extractReasoningTokens,
  getMessageStatus,
  getBranchOptions,
  getAssistantText,
  getPartKey,
  groupMessageParts,
  isToolPart,
  type MessagePart,
} from "./message-parts/types";
import { Button } from "@heroui/react";
import type { ChatEngine } from "@/server/db/enums";

const PRE_RESPONSE_STATUS_LABELS = [
  "Working...",
  "Planning next steps...",
  "Preparing response...",
] as const;

export function isVisibleAssistantPart(part: MessagePart) {
  if (part.type === "text") {
    return part.text.trim().length > 0;
  }

  return part.type === "file" || part.type === "reasoning" || isToolPart(part);
}

export function getPendingAssistantStatusLabel({
  messageStatus,
  statusLabel,
  reasoningMetadata,
  reasoningText,
  rotationIndex,
}: {
  messageStatus?: ThreadMessageMetadata["status"];
  statusLabel?: string | null;
  reasoningMetadata?: ThreadMessageMetadata["reasoning"];
  reasoningText?: string;
  rotationIndex?: number;
}) {
  if (statusLabel?.trim()) {
    return statusLabel.trim();
  }

  const reasoningTitle = reasoningText ? extractLastTitle(reasoningText) : null;
  if (reasoningTitle) {
    return reasoningTitle;
  }

  if (reasoningMetadata?.isActive || reasoningMetadata?.activeSinceMs != null) {
    return "Planning next steps...";
  }

  if (messageStatus === "pending" || messageStatus === "streaming") {
    const index =
      Math.abs(rotationIndex ?? 0) % PRE_RESPONSE_STATUS_LABELS.length;
    return PRE_RESPONSE_STATUS_LABELS[index]!;
  }

  return "Thinking...";
}

function PendingAssistantStatus({
  messageStatus,
  statusLabel,
  reasoningMetadata,
  reasoningText,
}: {
  messageStatus?: ThreadMessageMetadata["status"];
  statusLabel?: string | null;
  reasoningMetadata?: ThreadMessageMetadata["reasoning"];
  reasoningText?: string;
}) {
  const shouldRotate =
    !statusLabel?.trim() &&
    !extractLastTitle(reasoningText ?? "") &&
    !(
      reasoningMetadata?.isActive || reasoningMetadata?.activeSinceMs != null
    ) &&
    (messageStatus === "pending" || messageStatus === "streaming");
  const [rotationIndex, setRotationIndex] = useState(0);

  useEffect(() => {
    if (!shouldRotate) {
      setRotationIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setRotationIndex((current) => current + 1);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [shouldRotate]);

  const resolvedStatusLabel = getPendingAssistantStatusLabel({
    messageStatus,
    statusLabel,
    reasoningMetadata,
    reasoningText,
    rotationIndex,
  });

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <div className="w-full overflow-hidden rounded-lg" aria-busy>
          <div className="flex w-full items-center justify-between gap-3 pr-1">
            <button
              className="group flex min-w-0 flex-1 items-center gap-2 text-left text-default-600 transition-colors hover:text-foreground dark:text-default-400"
              type="button"
            >
              <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/70">
                <span className="sentinel-thinking-shimmer truncate">
                  {resolvedStatusLabel}
                </span>
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeReasoningText(current: string, next: string) {
  if (!current) return next;
  if (!next) return current;

  const currentEndsWithWhitespace = /\s$/.test(current);
  const nextStartsWithWhitespace = /^\s/.test(next);

  if (currentEndsWithWhitespace || nextStartsWithWhitespace) {
    return `${current}${next}`;
  }

  return `${current}\n\n${next}`;
}

function MessageActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon?: typeof PencilEdit02Icon;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      isIconOnly
      onClick={onClick}
      type="button"
      aria-label={label}
      isDisabled={disabled}
      className="h-6 min-h-6 w-6 min-w-6"
    >
      {icon ? (
        <HugeiconsIcon
          color="currentColor"
          icon={icon}
          height={10}
          width={10}
          strokeWidth={1.5}
        />
      ) : null}
    </Button>
  );
}

function BranchSwitcher({
  onSelect,
  options,
}: {
  onSelect?: (messageId: string) => void;
  options: NonNullable<ThreadMessageMetadata["branchOptions"]>;
}) {
  if (!onSelect || options.length <= 1) {
    return null;
  }

  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.isActive),
  );
  const previous = options[activeIndex - 1];
  const next = options[activeIndex + 1];

  return (
    <div className="inline-flex items-center gap-0.5 text-[11px] text-muted">
      <MessageActionButton
        disabled={!previous}
        icon={ArrowLeft01Icon}
        label="Previous version"
        onClick={() => {
          if (previous) {
            onSelect(previous.messageId);
          }
        }}
      />
      <span className="min-w-[2.4rem] text-center text-[10.5px] font-medium text-foreground/85">
        {activeIndex + 1}/{options.length}
      </span>
      <MessageActionButton
        disabled={!next}
        icon={ArrowRight01Icon}
        label="Next version"
        onClick={() => {
          if (next) {
            onSelect(next.messageId);
          }
        }}
      />
    </div>
  );
}

function getAttachmentGridColumns(count: number) {
  if (count <= 1) {
    return "grid-cols-1";
  }

  if (count === 2) {
    return "grid-cols-2";
  }

  return "grid-cols-2 sm:grid-cols-3";
}

function AssistantMessage({
  chatEngine,
  onApproveTool,
  onApproveToolWithDecision,
  onAnswerPlanQuestions,
  onDenyTool,
  onStartPlanImplementation,
  onRegenerate,
  onRetry,
  onSelectBranch,
  isStreaming,
  message,
}: {
  chatEngine?: ChatEngine;
  onApproveTool?: (approvalId: string, response?: string) => void;
  onApproveToolWithDecision?: (
    approvalId: string,
    decision: string,
  ) => void;
  onAnswerPlanQuestions?: (input: {
    answers: Array<{
      answer: string;
      optionLabel?: string | null;
      questionId: string;
    }>;
    assistantMessageId: string;
    questionSetId: string;
  }) => void;
  onDenyTool?: (approvalId: string) => void;
  onStartPlanImplementation?: () => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onSelectBranch?: (messageId: string) => void;
  isStreaming: boolean;
  message: ThreadUIMessage;
}) {
  const supportsSentinelMessageActions = chatEngine !== "codex";
  const assistantText = useMemo(() => getAssistantText(message), [message]);
  const groups = useMemo(
    () => groupMessageParts(message.parts),
    [message.parts],
  );
  const lastReasoningIndex = useMemo(() => {
    let last = -1;
    message.parts.forEach((part, partIndex) => {
      if (part.type === "reasoning") {
        last = partIndex;
      }
    });
    return last;
  }, [message.parts]);

  const metadata = message.metadata as ThreadMessageMetadata | undefined;
  const reasoningTokens = extractReasoningTokens(metadata);
  const reasoningMetadata = metadata?.reasoning;
  const durationSource =
    reasoningMetadata?.segmentDurationsMs ??
    reasoningMetadata?.rawSegmentDurationsMs ??
    [];
  const mergedReasoningText = useMemo(
    () =>
      message.parts.reduce((text, part) => {
        if (part.type !== "reasoning") {
          return text;
        }

        return mergeReasoningText(text, part.text);
      }, ""),
    [message.parts],
  );
  const hasMergedReasoning = mergedReasoningText.trim().length > 0;
  const mergedReasoningDurationMs =
    reasoningMetadata?.durationMs ??
    (durationSource.length > 0
      ? durationSource.reduce((sum, durationMs) => sum + durationMs, 0)
      : undefined);
  const branchOptions = getBranchOptions(metadata);
  const rawStatus = getMessageStatus(metadata);
  const hasVisibleParts = groups.some((group) =>
    group.some(({ part }) => isVisibleAssistantPart(part)),
  );
  const status =
    rawStatus ??
    (isStreaming ? "streaming" : hasVisibleParts ? "completed" : undefined);

  const stableOnAnswerPlanQuestions = useCallback(
    (input: {
      answers: Array<{
        answer: string;
        optionLabel?: string | null;
        questionId: string;
      }>;
      questionSetId: string;
    }) => {
      onAnswerPlanQuestions?.({ ...input, assistantMessageId: message.id });
    },
    [onAnswerPlanQuestions, message.id],
  );

  const displayGroups = useMemo(
    () =>
      groups
        .map((group) =>
          coalesceReasoningEntries(group).filter(
            (entry) => entry.type !== "reasoning-block",
          ),
        )
        .filter((group) => group.length > 0),
    [groups],
  );

  if (!hasVisibleParts && isStreaming) {
    return (
      <PendingAssistantStatus
        messageStatus={status}
        statusLabel={metadata?.statusLabel}
        reasoningMetadata={reasoningMetadata}
        reasoningText={mergedReasoningText}
      />
    );
  }

  return (
    <div className="py-2">
      <div className="flex flex-col gap-0.5">
        {hasMergedReasoning ? (
          <ReasoningPart
            activeSinceMs={reasoningMetadata?.activeSinceMs}
            durationMs={mergedReasoningDurationMs}
            isLastStreamingPart={lastReasoningIndex >= 0}
            isStreaming={isStreaming && lastReasoningIndex >= 0}
            reasoningKey={`${message.id}:reasoning`}
            text={mergedReasoningText}
            tokenCount={reasoningTokens}
          />
        ) : null}

        {displayGroups.map((group, groupIndex) => (
          <div
            className={`${groupIndex > 0 ? "" : ""} flex flex-col gap-0.5`}
            key={`${message.id}:step:${groupIndex}`}
          >
            {group.map((entry) => {
              const key = getPartKey(message.id, entry);
              const { part } = entry;

              if (part.type === "text") {
                return (
                  <TextPart
                    isStreaming={isStreaming && part.state === "streaming"}
                    key={key}
                    part={part}
                  />
                );
              }

              if (part.type === "file") {
                return <FilePart key={key} part={part} />;
              }

              if (isToolPart(part)) {
                return (
                  <ToolPart
                    key={key}
                    onApprove={onApproveTool}
                    onApproveWithDecision={onApproveToolWithDecision}
                    onAnswerPlanQuestions={stableOnAnswerPlanQuestions}
                    onDeny={onDenyTool}
                    onStartPlanImplementation={onStartPlanImplementation}
                    part={part}
                  />
                );
              }

              return null;
            })}
          </div>
        ))}

        {assistantText ||
        status === "completed" ||
        status === "error" ||
        status === "cancelled" ||
        isStreaming ||
        branchOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1 pt-0.5 text-muted">
            {!isStreaming && assistantText ? (
              <CopyButton text={assistantText} title="Copy answer" />
            ) : null}
            {!isStreaming &&
            supportsSentinelMessageActions &&
            onRetry &&
            (status === "error" || status === "cancelled") ? (
              <MessageActionButton
                icon={ArrowReloadHorizontalIcon}
                label="Retry"
                onClick={() => onRetry?.(message.id)}
              />
            ) : null}
            {!isStreaming &&
            supportsSentinelMessageActions &&
            onRegenerate &&
            status === "completed" ? (
              <MessageActionButton
                icon={ArrowReloadHorizontalIcon}
                label="Regenerate"
                onClick={() => onRegenerate?.(message.id)}
              />
            ) : null}
            {!isStreaming && onSelectBranch ? (
              <BranchSwitcher
                onSelect={onSelectBranch}
                options={branchOptions}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserMessage({
  chatEngine,
  message,
  onEdit,
  onSelectBranch,
}: {
  chatEngine?: ChatEngine;
  message: ThreadUIMessage;
  onEdit?: (message: ThreadUIMessage) => void;
  onSelectBranch?: (messageId: string) => void;
}) {
  const supportsSentinelMessageActions = chatEngine !== "codex";
  const fileParts = message.parts.filter(
    (part): part is Extract<MessagePart, { type: "file" }> =>
      part.type === "file",
  );
  const textParts = message.parts.filter(
    (part): part is Extract<MessagePart, { type: "text" }> =>
      part.type === "text",
  );
  const metadata = message.metadata as ThreadMessageMetadata | undefined;
  const branchOptions = getBranchOptions(metadata);

  return (
    <div className="flex justify-end">
      <div className="flex w-full max-w-[38rem] flex-col items-end gap-2.5">
        {fileParts.length > 0 ? (
          <div
            className={`grid w-fit max-w-full gap-2 ${getAttachmentGridColumns(fileParts.length)}`}
          >
            {fileParts.map((part, index) => (
              <FilePart
                key={`${message.id}:file:${index}`}
                part={part}
                variant="grid"
              />
            ))}
          </div>
        ) : null}

        {textParts.length > 0 ? (
          <div className="inline-flex border border-border/50 max-w-[82%] rounded-xl bg-surface-secondary/50 dark:bg-surface px-3 py-1">
            <div className="flex flex-col gap-2">
              {textParts.map((part, index) => (
                <p
                  className="whitespace-pre-wrap text-[13px] text-foreground/96"
                  key={`${message.id}:text:${index}`}
                >
                  {part.text}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 text-muted">
          <CopyButton
            text={textParts.map((part) => part.text).join("\n\n")}
            title="Copy prompt"
          />
          {supportsSentinelMessageActions && onEdit ? (
            <MessageActionButton
              icon={PencilEdit02Icon}
              label="Edit"
              onClick={() => onEdit(message)}
            />
          ) : null}
          <BranchSwitcher onSelect={onSelectBranch} options={branchOptions} />
        </div>
      </div>
    </div>
  );
}

type ChatMessageProps = {
  chatEngine?: ChatEngine;
  onApproveTool?: (approvalId: string, response?: string) => void;
  onApproveToolWithDecision?: (
    approvalId: string,
    decision: string,
  ) => void;
  onAnswerPlanQuestions?: (input: {
    answers: Array<{
      answer: string;
      optionLabel?: string | null;
      questionId: string;
    }>;
    assistantMessageId: string;
    questionSetId: string;
  }) => void;
  onDenyTool?: (approvalId: string) => void;
  onStartPlanImplementation?: () => void;
  message: ThreadUIMessage;
  isStreaming?: boolean;
  onEdit?: (message: ThreadUIMessage) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onSelectBranch?: (messageId: string) => void;
};

export const ChatMessage = memo(function ChatMessage({
  chatEngine,
  message,
  isStreaming = false,
  onApproveTool,
  onApproveToolWithDecision,
  onAnswerPlanQuestions,
  onDenyTool,
  onStartPlanImplementation,
  onEdit,
  onRegenerate,
  onRetry,
  onSelectBranch,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <UserMessage
        chatEngine={chatEngine}
        message={message}
        onEdit={onEdit}
        onSelectBranch={onSelectBranch}
      />
    );
  }

  return (
    <AssistantMessage
      chatEngine={chatEngine}
      isStreaming={isStreaming}
      message={message}
      onApproveTool={onApproveTool}
      onApproveToolWithDecision={onApproveToolWithDecision}
      onAnswerPlanQuestions={onAnswerPlanQuestions}
      onDenyTool={onDenyTool}
      onStartPlanImplementation={onStartPlanImplementation}
      onRegenerate={onRegenerate}
      onRetry={onRetry}
      onSelectBranch={onSelectBranch}
    />
  );
});
