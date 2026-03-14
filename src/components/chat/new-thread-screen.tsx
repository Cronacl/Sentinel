"use client";

import { Spinner } from "@heroui/react";
import {
  ArrowDown01Icon,
  Folder01Icon,
  FolderAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageWrapper } from "@/components/shell";
import { SentinelLogoBadge } from "@/components/shared/logo";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useThreadChat } from "@/hooks/use-thread-chat";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { applyThreadSettingsCacheUpdate } from "@/lib/threads/cache";
import { CreateWorkspaceModal } from "@/components/workspaces/create-workspace-modal";
import { api } from "@/trpc/react";
import type { ChatOnDataCallback } from "ai";
import type { FileUIPart } from "ai";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";

type NewThreadScreenProps = {
  threadId?: string;
};

export function NewThreadScreen({ threadId }: NewThreadScreenProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const workspaces = api.workspaces.list.useQuery();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);
  const [draftThreadMode, setDraftThreadMode] = useState<
    "chat" | "plan" | null
  >(null);
  const [draftThreadSelection, setDraftThreadSelection] = useState<{
    modelId: string | null;
    mode: "chat" | "plan";
    reasoningEffort: ReasoningEffort | null;
  } | null>(null);
  const [draftThreadId, setDraftThreadId] = useState(
    () => threadId ?? crypto.randomUUID(),
  );
  const {
    buttonDirection,
    composerDockRef,
    composerOffset,
    isButtonVisible,
    jump,
    scrollAreaRef,
  } = useChatScrollControl(draftThreadId);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const hasHandedOffRef = useRef(false);
  const startPlanImplementationLockRef = useRef(false);

  const selectWorkspace = api.workspaces.select.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previousCurrentWorkspace = utils.workspaces.getCurrent.getData();
      const previousWorkspaceList = utils.workspaces.list.getData();

      utils.workspaces.getCurrent.setData(undefined, () => {
        const nextWorkspace = previousWorkspaceList?.find(
          (workspace) => workspace.id === workspaceId,
        );
        return nextWorkspace
          ? {
              createdAt: nextWorkspace.createdAt,
              description: nextWorkspace.description,
              id: nextWorkspace.id,
              isArchived: false,
              name: nextWorkspace.name,
              rootPath: nextWorkspace.rootPath,
              updatedAt: nextWorkspace.updatedAt,
              userId: "",
            }
          : (previousCurrentWorkspace ?? null);
      });

      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((workspace) => ({
          ...workspace,
          isSelected: workspace.id === workspaceId,
        })),
      );

      return { previousCurrentWorkspace, previousWorkspaceList };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.getCurrent.setData(
        undefined,
        context?.previousCurrentWorkspace ?? null,
      );
      utils.workspaces.list.setData(
        undefined,
        context?.previousWorkspaceList ?? [],
      );
    },
  });

  const createWorkspace = api.workspaces.create.useMutation({
    onSuccess: (workspace) => {
      utils.workspaces.getCurrent.setData(undefined, {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isArchived: workspace.isArchived,
        name: workspace.name,
        rootPath: workspace.rootPath,
        updatedAt: workspace.updatedAt,
        userId: workspace.userId,
      });
      utils.workspaces.list.setData(undefined, (current) => {
        const existing = current ?? [];
        const withoutWorkspace = existing.filter(
          (item) => item.id !== workspace.id,
        );
        return [
          {
            createdAt: workspace.createdAt,
            description: workspace.description,
            id: workspace.id,
            isSelected: true,
            latestThreadUpdatedAt: null,
            name: workspace.name,
            rootPath: workspace.rootPath,
            threadCount: 0,
            updatedAt: workspace.updatedAt,
          },
          ...withoutWorkspace.map((item) => ({ ...item, isSelected: false })),
        ];
      });
      setIsCreateOpen(false);
    },
  });

  const selectedWorkspace = currentWorkspace.data;
  const handleData = useCallback<ChatOnDataCallback<ThreadUIMessage>>(
    (dataPart) => {
      if (
        dataPart.type === "data-thread-title" &&
        dataPart.data.threadId === draftThreadId
      ) {
        setGeneratedTitle(dataPart.data.title);
        utils.threads.get.setData({ threadId: draftThreadId }, (current) =>
          current
            ? {
                ...current,
                thread: {
                  ...current.thread,
                  title: dataPart.data.title,
                },
              }
            : current,
        );
        void utils.threads.list.invalidate();
      }

      if (
        dataPart.type === "data-thread-invalidation" &&
        dataPart.data.threadId === draftThreadId
      ) {
        void utils.plan.get.invalidate({ threadId: draftThreadId });
        void utils.threads.get.invalidate({ threadId: draftThreadId });
        void utils.threads.list.invalidate();
      }
    },
    [draftThreadId, utils.plan.get, utils.threads.get, utils.threads.list],
  );

  const handleFinish = useCallback(() => {
    void utils.plan.get.invalidate({ threadId: draftThreadId });
    void utils.threads.get.invalidate({ threadId: draftThreadId });
    void utils.threads.list.invalidate();
  }, [draftThreadId, utils.plan.get, utils.threads.get, utils.threads.list]);

  const handleError = useCallback((error: Error) => {
    setChatError(error.message);
  }, []);

  const chat = useThreadChat({
    threadId: draftThreadId,
    initialMessages: [],
    onData: handleData,
    workspaceId: selectedWorkspace?.id ?? "",
    onFinish: handleFinish,
    onError: handleError,
  });
  const {
    addToolApprovalResponse,
    answerPlanQuestions,
    messages,
    sendMessage,
    status,
    stop,
  } = chat;

  const hasMessages = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const threadDetailsQuery = api.threads.get.useQuery(
    { threadId: draftThreadId },
    { enabled: hasMessages },
  );

  useEffect(() => {
    if (!isBusy) {
      startPlanImplementationLockRef.current = false;
    }
  }, [isBusy]);

  const handleSend = useCallback(
    ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode = "chat",
    }: {
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      setGeneratedTitle(null);
      setDraftThreadMode(threadMode);
      setDraftThreadSelection({
        modelId,
        mode: threadMode,
        reasoningEffort: reasoningEffort ?? null,
      });
      if (selectedWorkspace) {
        const now = new Date();
        utils.threads.get.setData({ threadId: draftThreadId }, (current) => ({
          messages: current?.messages ?? [],
          thread: {
            archivedAt: current?.thread.archivedAt ?? null,
            chatModelId: modelId,
            chatReasoningEffort: reasoningEffort ?? null,
            createdAt: current?.thread.createdAt ?? now,
            id: draftThreadId,
            mode: threadMode,
            pinnedAt: current?.thread.pinnedAt ?? null,
            summary: current?.thread.summary ?? null,
            title:
              current?.thread.title || text.trim().slice(0, 60) || "New thread",
            updatedAt: now,
          },
          workspace: current?.workspace ?? {
            createdAt: selectedWorkspace.createdAt,
            description: selectedWorkspace.description,
            id: selectedWorkspace.id,
            name: selectedWorkspace.name,
            rootPath: selectedWorkspace.rootPath,
            updatedAt: selectedWorkspace.updatedAt,
          },
        }));
      }
      void sendMessage({ files, modelId, reasoningEffort, text, threadMode });
      if (!threadId && !hasHandedOffRef.current) {
        hasHandedOffRef.current = true;
        window.history.replaceState(null, "", `/thread/${draftThreadId}`);
        router.replace(`/thread/${draftThreadId}`);
      }
    },
    [
      draftThreadId,
      router,
      selectedWorkspace,
      sendMessage,
      threadId,
      utils.threads.get,
    ],
  );

  const handleApproveTool = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({ id: approvalId, approved: true });
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

  const handleStartPlanImplementation = useCallback(() => {
    if (isBusy || startPlanImplementationLockRef.current) {
      return;
    }
    startPlanImplementationLockRef.current = true;

    const cachedThread = utils.threads.get.getData({
      threadId: draftThreadId,
    })?.thread;
    const globalSelection = utils.chatPreferences.get.getData();
    const resolvedSelection = threadDetailsQuery.data
      ? {
          modelId:
            threadDetailsQuery.data.thread.chatModelId ??
            draftThreadSelection?.modelId ??
            globalSelection?.modelId ??
            null,
          reasoningEffort:
            (threadDetailsQuery.data.thread
              .chatReasoningEffort as ReasoningEffort | null) ??
            draftThreadSelection?.reasoningEffort ??
            (globalSelection?.reasoningEffort as ReasoningEffort | null) ??
            null,
        }
      : {
          modelId:
            draftThreadSelection?.modelId ??
            cachedThread?.chatModelId ??
            globalSelection?.modelId ??
            null,
          reasoningEffort:
            draftThreadSelection?.reasoningEffort ??
            (cachedThread?.chatReasoningEffort as ReasoningEffort | null) ??
            (globalSelection?.reasoningEffort as ReasoningEffort | null) ??
            null,
        };

    if (!resolvedSelection.modelId) {
      startPlanImplementationLockRef.current = false;
      setChatError("Select a model before starting implementation.");
      return;
    }

    setChatError(null);
    setDraftThreadMode("chat");
    setDraftThreadSelection({
      modelId: resolvedSelection.modelId,
      mode: "chat",
      reasoningEffort: resolvedSelection.reasoningEffort,
    });
    applyThreadSettingsCacheUpdate({
      patch: {
        chatModelId: resolvedSelection.modelId,
        chatReasoningEffort: resolvedSelection.reasoningEffort,
        mode: "chat",
      },
      threadId: draftThreadId,
      utils,
      workspaceId: selectedWorkspace?.id,
    });

    void sendMessage({
      modelId: resolvedSelection.modelId,
      reasoningEffort: resolvedSelection.reasoningEffort,
      text: "Implement Plan",
      threadMode: "chat",
    });
    void utils.threads.list.invalidate();
  }, [
    draftThreadId,
    draftThreadSelection,
    isBusy,
    selectedWorkspace?.id,
    sendMessage,
    threadDetailsQuery.data,
    utils,
  ]);

  useEffect(() => {
    if (threadId) return;
    router.prefetch(`/thread/${draftThreadId}`);
  }, [draftThreadId, router, threadId]);

  useEffect(() => {
    if (!threadId) return;
    hasHandedOffRef.current = false;
    setDraftThreadId(threadId);
  }, [threadId]);

  useEffect(() => {
    if (threadId) return;

    const handleNewThread = () => {
      hasHandedOffRef.current = false;
      setChatError(null);
      setGeneratedTitle(null);
      setDraftThreadMode(utils.chatPreferences.get.getData()?.mode ?? null);
      setDraftThreadSelection(null);
      setDraftThreadId(crypto.randomUUID());
    };

    window.addEventListener("sentinel:new-thread", handleNewThread);
    return () =>
      window.removeEventListener("sentinel:new-thread", handleNewThread);
  }, [threadId, utils.chatPreferences.get]);

  useOutsideClick([
    {
      onOutsideClick: () => setIsWorkspaceMenuOpen(false),
      ref: workspaceMenuRef,
    },
  ]);

  if (hasMessages) {
    const resolvedThreadSelection = threadDetailsQuery.data
      ? {
          modelId:
            threadDetailsQuery.data.thread.chatModelId ??
            draftThreadSelection?.modelId ??
            null,
          mode:
            threadDetailsQuery.data.thread.mode ?? draftThreadSelection?.mode,
          reasoningEffort:
            (threadDetailsQuery.data.thread
              .chatReasoningEffort as ReasoningEffort | null) ??
            draftThreadSelection?.reasoningEffort ??
            null,
        }
      : draftThreadSelection;
    const firstText =
      messages[0]?.parts
        ?.find(
          (
            p,
          ): p is Extract<
            (typeof messages)[0]["parts"][number],
            { type: "text" }
          > => p.type === "text",
        )
        ?.text.slice(0, 60) ?? "New Thread";

    return (
      <PageWrapper title={generatedTitle ?? firstText} flush>
        <div className="sentinel-scroll-shell relative h-full">
          <div
            ref={scrollAreaRef}
            className="sentinel-scroll-area flex h-[calc(100vh-44px)] flex-col"
          >
            <div className="mx-auto w-full max-w-2xl flex-1 px-6 pt-4">
              <div className="flex flex-col gap-4">
                {messages.map((message, idx) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isStreaming={isBusy && idx === messages.length - 1}
                    onApproveTool={handleApproveTool}
                    onAnswerPlanQuestions={handleAnswerPlanQuestions}
                    onDenyTool={handleDenyTool}
                    onStartPlanImplementation={handleStartPlanImplementation}
                  />
                ))}

                {chatError && (
                  <div className="rounded-lg border border-danger-soft-hover bg-danger-soft px-3 py-2.5">
                    <p className="text-xs text-danger-soft-foreground">
                      {chatError}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              ref={composerDockRef}
              className="pointer-events-none sticky bottom-0 z-50 mx-auto w-full max-w-2xl px-6 pb-3 pt-2"
            >
              <ChatComposer
                activeWorkspace={selectedWorkspace}
                draftMode={resolvedThreadSelection?.mode ?? draftThreadMode}
                onSend={handleSend}
                onStop={stop}
                persistThreadSelection={Boolean(threadDetailsQuery.data)}
                status={status}
                threadId={draftThreadId}
                threadSelection={resolvedThreadSelection}
              />
            </div>
          </div>
          <ChatScrollControl
            bottomOffset={composerOffset}
            direction={buttonDirection}
            isVisible={isButtonVisible}
            onClick={jump}
          />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="New Thread" flush>
      <div className="sentinel-scroll-shell h-[calc(100vh-44px)]">
        <div className="sentinel-scroll-area flex h-full flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
            <SentinelLogoBadge
              className="h-8 w-8 rounded-[1.75rem]"
              markClassName="h-9 w-9"
            />

            <h2 className="text-2xl font-medium text-foreground">
              What can I help you with?
            </h2>

            <div className="relative" ref={workspaceMenuRef}>
              <button
                className="flex h-8 items-center gap-2 rounded-xl border border-border/70 cursor-pointer bg-surface px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
                disabled={selectWorkspace.isPending}
                onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
                type="button"
              >
                {currentWorkspace.isLoading ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Folder01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                )}
                <span className="max-w-[200px] truncate">
                  {selectedWorkspace?.name ?? "Choose workspace"}
                </span>
                <HugeiconsIcon
                  className={`transition-transform ${isWorkspaceMenuOpen ? "rotate-180" : ""}`}
                  color="currentColor"
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={1.5}
                />
              </button>

              <AnimatePresence>
                {isWorkspaceMenuOpen && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute max-h-56 overflow-y-auto left-1/2 top-10 z-[200] w-[320px] -translate-x-1/2 rounded-xl border border-border bg-background p-1 shadow-overlay"
                    exit={{ opacity: 0, scale: 0.97, y: -6 }}
                    initial={{ opacity: 0, scale: 0.97, y: -6 }}
                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {(workspaces.data ?? []).map((workspace) => {
                      const isSelected = workspace.id === selectedWorkspace?.id;

                      return (
                        <button
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-default text-foreground"
                              : "text-muted hover:bg-default hover:text-foreground"
                          }`}
                          key={workspace.id}
                          onClick={() => {
                            void selectWorkspace.mutateAsync({
                              workspaceId: workspace.id,
                            });
                            setIsWorkspaceMenuOpen(false);
                          }}
                          type="button"
                        >
                          <HugeiconsIcon
                            color="currentColor"
                            icon={Folder01Icon}
                            size={14}
                            strokeWidth={1.5}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {workspace.name}
                            </div>
                            <div className="truncate text-xs text-muted">
                              {workspace.rootPath || "No folder linked"}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    <div className="mx-1.5 my-1 h-px bg-separator" />

                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-default hover:text-foreground"
                      onClick={() => {
                        setIsWorkspaceMenuOpen(false);
                        setIsCreateOpen(true);
                      }}
                      type="button"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={FolderAddIcon}
                        size={14}
                        strokeWidth={1.5}
                      />
                      <span>Create workspace</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="pointer-events-none sticky bottom-0 z-50 mx-auto w-full max-w-2xl px-6 pb-3 pt-2">
            <ChatComposer
              activeWorkspace={selectedWorkspace}
              draftMode={draftThreadMode}
              onSend={handleSend}
              onStop={stop}
              persistThreadSelection={false}
              status={status}
              threadId={draftThreadId}
              threadSelection={draftThreadSelection}
            />
          </div>
        </div>
      </div>

      <CreateWorkspaceModal
        isOpen={isCreateOpen}
        onCreate={(values) => createWorkspace.mutateAsync(values)}
        onOpenChange={setIsCreateOpen}
      />
    </PageWrapper>
  );
}
