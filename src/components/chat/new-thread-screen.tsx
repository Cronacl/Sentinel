"use client";

import { ScrollShadow, Spinner } from "@heroui/react";
import {
  ArrowUp01Icon,
  Folder01Icon,
  FolderAddIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { sileo } from "sileo";

import { SentinelLogoBadge } from "@/components/shared/logo";
import { PageWrapper } from "@/components/shell";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useThreadChat } from "@/hooks/use-thread-chat";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";
import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { getErrorMessage } from "@/lib/errors";
import {
  applyThreadSettingsCacheUpdate,
  applyThreadSnapshotCacheUpdate,
  applyThreadStatusCacheUpdate,
} from "@/lib/threads/cache";
import {
  deriveWorkspaceName,
  pickWorkspaceDirectory,
} from "@/lib/workspaces/picker";
import type { ChatEngine } from "@/server/db/enums";
import { api } from "@/trpc/react";
import type { FileUIPart } from "ai";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";
import { buildThreadQueryOptions } from "./thread-query-options";
import { type DraftProjectMode } from "./draft-thread-project-mode";

type NewThreadScreenProps = {
  threadId?: string;
};

export function NewThreadScreen({ threadId }: NewThreadScreenProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const currentWorkspace = api.workspaces.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
  });
  const workspaces = api.workspaces.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [draftThreadMode, setDraftThreadMode] = useState<
    "chat" | "plan" | null
  >(null);
  const [draftProjectMode, setDraftProjectMode] =
    useState<DraftProjectMode>("local");
  const [draftPreparedWorktree, setDraftPreparedWorktree] = useState<{
    branch: string;
    path: string;
  } | null>(null);
  const [draftThreadSelection, setDraftThreadSelection] = useState<{
    engine: ChatEngine;
    modelId: string | null;
    mode: "chat" | "plan";
    reasoningEffort: ReasoningEffort | null;
  } | null>(null);
  const [draftThreadId, setDraftThreadId] = useState(
    () => threadId ?? crypto.randomUUID(),
  );
  const [draftThreadInitialized, setDraftThreadInitialized] = useState(() =>
    Boolean(threadId),
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
              isExpanded: nextWorkspace.isExpanded,
              name: nextWorkspace.name,
              permissionModeOverride:
                nextWorkspace.permissionModeOverride ?? null,
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
        isExpanded: workspace.isExpanded,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
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
            isExpanded: workspace.isExpanded,
            isSelected: true,
            latestThreadUpdatedAt: null,
            name: workspace.name,
            permissionModeOverride: workspace.permissionModeOverride,
            rootPath: workspace.rootPath,
            threadCount: 0,
            updatedAt: workspace.updatedAt,
          },
          ...withoutWorkspace.map((item) => ({ ...item, isSelected: false })),
        ];
      });
    },
  });
  const archiveDraftThread = api.threads.archive.useMutation({
    onSuccess: (_result, variables) => {
      utils.threads.get.setData({ threadId: variables.threadId }, undefined);
      void utils.threads.list.invalidate();
    },
  });

  const selectedWorkspace = currentWorkspace.data;
  const handleCreateWorkspace = useCallback(() => {
    void (async () => {
      try {
        const directory = await pickWorkspaceDirectory();

        if (!directory) {
          return;
        }

        await createWorkspace.mutateAsync({
          name: deriveWorkspaceName(directory),
          rootPath: directory.path,
        });
      } catch (error) {
        sileo.error({
          description: getErrorMessage(error, "Unable to add that project."),
          title: "Project creation failed",
        });
      }
    })();
  }, [createWorkspace]);

  const cachedThreadDetails = utils.threads.get.getData({
    threadId: draftThreadId,
  });
  const handleError = useCallback((error: Error) => {
    if (isCommittedThreadActionError(error)) {
      return;
    }

    setChatError(error.message);
  }, []);
  const handleSnapshot = useCallback(
    (snapshot: {
      activeRunId: string | null;
      messages: ThreadUIMessage[];
      mode?: "chat" | "plan" | null;
      queuedFollowUps: QueuedFollowUpSummary[];
      threadStatus: "idle" | "streaming" | "awaiting_approval";
      threadTitle: string;
    }) => {
      const current = utils.threads.get.getData({ threadId: draftThreadId });
      applyThreadSnapshotCacheUpdate({
        snapshot: {
          messages: snapshot.messages,
          queuedFollowUps: snapshot.queuedFollowUps,
          thread: {
            activeRunId: snapshot.activeRunId,
            mode: snapshot.mode ?? undefined,
            status: snapshot.threadStatus,
            title: snapshot.threadTitle,
          },
        },
        thread: current?.thread,
        threadId: draftThreadId,
        utils,
        workspace: current?.workspace,
        workspaceId: selectedWorkspace?.id,
      });
    },
    [draftThreadId, selectedWorkspace?.id, utils],
  );

  const chat = useThreadChat({
    initialActiveRunId: cachedThreadDetails?.thread.activeRunId ?? null,
    initialChatEngine: cachedThreadDetails?.thread.chatEngine ?? "sentinel",
    threadId: draftThreadId,
    initialMessages: cachedThreadDetails?.messages ?? [],
    initialQueuedFollowUps:
      (cachedThreadDetails?.queuedFollowUps as QueuedFollowUpSummary[]) ?? [],
    initialThreadStatus: cachedThreadDetails?.thread.status ?? "idle",
    initialThreadTitle: cachedThreadDetails?.thread.title ?? "New thread",
    workspaceId: selectedWorkspace?.id ?? "",
    onError: handleError,
    onSnapshot: handleSnapshot,
  });
  const {
    addToolApprovalResponse,
    answerPlanQuestions,
    chatEngine,
    errorMessage,
    messages,
    queueFollowUp,
    queuedFollowUps,
    sendMessage,
    status,
    steerFollowUp,
    stopStream,
    threadStatus,
  } = chat;

  const hasMessages = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const visibleChatError = chatError ?? errorMessage;
  const threadDetailsQuery = api.threads.get.useQuery(
    { threadId: draftThreadId },
    {
      ...buildThreadQueryOptions(cachedThreadDetails),
      enabled: hasMessages,
    },
  );
  const removeQueuedFollowUp = api.threads.removeQueuedFollowUp.useMutation({
    onSuccess: () => {
      void utils.threads.get.invalidate({ threadId: draftThreadId });
      void utils.threads.list.invalidate();
    },
  });
  const steerQueuedFollowUp = api.threads.steerQueuedFollowUp.useMutation({
    onSuccess: () => {
      void utils.threads.get.invalidate({ threadId: draftThreadId });
      void utils.threads.list.invalidate();
    },
  });
  const handleRemoveQueuedFollowUp = useCallback(
    async (id: string) => {
      await removeQueuedFollowUp.mutateAsync({
        followUpId: id,
        threadId: draftThreadId,
      });
    },
    [draftThreadId, removeQueuedFollowUp],
  );
  const handleSteerQueuedFollowUp = useCallback(
    async (id: string) => {
      await steerQueuedFollowUp.mutateAsync({
        followUpId: id,
        threadId: draftThreadId,
      });
    },
    [draftThreadId, steerQueuedFollowUp],
  );

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      applyThreadStatusCacheUpdate({
        status: "streaming",
        threadId: draftThreadId,
        utils,
        workspaceId: selectedWorkspace?.id,
      });
      void utils.threads.list.invalidate();
    }
  }, [draftThreadId, selectedWorkspace?.id, status, utils]);

  useEffect(() => {
    void utils.threads.search.invalidate();
  }, [threadStatus, utils.threads.search]);

  useEffect(() => {
    if (!isBusy) {
      startPlanImplementationLockRef.current = false;
    }
  }, [isBusy]);

  const handleSend = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode = "chat",
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      draftRepoState?: Partial<
        import("@/lib/ai/chat/engines/types").RepoThreadState
      >;
      engine: ChatEngine;
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      setDraftThreadMode(threadMode);
      setDraftThreadSelection({
        engine,
        modelId,
        mode: threadMode,
        reasoningEffort: reasoningEffort ?? null,
      });
      if (selectedWorkspace) {
        const now = new Date();
        utils.threads.get.setData({ threadId: draftThreadId }, (current) => ({
          messages: current?.messages ?? messages,
          queuedFollowUps: current?.queuedFollowUps ?? queuedFollowUps,
          thread: {
            activeRunId: current?.thread.activeRunId ?? null,
            archivedAt: current?.thread.archivedAt ?? null,
            chatEngine: engine,
            chatModelId: modelId,
            chatReasoningEffort: reasoningEffort ?? null,
            createdAt: current?.thread.createdAt ?? now,
            id: draftThreadId,
            linkedPullRequest: current?.thread.linkedPullRequest ?? null,
            mode: threadMode,
            pinnedAt: current?.thread.pinnedAt ?? null,
            status: current?.thread.status ?? "idle",
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
            permissionModeOverride:
              selectedWorkspace.permissionModeOverride ?? null,
            rootPath: selectedWorkspace.rootPath,
            updatedAt: selectedWorkspace.updatedAt,
          },
        }));
      }
      const pendingBootstrap = sendMessage({
        composerContext,
        ...(draftRepoState ? { draftRepoState } : {}),
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode,
      });
      const applyBootstrapSnapshot = (
        bootstrap: Awaited<ReturnType<typeof sendMessage>> | null | undefined,
      ) => {
        if (!bootstrap?.snapshot) {
          return;
        }

        const current = utils.threads.get.getData({ threadId: draftThreadId });
        applyThreadSnapshotCacheUpdate({
          snapshot: {
            messages: bootstrap.snapshot.messages,
            queuedFollowUps: bootstrap.snapshot.queuedFollowUps,
            thread: {
              activeRunId: bootstrap.snapshot.activeRunId,
              status: bootstrap.snapshot.threadStatus,
              title: bootstrap.snapshot.threadTitle,
            },
          },
          thread: current?.thread,
          threadId: draftThreadId,
          utils,
          workspace: current?.workspace,
          workspaceId: selectedWorkspace?.id,
        });
      };

      try {
        const bootstrap = await pendingBootstrap;
        applyBootstrapSnapshot(bootstrap);

        if (!threadId && !hasHandedOffRef.current) {
          hasHandedOffRef.current = true;
          window.history.replaceState(null, "", `/thread/${draftThreadId}`);
          router.replace(`/thread/${draftThreadId}`);
        }
      } catch (error) {
        if (
          !threadId &&
          !hasHandedOffRef.current &&
          isCommittedThreadActionError(error)
        ) {
          hasHandedOffRef.current = true;
          window.history.replaceState(null, "", `/thread/${draftThreadId}`);
          router.replace(`/thread/${draftThreadId}`);
        }

        throw error;
      }
    },
    [
      draftThreadId,
      messages,
      queuedFollowUps,
      router,
      selectedWorkspace,
      sendMessage,
      threadId,
      utils.threads.get,
      utils,
    ],
  );

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

  const handleQueueFollowUp = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode = "chat",
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      draftRepoState?: Partial<
        import("@/lib/ai/chat/engines/types").RepoThreadState
      >;
      engine: ChatEngine;
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await queueFollowUp({
        composerContext,
        ...(draftRepoState ? { draftRepoState } : {}),
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode,
      });
      void utils.threads.list.invalidate();
    },
    [queueFollowUp, utils.threads.list],
  );

  const handleSteerFollowUp = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode = "chat",
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      draftRepoState?: Partial<
        import("@/lib/ai/chat/engines/types").RepoThreadState
      >;
      engine: ChatEngine;
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await steerFollowUp({
        composerContext,
        ...(draftRepoState ? { draftRepoState } : {}),
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode,
      });
      void utils.threads.list.invalidate();
    },
    [steerFollowUp, utils.threads.list],
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
          engine:
            threadDetailsQuery.data.thread.chatEngine ??
            draftThreadSelection?.engine ??
            "sentinel",
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
          engine:
            draftThreadSelection?.engine ??
            cachedThread?.chatEngine ??
            globalSelection?.engine ??
            "sentinel",
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
      engine: resolvedSelection.engine,
      modelId: resolvedSelection.modelId,
      mode: "chat",
      reasoningEffort: resolvedSelection.reasoningEffort,
    });
    applyThreadSettingsCacheUpdate({
      patch: {
        chatEngine: resolvedSelection.engine,
        chatModelId: resolvedSelection.modelId,
        chatReasoningEffort: resolvedSelection.reasoningEffort,
        mode: "chat",
      },
      threadId: draftThreadId,
      utils,
      workspaceId: selectedWorkspace?.id,
    });

    void sendMessage({
      engine: resolvedSelection.engine,
      modelId: resolvedSelection.modelId,
      reasoningEffort: resolvedSelection.reasoningEffort,
      text: "Implement Plan",
      threadMode: "chat",
    }).catch(() => {});
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

  const handleSelectionChange = useCallback(
    ({
      engine,
      modelId,
      mode,
      reasoningEffort,
    }: {
      engine?: ChatEngine;
      modelId?: string | null;
      mode?: "chat" | "plan";
      reasoningEffort?: ReasoningEffort | null;
    }) => {
      setDraftThreadSelection((current) => ({
        engine: engine ?? current?.engine ?? "sentinel",
        modelId: modelId !== undefined ? modelId : (current?.modelId ?? null),
        mode: mode ?? current?.mode ?? draftThreadMode ?? "chat",
        reasoningEffort:
          reasoningEffort !== undefined
            ? reasoningEffort
            : (current?.reasoningEffort ?? null),
      }));
      if (mode) {
        setDraftThreadMode(mode);
      }
    },
    [draftThreadMode],
  );

  const discardPreparedDraftWorktree =
    api.repo.discardPreparedThreadWorktree.useMutation();

  const handleWorkspaceSelect = useCallback(
    async (workspaceId: string) => {
      if (workspaceId === selectedWorkspace?.id) {
        setIsWorkspaceMenuOpen(false);
        return;
      }

      setIsWorkspaceMenuOpen(false);

      if (
        !threadId &&
        selectedWorkspace?.id &&
        draftPreparedWorktree &&
        draftProjectMode === "worktree"
      ) {
        await discardPreparedDraftWorktree
          .mutateAsync({
            threadId: draftThreadId,
            workspaceId: selectedWorkspace.id,
          })
          .catch(() => undefined);
        setDraftPreparedWorktree(null);
        setDraftProjectMode("local");
      }

      if (!threadId && draftThreadInitialized) {
        const previousDraftThreadId = draftThreadId;
        setDraftThreadId(crypto.randomUUID());
        setDraftThreadInitialized(false);

        try {
          await archiveDraftThread.mutateAsync({
            threadId: previousDraftThreadId,
          });
        } catch {
          utils.threads.get.setData(
            { threadId: previousDraftThreadId },
            undefined,
          );
          void utils.threads.list.invalidate();
        }
      }

      await selectWorkspace.mutateAsync({ workspaceId });
    },
    [
      archiveDraftThread,
      discardPreparedDraftWorktree,
      draftPreparedWorktree,
      draftProjectMode,
      draftThreadId,
      draftThreadInitialized,
      selectedWorkspace?.id,
      selectWorkspace,
      threadId,
      utils.threads.get,
      utils.threads.list,
    ],
  );

  useEffect(() => {
    if (threadId) return;
    router.prefetch(`/thread/${draftThreadId}`);
  }, [draftThreadId, router, threadId]);

  useEffect(() => {
    if (!threadId) return;
    hasHandedOffRef.current = false;
    setDraftThreadId(threadId);
    setDraftThreadInitialized(true);
  }, [threadId]);

  useEffect(() => {
    if (threadId) return;

    const handleNewThread = () => {
      if (selectedWorkspace?.id && draftPreparedWorktree) {
        void discardPreparedDraftWorktree
          .mutateAsync({
            threadId: draftThreadId,
            workspaceId: selectedWorkspace.id,
          })
          .catch(() => undefined);
      }

      hasHandedOffRef.current = false;
      setChatError(null);
      setDraftPreparedWorktree(null);
      setDraftProjectMode("local");
      setDraftThreadMode(utils.chatPreferences.get.getData()?.mode ?? null);
      setDraftThreadSelection(null);
      setDraftThreadId(crypto.randomUUID());
      setDraftThreadInitialized(false);
    };

    window.addEventListener("sentinel:new-thread", handleNewThread);
    return () =>
      window.removeEventListener("sentinel:new-thread", handleNewThread);
  }, [
    discardPreparedDraftWorktree,
    draftPreparedWorktree,
    draftThreadId,
    selectedWorkspace?.id,
    threadId,
    utils.chatPreferences.get,
  ]);

  useOutsideClick([
    {
      onOutsideClick: () => setIsWorkspaceMenuOpen(false),
      ref: workspaceMenuRef,
    },
  ]);

  if (hasMessages) {
    const resolvedThreadSelection = threadDetailsQuery.data
      ? {
          engine:
            threadDetailsQuery.data.thread.chatEngine ??
            draftThreadSelection?.engine ??
            "sentinel",
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
      <PageWrapper
        title={threadDetailsQuery.data?.thread.title ?? firstText}
        flush
      >
        <div className="sentinel-scroll-shell relative h-full min-h-0">
          <div
            ref={scrollAreaRef}
            className="sentinel-scroll-area flex h-full flex-col"
          >
            <div className="mx-auto w-full max-w-2xl flex-1 px-6 pt-4">
              <div className="flex flex-col gap-4">
                {messages.map((message, idx) => (
                  <ChatMessage
                    chatEngine={chatEngine}
                    key={message.id}
                    message={message}
                    isStreaming={
                      status === "streaming" && idx === messages.length - 1
                    }
                    onApproveTool={handleApproveTool}
                    onAnswerPlanQuestions={handleAnswerPlanQuestions}
                    onDenyTool={handleDenyTool}
                    onStartPlanImplementation={
                      !isBusy &&
                      (idx === messages.length - 1 ||
                        idx === messages.length - 2)
                        ? handleStartPlanImplementation
                        : undefined
                    }
                    workspaceRootPath={selectedWorkspace?.rootPath ?? null}
                  />
                ))}

                {visibleChatError && (
                  <div className="rounded-lg border border-danger-soft-hover bg-danger-soft px-3 py-2.5">
                    <p className="text-xs text-danger-soft-foreground">
                      {visibleChatError}
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
                draftPreparedWorktree={draftPreparedWorktree}
                draftProjectMode={draftProjectMode}
                draftThreadId={draftThreadId}
                draftMode={resolvedThreadSelection?.mode ?? draftThreadMode}
                onQueueFollowUp={handleQueueFollowUp}
                onRemoveQueuedFollowUp={handleRemoveQueuedFollowUp}
                onDraftPreparedWorktreeChange={setDraftPreparedWorktree}
                onDraftProjectModeChange={setDraftProjectMode}
                onSelectionChange={handleSelectionChange}
                onSend={handleSend}
                onStop={stopStream}
                onSteerFollowUp={handleSteerFollowUp}
                onSteerQueuedFollowUp={handleSteerQueuedFollowUp}
                persistThreadSelection={
                  draftThreadInitialized || Boolean(threadDetailsQuery.data)
                }
                queuedFollowUps={queuedFollowUps}
                repoThreadId={
                  draftThreadInitialized || threadId ? draftThreadId : undefined
                }
                showBranchSwitcher
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
      <div className="sentinel-scroll-shell h-full min-h-0">
        <div className="sentinel-scroll-area flex h-full flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6">
            <SentinelLogoBadge
              className="h-8 w-8 rounded-[1.75rem]"
              markClassName="h-9 w-9"
            />

            <h2 className="text-2xl font-medium text-foreground">
              What can I help you with?
            </h2>

            <div className="relative" ref={workspaceMenuRef}>
              <button
                className="flex cursor-pointer items-center gap-1.5 disabled:opacity-40"
                disabled={
                  archiveDraftThread.isPending ||
                  createWorkspace.isPending ||
                  discardPreparedDraftWorktree.isPending ||
                  selectWorkspace.isPending
                }
                onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
                type="button"
              >
                {currentWorkspace.isLoading ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <span className="max-w-[240px] truncate text-lg font-medium text-muted">
                    {selectedWorkspace?.name ?? "Choose workspace"}
                  </span>
                )}
                <HugeiconsIcon
                  className={`text-muted transition-transform ${isWorkspaceMenuOpen ? "" : "rotate-180"}`}
                  color="currentColor"
                  icon={ArrowUp01Icon}
                  size={14}
                  strokeWidth={2}
                />
              </button>

              <AnimatePresence>
                {isWorkspaceMenuOpen && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute left-1/2 top-10 z-[200] max-h-64 w-[220px] -translate-x-1/2 overflow-y-auto rounded-3xl border border-separator/50 bg-surface p-1.5 shadow-overlay"
                    exit={{ opacity: 0, scale: 0.97, y: -6 }}
                    initial={{ opacity: 0, scale: 0.97, y: -6 }}
                    transition={{
                      duration: 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <p className="px-2.5 pb-1.5 pt-1 text-xs text-muted">
                      Select your project
                    </p>
                    <ScrollShadow className="max-h-40 pb-2">
                      {(workspaces.data ?? []).map((workspace) => {
                        const isSelected =
                          workspace.id === selectedWorkspace?.id;
                        return (
                          <button
                            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors ${
                              isSelected
                                ? "text-foreground"
                                : "text-muted hover:bg-default hover:text-foreground"
                            }`}
                            key={workspace.id}
                            onClick={() => {
                              void handleWorkspaceSelect(workspace.id);
                            }}
                            type="button"
                          >
                            <HugeiconsIcon
                              className="shrink-0"
                              color="currentColor"
                              icon={Folder01Icon}
                              size={16}
                              strokeWidth={1.5}
                            />
                            <span className="min-w-0 truncate">
                              {workspace.name}
                            </span>
                            {isSelected && (
                              <HugeiconsIcon
                                className="ml-auto shrink-0 text-foreground"
                                color="currentColor"
                                icon={Tick02Icon}
                                size={16}
                                strokeWidth={2}
                              />
                            )}
                          </button>
                        );
                      })}
                    </ScrollShadow>

                    <div className="mx-2 my-1 h-px bg-separator" />

                    <button
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-default hover:text-foreground disabled:opacity-40"
                      disabled={createWorkspace.isPending}
                      onClick={() => {
                        setIsWorkspaceMenuOpen(false);
                        handleCreateWorkspace();
                      }}
                      type="button"
                    >
                      <HugeiconsIcon
                        className="shrink-0"
                        color="currentColor"
                        icon={FolderAddIcon}
                        size={16}
                        strokeWidth={1.5}
                      />
                      <span>Add new project</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="pointer-events-none sticky bottom-0 z-50 mx-auto w-full max-w-2xl px-6 pb-3 pt-2">
            <ChatComposer
              activeWorkspace={selectedWorkspace}
              draftPreparedWorktree={draftPreparedWorktree}
              draftProjectMode={draftProjectMode}
              draftThreadId={draftThreadId}
              draftMode={draftThreadMode}
              onQueueFollowUp={handleQueueFollowUp}
              onRemoveQueuedFollowUp={handleRemoveQueuedFollowUp}
              onDraftPreparedWorktreeChange={setDraftPreparedWorktree}
              onDraftProjectModeChange={setDraftProjectMode}
              onSelectionChange={handleSelectionChange}
              onSend={handleSend}
              onStop={stopStream}
              onSteerFollowUp={handleSteerFollowUp}
              onSteerQueuedFollowUp={handleSteerQueuedFollowUp}
              persistThreadSelection={draftThreadInitialized}
              queuedFollowUps={queuedFollowUps}
              repoThreadId={draftThreadInitialized ? draftThreadId : undefined}
              showBranchSwitcher
              status={status}
              threadId={draftThreadId}
              threadSelection={draftThreadSelection}
            />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
