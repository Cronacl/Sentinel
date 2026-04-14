"use client";

import { useCallback, useState } from "react";
import { Button, CloseButton, ScrollShadow, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";

import { useThreadChat } from "@/hooks/use-thread-chat";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";
import { api, type RouterOutputs } from "@/trpc/react";
import { useRightSidebar } from "@/components/shell/shell-context";

import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";
import { buildThreadQueryOptions } from "./thread-query-options";

type ThreadDetails = RouterOutputs["threads"]["getSubagent"];

function StatusIndicator({
  status,
}: {
  status: "idle" | "streaming" | "awaiting_approval";
}) {
  if (status === "streaming") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Streaming
      </span>
    );
  }

  if (status === "awaiting_approval") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
        Awaiting approval
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-surface/60 px-2 py-0.5 text-[10px] font-medium text-foreground/55">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/30" />
      Idle
    </span>
  );
}

function SubagentThreadConversation({
  data,
  overrideTitle,
  hideDescription,
}: {
  data: ThreadDetails;
  overrideTitle?: string;
  hideDescription?: boolean;
}) {
  const utils = api.useUtils();
  const { close } = useRightSidebar();
  const [chatError, setChatError] = useState<string | null>(null);
  const { buttonDirection, isButtonVisible, jump, scrollAreaRef } =
    useChatScrollControl(data.thread.id);

  const handleSnapshot = useCallback(
    (snapshot: {
      activeRunId: string | null;
      messages: ThreadUIMessage[];
      mode?: "chat" | "plan" | null;
      queuedFollowUps: QueuedFollowUpSummary[];
      threadStatus: "idle" | "streaming" | "awaiting_approval";
      threadTitle: string;
    }) => {
      utils.threads.getSubagent.setData(
        { threadId: data.thread.id },
        (current) =>
          current
            ? {
                ...current,
                messages: snapshot.messages,
                queuedFollowUps: snapshot.queuedFollowUps,
                thread: {
                  ...current.thread,
                  activeRunId: snapshot.activeRunId,
                  mode: snapshot.mode ?? current.thread.mode,
                  status: snapshot.threadStatus,
                  title: snapshot.threadTitle,
                },
              }
            : current,
      );
    },
    [data.thread.id, utils.threads.getSubagent],
  );

  const handleError = useCallback((error: Error) => {
    if (isCommittedThreadActionError(error)) {
      return;
    }

    setChatError(error.message);
  }, []);

  const chat = useThreadChat({
    initialActiveRunId: data.thread.activeRunId,
    initialChatEngine: data.thread.chatEngine,
    initialMessages: data.messages,
    initialQueuedFollowUps: data.queuedFollowUps,
    initialThreadStatus: data.thread.status,
    initialThreadTitle: data.thread.title,
    onError: handleError,
    onSnapshot: handleSnapshot,
    threadId: data.thread.id,
    workspaceId: data.workspace.id,
  });

  const {
    addToolApprovalResponse,
    answerPlanQuestions,
    chatEngine,
    errorMessage,
    messages,
    status,
    threadStatus,
    threadTitle,
  } = chat;

  const visibleChatError = chatError ?? errorMessage;

  const handleApproveTool = useCallback(
    (approvalId: string, response?: string) => {
      void addToolApprovalResponse({
        approved: true,
        id: approvalId,
        ...(response ? { response } : {}),
      });
    },
    [addToolApprovalResponse],
  );

  const handleApproveToolWithDecision = useCallback(
    (approvalId: string, decision: string) => {
      void addToolApprovalResponse({
        id: approvalId,
        approved: decision !== "decline" && decision !== "cancel",
        decision,
      });
    },
    [addToolApprovalResponse],
  );

  const handleDenyTool = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({
        id: approvalId,
        approved: false,
        reason: "User denied command",
      });
    },
    [addToolApprovalResponse],
  );

  const handleAnswerPlanQuestions = useCallback(
    ({
      answers,
      assistantMessageId,
      questionSetId,
    }: {
      answers: Parameters<typeof answerPlanQuestions>[0]["answers"];
      assistantMessageId: string;
      questionSetId: string;
    }) => {
      void answerPlanQuestions({ answers, assistantMessageId, questionSetId });
    },
    [answerPlanQuestions],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-foreground/85">
                {overrideTitle ?? threadTitle}
              </h2>
              {hideDescription ? null : (
                <p className="text-[11px] text-foreground/40">
                  Sub-agent thread
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CloseButton onPress={close} />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ScrollShadow
          ref={scrollAreaRef}
          visibility="top"
          className="sentinel-scroll-area flex h-full flex-col"
        >
          <div className="flex-1 px-4 pt-4 pb-20">
            {messages.length === 0 && threadStatus === "streaming" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <Spinner size="sm" color="accent" />
                </div>
                <p className="text-[13px] text-foreground/50">
                  Sub-agent is starting up...
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message, idx) => (
                  <ChatMessage
                    chatEngine={chatEngine}
                    disableBranchSwitching
                    isStreaming={
                      status === "streaming" && idx === messages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onAnswerPlanQuestions={handleAnswerPlanQuestions}
                    onApproveTool={handleApproveTool}
                    onApproveToolWithDecision={handleApproveToolWithDecision}
                    onDenyTool={handleDenyTool}
                    workspaceRootPath={data.workspace.rootPath}
                  />
                ))}

                {visibleChatError ? (
                  <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5">
                    <p className="text-xs text-danger-soft-foreground">
                      {visibleChatError}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </ScrollShadow>

        <ChatScrollControl
          bottomOffset={20}
          direction={buttonDirection}
          isVisible={isButtonVisible}
          onClick={jump}
        />
      </div>
    </div>
  );
}

export function SubagentThreadPanel({
  hideDescription,
  overrideTitle,
  threadId,
}: {
  hideDescription?: boolean;
  overrideTitle?: string;
  threadId: string;
}) {
  const utils = api.useUtils();
  const cachedThread = utils.threads.getSubagent.getData({ threadId });
  const threadQuery = api.threads.getSubagent.useQuery(
    { threadId },
    buildThreadQueryOptions(cachedThread),
  );

  if (threadQuery.error && !threadQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10">
          <Icon
            icon="solar:danger-triangle-linear"
            className="h-4 w-4 text-danger"
          />
        </div>
        <p className="text-center text-[13px] text-foreground/60">
          Something went wrong while loading the sub-agent thread.
        </p>
      </div>
    );
  }

  if (!threadQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <Spinner size="sm" />
        <p className="text-[12px] text-foreground/40">Loading thread...</p>
      </div>
    );
  }

  return (
    <SubagentThreadConversation
      data={threadQuery.data}
      hideDescription={hideDescription}
      overrideTitle={overrideTitle}
    />
  );
}
