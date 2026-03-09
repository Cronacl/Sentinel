"use client";

import { memo, useMemo } from "react";
import {
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  PencilEdit02Icon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/thread-message-types";

import { CopyButton } from "./message-parts/copy-button";
import { FilePart } from "./message-parts/file-part";
import { ReasoningPart } from "./message-parts/reasoning-part";
import { TextPart } from "./message-parts/text-part";
import { ToolPart } from "./message-parts/tool-part";
import {
  coalesceReasoningEntries,
  extractReasoningTokens,
  getBranchOptions,
  getMessageStatus,
  getAssistantText,
  getPartKey,
  groupMessageParts,
  isToolPart,
  type MessagePart,
} from "./message-parts/types";
import { Button } from "@heroui/react";

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

function MessageStatusPill({
  status,
  errorMessage,
}: {
  errorMessage?: string;
  status?: ThreadMessageMetadata["status"];
}) {
  if (!status || status === "completed") {
    return null;
  }

  let label: string | null = null;

  if (status === "pending") {
    label = "Pending";
  } else if (status === "cancelled") {
    label = "Stopped";
  } else if (status === "error") {
    label = "Failed";
  }

  if (!label) {
    return null;
  }

  return (
    <div
      className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-default/20 px-2.5 py-1 text-[11px] text-muted"
      title={errorMessage}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

function BranchSwitcher({
  onSelect,
  options,
}: {
  onSelect: (messageId: string) => void;
  options: NonNullable<ThreadMessageMetadata["branchOptions"]>;
}) {
  if (options.length <= 1) {
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
  onRegenerate,
  onRetry,
  onSelectBranch,
  onStop,
  isStreaming,
  message,
}: {
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onSelectBranch?: (messageId: string) => void;
  onStop?: (messageId: string) => void;
  isStreaming: boolean;
  message: ThreadUIMessage;
}) {
  const assistantText = useMemo(() => getAssistantText(message), [message]);
  const groups = useMemo(
    () => groupMessageParts(message.parts),
    [message.parts],
  );
  const lastReasoningIndex = useMemo(() => {
    let index = -1;
    message.parts.forEach((part, partIndex) => {
      if (part.type === "reasoning") {
        index = partIndex;
      }
    });
    return index;
  }, [message.parts]);

  const metadata = message.metadata as ThreadMessageMetadata | undefined;
  const reasoningTokens = extractReasoningTokens(metadata);
  const reasoningMetadata = metadata?.reasoning;
  const branchOptions = getBranchOptions(metadata);
  const rawStatus = getMessageStatus(metadata);
  const hasVisibleParts = groups.some((group) =>
    group.some(
      ({ part }) =>
        part.type === "file" ||
        part.type === "text" ||
        part.type === "reasoning" ||
        isToolPart(part),
    ),
  );
  const status =
    rawStatus ??
    (isStreaming
      ? "streaming"
      : hasVisibleParts
        ? "completed"
        : undefined);

  if (!hasVisibleParts && isStreaming) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2">
          <div
            className="w-full overflow-hidden rounded-lg transition-all"
            aria-busy={isStreaming}
          >
            <div className="flex w-full items-center justify-between gap-3 pr-1">
              <button
                className="group flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-default-600 transition-colors hover:text-foreground dark:text-default-400"
                type="button"
              >
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground/70">
                  <span className={`truncate sentinel-thinking-shimmer`}>
                    Thinking...
                  </span>
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex flex-col gap-2">
        {groups.map((group, groupIndex) =>
          (() => {
            const renderEntries = coalesceReasoningEntries(group);
            let rawDurationCursor = 0;

            return (
              <div
                className={`${groupIndex > 0 ? "border-t border-border/60 pt-4" : ""} flex flex-col gap-3`}
                key={`${message.id}:step:${groupIndex}`}
              >
                {renderEntries.map((entry) => {
                  if (entry.type === "reasoning-block") {
                    const durationSource =
                      reasoningMetadata?.segmentDurationsMs ??
                      reasoningMetadata?.rawSegmentDurationsMs ??
                      [];
                    const blockDurationMs =
                      reasoningMetadata?.segmentDurationsMs != null
                        ? durationSource[entry.reasoningBlockIndex]
                        : durationSource
                            .slice(
                              rawDurationCursor,
                              rawDurationCursor + entry.rawPartCount,
                            )
                            .reduce((sum, value) => sum + value, 0);

                    rawDurationCursor += entry.rawPartCount;

                    return (
                      <ReasoningPart
                        activeSinceMs={reasoningMetadata?.activeSinceMs}
                        durationMs={blockDurationMs}
                        isLastStreamingPart={
                          entry.endPartIndex === lastReasoningIndex
                        }
                        isStreaming={
                          isStreaming &&
                          entry.endPartIndex === lastReasoningIndex
                        }
                        key={`${message.id}:reasoning-block:${entry.partIndex}:${entry.endPartIndex}`}
                        reasoningKey={`${message.id}:reasoning:${entry.partIndex}-${entry.endPartIndex}`}
                        text={entry.text}
                        tokenCount={
                          entry.endPartIndex === lastReasoningIndex
                            ? reasoningTokens
                            : undefined
                        }
                      />
                    );
                  }

                  const key = getPartKey(message.id, entry);
                  const { part } = entry;

                  if (part.type === "text") {
                    return <TextPart key={key} part={part} />;
                  }

                  if (part.type === "file") {
                    return <FilePart key={key} part={part} />;
                  }

                  if (isToolPart(part)) {
                    return <ToolPart key={key} part={part} />;
                  }

                  return null;
                })}
              </div>
            );
          })(),
        )}

        {assistantText ||
        status === "completed" ||
        status === "error" ||
        status === "cancelled" ||
        isStreaming ||
        branchOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1 pt-0.5 text-muted">
            <MessageStatusPill
              errorMessage={metadata?.errorMessage}
              status={status}
            />
            {!isStreaming && assistantText ? (
              <CopyButton text={assistantText} title="Copy answer" />
            ) : null}
            {!isStreaming && (status === "error" || status === "cancelled") ? (
              <MessageActionButton
                icon={ArrowReloadHorizontalIcon}
                label="Retry"
                onClick={() => onRetry?.(message.id)}
              />
            ) : null}
            {!isStreaming && status === "completed" ? (
              <MessageActionButton
                icon={ArrowReloadHorizontalIcon}
                label="Regenerate"
                onClick={() => onRegenerate?.(message.id)}
              />
            ) : null}
            {!isStreaming ? (
              <BranchSwitcher
                onSelect={(id) => onSelectBranch?.(id)}
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
  message,
  onEdit,
  onSelectBranch,
}: {
  message: ThreadUIMessage;
  onEdit?: (message: ThreadUIMessage) => void;
  onSelectBranch?: (messageId: string) => void;
}) {
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
                  className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/96"
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
          <MessageActionButton
            icon={PencilEdit02Icon}
            label="Edit"
            onClick={() => onEdit?.(message)}
          />
          <BranchSwitcher
            onSelect={(id) => onSelectBranch?.(id)}
            options={branchOptions}
          />
        </div>
      </div>
    </div>
  );
}

type ChatMessageProps = {
  message: ThreadUIMessage;
  isStreaming?: boolean;
  onEdit?: (message: ThreadUIMessage) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onSelectBranch?: (messageId: string) => void;
  onStop?: (messageId: string) => void;
};

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  onEdit,
  onRegenerate,
  onRetry,
  onSelectBranch,
  onStop,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <UserMessage
        message={message}
        onEdit={onEdit}
        onSelectBranch={onSelectBranch}
      />
    );
  }

  return (
    <AssistantMessage
      isStreaming={isStreaming}
      message={message}
      onRegenerate={onRegenerate}
      onRetry={onRetry}
      onSelectBranch={onSelectBranch}
      onStop={onStop}
    />
  );
});
