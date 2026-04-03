"use client";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { extractLastTitle } from "@/components/chat/message-parts/reasoning/reasoning-utils";
import type { ComposerContext } from "@/lib/composer-context/types";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopOpenTarget } from "@/lib/desktop/contracts";

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
import { Button, Spinner } from "@heroui/react";
import type { ChatEngine } from "@/server/db/enums";

const VARIABLE_TOKEN_REGEX = /(\{\{[^{}]+\}\})/g;
const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 420;
const USER_MESSAGE_COLLAPSE_LINE_THRESHOLD = 6;

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
}: {
  messageStatus?: ThreadMessageMetadata["status"];
  statusLabel?: string | null;
  reasoningMetadata?: ThreadMessageMetadata["reasoning"];
  reasoningText?: string;
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
    return "Working...";
  }

  return "Thinking...";
}

export function getAssistantFailureText({
  errorMessage,
  messageStatus,
}: {
  errorMessage?: string | null;
  messageStatus?: ThreadMessageMetadata["status"];
}) {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }

  if (messageStatus === "cancelled") {
    return "Generation stopped.";
  }

  if (messageStatus === "error") {
    return "Generation failed.";
  }

  return null;
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
  const resolvedStatusLabel = getPendingAssistantStatusLabel({
    messageStatus,
    statusLabel,
    reasoningMetadata,
    reasoningText,
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

function FailedAssistantStatus({ errorText }: { errorText: string }) {
  return (
    <div className="rounded-lg border border-danger-soft-hover bg-danger-soft px-3 py-2.5">
      <p className="text-xs text-danger-soft-foreground">{errorText}</p>
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
  isLoading = false,
}: {
  icon?: typeof PencilEdit02Icon;
  disabled?: boolean;
  isLoading?: boolean;
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
      {isLoading ? (
        <Spinner className="size-3 min-w-3" color="current" size="sm" />
      ) : icon ? (
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
  disabled = false,
  onSelect,
  options,
}: {
  disabled?: boolean;
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
        disabled={disabled || !previous}
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
        disabled={disabled || !next}
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

function getUserMessageLineCount(text: string) {
  return text.split("\n").length;
}

function shouldCollapseUserMessage(text: string) {
  return (
    text.length > USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD ||
    getUserMessageLineCount(text) > USER_MESSAGE_COLLAPSE_LINE_THRESHOLD
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMentionTokenMap(composerContext?: ComposerContext) {
  const tokens = new Map<
    string,
    | {
        absolutePath: string;
        className: "sentinel-chip--path";
        kind: "file" | "directory";
        text: string;
      }
    | {
        className: "sentinel-chip--skill";
        text: string;
      }
  >();

  for (const path of composerContext?.paths ?? []) {
    tokens.set(`@${path.relativePath}`, {
      absolutePath: path.absolutePath,
      className: "sentinel-chip--path",
      kind: path.kind,
      text: `@${path.label}`,
    });
    tokens.set(`@${path.label}`, {
      absolutePath: path.absolutePath,
      className: "sentinel-chip--path",
      kind: path.kind,
      text: `@${path.label}`,
    });
    tokens.set(path.relativePath, {
      absolutePath: path.absolutePath,
      className: "sentinel-chip--path",
      kind: path.kind,
      text: `@${path.label}`,
    });
    tokens.set(path.label, {
      absolutePath: path.absolutePath,
      className: "sentinel-chip--path",
      kind: path.kind,
      text: `@${path.label}`,
    });
  }

  for (const skill of composerContext?.skills ?? []) {
    tokens.set(`/${skill.name}`, {
      className: "sentinel-chip--skill",
      text: `/${skill.name}`,
    });
    tokens.set(skill.name, {
      className: "sentinel-chip--skill",
      text: `/${skill.name}`,
    });
  }

  return tokens;
}

function getPreferredEditorTarget(openTargets: DesktopOpenTarget[]) {
  return (
    openTargets.find(
      (target) => target.kind === "editor" || target.kind === "ide",
    ) ?? null
  );
}

function renderUserText(
  text: string,
  composerContext: ComposerContext | undefined,
  onOpenMentionedPath?: (absolutePath: string) => void,
) {
  const mentionTokens = buildMentionTokenMap(composerContext);
  const escapedMentionPatterns = Array.from(mentionTokens.keys())
    .sort((left, right) => right.length - left.length)
    .map((token) => escapeRegExp(token));
  const tokenPattern = new RegExp(
    [
      VARIABLE_TOKEN_REGEX.source,
      ...(escapedMentionPatterns.length > 0 ? escapedMentionPatterns : []),
    ].join("|"),
    "g",
  );
  const fragments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let key = 0;

  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;

    if (start > lastIndex) {
      fragments.push(<span key={key++}>{text.slice(lastIndex, start)}</span>);
    }

    if (token.startsWith("{{") && token.endsWith("}}")) {
      fragments.push(
        <span className="sentinel-chip sentinel-chip--variable" key={key++}>
          {token}
        </span>,
      );
    } else {
      const mentionToken = mentionTokens.get(token);
      if (mentionToken) {
        if (
          mentionToken.className === "sentinel-chip--path" &&
          mentionToken.kind === "file" &&
          onOpenMentionedPath
        ) {
          fragments.push(
            <button
              className={`sentinel-chip sentinel-chip--clickable ${mentionToken.className}`}
              key={key++}
              onClick={() => onOpenMentionedPath(mentionToken.absolutePath)}
              type="button"
            >
              {mentionToken.text}
            </button>,
          );
          continue;
        }

        fragments.push(
          <span
            className={`sentinel-chip ${mentionToken.className}`}
            key={key++}
          >
            {/* remove the first char */}
            {mentionToken.text.slice(1)}
          </span>,
        );
      } else {
        fragments.push(<span key={key++}>{token}</span>);
      }
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    fragments.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return fragments;
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
  disableBranchSwitching,
  isStreaming,
  message,
}: {
  chatEngine?: ChatEngine;
  onApproveTool?: (approvalId: string, response?: string) => void;
  onApproveToolWithDecision?: (approvalId: string, decision: string) => void;
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
  disableBranchSwitching?: boolean;
  isStreaming: boolean;
  message: ThreadUIMessage;
}) {
  const supportsSentinelMessageActions = chatEngine === "sentinel";
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
  const failureText = getAssistantFailureText({
    errorMessage: metadata?.errorMessage,
    messageStatus: status,
  });
  const shouldRenderFailureState =
    Boolean(failureText) && (status === "error" || status === "cancelled");

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

        {shouldRenderFailureState ? (
          <FailedAssistantStatus errorText={failureText!} />
        ) : null}

        {isStreaming && hasVisibleParts ? (
          <p className="flex min-w-0 items-center gap-2 py-1 text-xs font-medium text-foreground/70">
            <span className="sentinel-thinking-shimmer truncate">
              Working...
            </span>
          </p>
        ) : null}

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
                disabled={disableBranchSwitching}
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

function ComposerContextChips({
  composerContext,
  messageId,
  onOpenPath,
}: {
  composerContext: NonNullable<ThreadMessageMetadata["composerContext"]>;
  messageId: string;
  onOpenPath?: (absolutePath: string) => void;
}) {
  const hasEntries =
    (composerContext.paths?.length ?? 0) > 0 ||
    (composerContext.skills?.length ?? 0) > 0;

  if (!hasEntries) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {composerContext.paths?.map((entry, index) => (
        <button
          className="sentinel-chip sentinel-chip--clickable sentinel-chip--path"
          key={`${messageId}:ctx-path:${index}`}
          onClick={() => onOpenPath?.(entry.absolutePath)}
          type="button"
        >
          @{entry.label}
        </button>
      ))}
      {composerContext.skills?.map((entry, index) => (
        <span
          className="sentinel-chip sentinel-chip--skill"
          key={`${messageId}:ctx-skill:${index}`}
        >
          /{entry.name}
        </span>
      ))}
    </div>
  );
}

function UserMessage({
  message,
  onEdit,
  onResetRepoCheckpoint,
  onSelectBranch,
  disableBranchSwitching,
  repoCheckpointAnchorMessageId,
  repoCheckpointBusyId,
  repoCheckpointId,
  repoCheckpointPathMatches,
  workspaceRootPath,
}: {
  message: ThreadUIMessage;
  onEdit?: (message: ThreadUIMessage) => void;
  onResetRepoCheckpoint?: (
    message: ThreadUIMessage,
    checkpointId: string,
  ) => void;
  onSelectBranch?: (messageId: string) => void;
  disableBranchSwitching?: boolean;
  repoCheckpointAnchorMessageId?: string | null;
  repoCheckpointBusyId?: string | null;
  repoCheckpointId?: string | null;
  repoCheckpointPathMatches?: boolean;
  workspaceRootPath?: string | null;
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
  const composerContext = metadata?.composerContext;
  const combinedText = textParts.map((part) => part.text).join("\n\n");
  const isCollapsible = shouldCollapseUserMessage(combinedText);
  const [isExpanded, setIsExpanded] = useState(false);
  const isCheckpointBusy =
    repoCheckpointId != null && repoCheckpointBusyId === repoCheckpointId;
  const isCheckpointAnchor = repoCheckpointAnchorMessageId === message.id;
  const shouldRenderComposerContextRow =
    Boolean(composerContext) && textParts.length === 0;
  const handleOpenMentionedPath = useCallback(
    async (absolutePath: string) => {
      if (!workspaceRootPath) {
        return;
      }

      const desktop = getDesktopApi();
      if (!desktop) {
        return;
      }

      const openTargets =
        await desktop.workspace.listOpenTargets(workspaceRootPath);
      const preferredEditorTarget = getPreferredEditorTarget(openTargets);
      if (!preferredEditorTarget) {
        return;
      }

      await desktop.workspace.openFileInTarget(
        workspaceRootPath,
        absolutePath,
        preferredEditorTarget.id,
      );
    },
    [workspaceRootPath],
  );

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

        {shouldRenderComposerContextRow ? (
          <ComposerContextChips
            composerContext={composerContext!}
            messageId={message.id}
            onOpenPath={handleOpenMentionedPath}
          />
        ) : null}

        {textParts.length > 0 ? (
          <div className="inline-flex border border-border/50 max-w-[82%] rounded-xl bg-surface-secondary/50 dark:bg-surface px-3 py-1">
            <div className="flex flex-col gap-2">
              <div
                className="flex flex-col gap-2 overflow-hidden"
                style={
                  isCollapsible && !isExpanded
                    ? {
                        maxHeight: "9rem",
                      }
                    : undefined
                }
              >
                {textParts.map((part, index) => (
                  <p
                    className="whitespace-pre-wrap text-[13px] text-foreground/96"
                    key={`${message.id}:text:${index}`}
                  >
                    {renderUserText(
                      part.text,
                      composerContext,
                      handleOpenMentionedPath,
                    )}
                  </p>
                ))}
              </div>
              {isCollapsible ? (
                <button
                  className="self-start text-[11px] font-medium text-foreground/60 transition-colors hover:text-foreground"
                  onClick={() => setIsExpanded((current) => !current)}
                  type="button"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 text-muted">
          <CopyButton text={combinedText} title="Copy prompt" />
          {repoCheckpointId && onResetRepoCheckpoint ? (
            <>
              <MessageActionButton
                disabled={
                  isCheckpointBusy || repoCheckpointPathMatches === false
                }
                icon={ArrowTurnBackwardIcon}
                isLoading={isCheckpointBusy}
                label="Reset to here"
                onClick={() => onResetRepoCheckpoint(message, repoCheckpointId)}
              />
              {isCheckpointAnchor ? (
                <span className="rounded-full bg-default px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                  Restored
                </span>
              ) : null}
            </>
          ) : null}
          {onEdit ? (
            <MessageActionButton
              icon={PencilEdit02Icon}
              label="Edit"
              onClick={() => onEdit(message)}
            />
          ) : null}
          <BranchSwitcher
            disabled={disableBranchSwitching}
            onSelect={onSelectBranch}
            options={branchOptions}
          />
        </div>
      </div>
    </div>
  );
}

type ChatMessageProps = {
  chatEngine?: ChatEngine;
  onApproveTool?: (approvalId: string, response?: string) => void;
  onApproveToolWithDecision?: (approvalId: string, decision: string) => void;
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
  onResetRepoCheckpoint?: (
    message: ThreadUIMessage,
    checkpointId: string,
  ) => void;
  onRetry?: (messageId: string) => void;
  onSelectBranch?: (messageId: string) => void;
  disableBranchSwitching?: boolean;
  repoCheckpointAnchorMessageId?: string | null;
  repoCheckpointBusyId?: string | null;
  repoCheckpointId?: string | null;
  repoCheckpointPathMatches?: boolean;
  workspaceRootPath?: string | null;
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
  onResetRepoCheckpoint,
  onRetry,
  onSelectBranch,
  disableBranchSwitching,
  repoCheckpointAnchorMessageId,
  repoCheckpointBusyId,
  repoCheckpointId,
  repoCheckpointPathMatches,
  workspaceRootPath,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <UserMessage
        message={message}
        onEdit={onEdit}
        onResetRepoCheckpoint={onResetRepoCheckpoint}
        onSelectBranch={onSelectBranch}
        disableBranchSwitching={disableBranchSwitching}
        repoCheckpointAnchorMessageId={repoCheckpointAnchorMessageId}
        repoCheckpointBusyId={repoCheckpointBusyId}
        repoCheckpointId={repoCheckpointId}
        repoCheckpointPathMatches={repoCheckpointPathMatches}
        workspaceRootPath={workspaceRootPath}
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
      disableBranchSwitching={disableBranchSwitching}
    />
  );
});
