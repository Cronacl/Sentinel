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
import { useShell } from "@/components/shell/shell-context";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { useThreadChat } from "@/hooks/use-thread-chat";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";
import { moveQueuedFollowUpToFront } from "@/hooks/use-thread-chat";
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

import {
  ChatComposer,
  type ChatComposerStartPlanImplementationHandler,
} from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";
import { resolveDraftThreadRepoThreadId } from "./new-thread-screen.helpers";
import { buildOptimisticWorktreeRepoContext } from "./thread-repo-actions.helpers";
import { buildThreadQueryOptions } from "./thread-query-options";
import { ThreadRepoActions } from "./thread-repo-actions";
import { type DraftProjectMode } from "./draft-thread-project-mode";

type NewThreadScreenProps = {
  threadId?: string;
  variant?: "project" | "quick";
};

export function NewThreadScreen({
  threadId,
  variant = "quick",
}: NewThreadScreenProps) {
  const router = useRouter();
  const { navigateToThread } = useShell();
  const utils = api.useUtils();
  const isQuickChat = variant === "quick";
  const currentWorkspace = api.workspaces.getCurrent.useQuery(undefined, {
    enabled: !isQuickChat,
    staleTime: 30_000,
  });
  const quickChatWorkspace = api.workspaces.getQuickChat.useQuery(undefined, {
    enabled: isQuickChat,
    staleTime: 30_000,
  });
  const workspaces = api.workspaces.list.useQuery(undefined, {
    enabled: !isQuickChat,
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
  const [isDraftThreadHandoffPending, setIsDraftThreadHandoffPending] =
    useState(false);
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
  const startPlanImplementationRef =
    useRef<ChatComposerStartPlanImplementationHandler | null>(null);

  const selectWorkspace = api.workspaces.select.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previousCurrentWorkspace = utils.workspaces.getCurrent.getData();
      const previousWorkspaceList = utils.workspaces.list.getData();
      const nextWorkspace = previousWorkspaceList?.find(
        (workspace) => workspace.id === workspaceId,
      );

      utils.workspaces.getCurrent.setData(undefined, () => {
        return nextWorkspace
          ? {
              createdAt: nextWorkspace.createdAt,
              description: nextWorkspace.description,
              id: nextWorkspace.id,
              isArchived: false,
              isExpanded: nextWorkspace.isExpanded,
              kind: nextWorkspace.kind,
              name: nextWorkspace.name,
              permissionModeOverride:
                nextWorkspace.permissionModeOverride ?? null,
              rootPath: nextWorkspace.rootPath,
              sortOrder: nextWorkspace.sortOrder,
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
        kind: workspace.kind,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
        rootPath: workspace.rootPath,
        sortOrder: workspace.sortOrder,
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
            kind: workspace.kind,
            latestThreadUpdatedAt: null,
            name: workspace.name,
            permissionModeOverride: workspace.permissionModeOverride,
            rootPath: workspace.rootPath,
            sortOrder: workspace.sortOrder,
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

  const selectedWorkspace = isQuickChat
    ? quickChatWorkspace.data
    : currentWorkspace.data;
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
    [draftThreadId, selectedWorkspace?.id, selectedWorkspace?.kind, utils],
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
    replaceQueuedFollowUpsLocally,
    sendMessage,
    status,
    steerFollowUp,
    stopStream,
    threadStatus,
  } = chat;

  const hasMessages = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const visibleChatError = chatError ?? errorMessage;
  const repoThreadId = resolveDraftThreadRepoThreadId({
    draftThreadId,
    draftThreadInitialized,
    handoffPending: isDraftThreadHandoffPending,
    threadId,
  });
  const chatErrorBanner = visibleChatError ? (
    <div className="mx-auto w-full max-w-2xl px-6 pb-2">
      <div className="rounded-2xl border border-danger-soft-hover bg-danger-soft px-3 py-2.5">
        <p className="text-[11px] font-medium text-danger-soft-foreground">
          Request failed
        </p>
        <p className="mt-1 text-xs text-danger-soft-foreground whitespace-pre-wrap">
          {visibleChatError}
        </p>
      </div>
    </div>
  ) : null;
  const pageActions =
    selectedWorkspace && !isQuickChat && repoThreadId ? (
      <ThreadRepoActions
        deferRepoContextFetch={isDraftThreadHandoffPending && !threadId}
        threadId={repoThreadId}
        workspaceId={selectedWorkspace.id}
        workspaceRootPath={selectedWorkspace.rootPath}
      />
    ) : undefined;
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
      const previousQueue = queuedFollowUps;
      replaceQueuedFollowUpsLocally(
        previousQueue.filter((followUp) => followUp.id !== id),
      );

      try {
        await removeQueuedFollowUp.mutateAsync({
          followUpId: id,
          threadId: draftThreadId,
        });
      } catch (error) {
        replaceQueuedFollowUpsLocally(previousQueue);
        throw error;
      }
    },
    [
      draftThreadId,
      queuedFollowUps,
      removeQueuedFollowUp,
      replaceQueuedFollowUpsLocally,
    ],
  );
  const handleSteerQueuedFollowUp = useCallback(
    async (id: string) => {
      const previousQueue = queuedFollowUps;
      replaceQueuedFollowUpsLocally(
        moveQueuedFollowUpToFront(previousQueue, id),
      );

      try {
        await steerQueuedFollowUp.mutateAsync({
          followUpId: id,
          threadId: draftThreadId,
        });
      } catch (error) {
        replaceQueuedFollowUpsLocally(previousQueue);
        throw error;
      }
    },
    [
      draftThreadId,
      queuedFollowUps,
      replaceQueuedFollowUpsLocally,
      steerQueuedFollowUp,
    ],
  );

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      applyThreadStatusCacheUpdate({
        status: "streaming",
        threadId: draftThreadId,
        utils,
        workspaceId: selectedWorkspace?.id,
        workspaceKind: selectedWorkspace?.kind,
      });
      void utils.threads.list.invalidate();
      if (isQuickChat) {
        void utils.threads.listQuickChats.invalidate();
      }
    }
  }, [
    draftThreadId,
    isQuickChat,
    selectedWorkspace?.id,
    selectedWorkspace?.kind,
    status,
    utils,
  ]);

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
            kind: selectedWorkspace.kind,
            name: selectedWorkspace.name,
            permissionModeOverride:
              selectedWorkspace.permissionModeOverride ?? null,
            rootPath: selectedWorkspace.rootPath,
            updatedAt: selectedWorkspace.updatedAt,
          },
        }));
      }
      const repoContextQueryInput = selectedWorkspace
        ? {
            threadId: draftThreadId,
            workspaceId: selectedWorkspace.id,
          }
        : null;
      const previousThreadRepoContext = repoContextQueryInput
        ? (utils.repo.getContext.getData(repoContextQueryInput) ??
          utils.repo.getContext.getData({
            workspaceId: selectedWorkspace?.id ?? "",
          }) ??
          null)
        : null;
      if (repoContextQueryInput && previousThreadRepoContext) {
        utils.repo.getContext.setData(
          repoContextQueryInput,
          previousThreadRepoContext as never,
        );
      }
      if (
        repoContextQueryInput &&
        draftPreparedWorktree &&
        draftRepoState?.projectMode === "worktree"
      ) {
        utils.repo.getContext.setData(
          repoContextQueryInput,
          buildOptimisticWorktreeRepoContext({
            baseContext: previousThreadRepoContext as never,
            branch: draftPreparedWorktree.branch,
            workspaceRootPath: selectedWorkspace?.rootPath ?? null,
            worktreePath: draftPreparedWorktree.path,
          }) as never,
        );
      }
      if (!threadId && !draftThreadInitialized) {
        setIsDraftThreadHandoffPending(true);
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
        setIsDraftThreadHandoffPending(false);
        setDraftThreadInitialized(true);
        applyBootstrapSnapshot(bootstrap);
        if (threadId && repoContextQueryInput) {
          void utils.repo.getContext.invalidate(repoContextQueryInput);
        }

        if (!threadId && !hasHandedOffRef.current) {
          hasHandedOffRef.current = true;
          navigateToThread(draftThreadId, { replace: true });
        }
      } catch (error) {
        if (
          !threadId &&
          !hasHandedOffRef.current &&
          isCommittedThreadActionError(error)
        ) {
          setIsDraftThreadHandoffPending(false);
          setDraftThreadInitialized(true);
          hasHandedOffRef.current = true;
          navigateToThread(draftThreadId, { replace: true });
        }

        setIsDraftThreadHandoffPending(false);

        throw error;
      }
    },
    [
      draftThreadInitialized,
      draftThreadId,
      messages,
      navigateToThread,
      queuedFollowUps,
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
      if (isQuickChat) {
        void utils.threads.listQuickChats.invalidate();
      }
    },
    [isQuickChat, queueFollowUp, utils.threads.list],
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
      if (isQuickChat) {
        void utils.threads.listQuickChats.invalidate();
      }
    },
    [isQuickChat, steerFollowUp, utils.threads.list],
  );

  const handleStartPlanImplementation = useCallback(() => {
    const startPlanImplementation = startPlanImplementationRef.current;
    if (
      isBusy ||
      startPlanImplementationLockRef.current ||
      !startPlanImplementation
    ) {
      return;
    }
    startPlanImplementationLockRef.current = true;

    setChatError(null);
    void startPlanImplementation().catch((error) => {
      startPlanImplementationLockRef.current = false;
      setChatError(getErrorMessage(error));
    });
  }, [isBusy]);

  const handleRegisterStartPlanImplementation = useCallback(
    (handler: ChatComposerStartPlanImplementationHandler | null) => {
      startPlanImplementationRef.current = handler;
    },
    [],
  );

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
    setIsDraftThreadHandoffPending(false);
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
      setIsDraftThreadHandoffPending(false);
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
        actions={pageActions}
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
              </div>
            </div>

            {chatErrorBanner}
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
                onRegisterStartPlanImplementation={
                  handleRegisterStartPlanImplementation
                }
                onSelectionChange={handleSelectionChange}
                onSend={handleSend}
                onStartPlanImplementationSend={handleSend}
                onStop={stopStream}
                onSteerFollowUp={handleSteerFollowUp}
                onSteerQueuedFollowUp={handleSteerQueuedFollowUp}
                persistThreadSelection={
                  draftThreadInitialized || Boolean(threadDetailsQuery.data)
                }
                queuedFollowUps={queuedFollowUps}
                deferRepoContextFetch={isDraftThreadHandoffPending && !threadId}
                repoThreadId={repoThreadId ?? undefined}
                showBranchSwitcher={!isQuickChat}
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
    <PageWrapper
      actions={pageActions}
      title={isQuickChat ? "New Chat" : "New Project Thread"}
      flush
    >
      <div className="sentinel-scroll-shell h-full min-h-0">
        <div className="sentinel-scroll-area flex h-full flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6">
            <SentinelLogoBadge
              className="h-8 w-8 rounded-[1.75rem]"
              markClassName="h-9 w-9"
            />

            <h2 className="text-2xl font-medium text-foreground">
              {isQuickChat
                ? "What can I help you with?"
                : "What project do you want to work in?"}
            </h2>
            {isQuickChat ? (
              quickChatWorkspace.isLoading ? (
                <Spinner color="current" size="sm" />
              ) : null
            ) : (
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
            )}
          </div>

          {chatErrorBanner}
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
              onRegisterStartPlanImplementation={
                handleRegisterStartPlanImplementation
              }
              onSelectionChange={handleSelectionChange}
              onSend={handleSend}
              onStartPlanImplementationSend={handleSend}
              onStop={stopStream}
              onSteerFollowUp={handleSteerFollowUp}
              onSteerQueuedFollowUp={handleSteerQueuedFollowUp}
              persistThreadSelection={draftThreadInitialized}
              queuedFollowUps={queuedFollowUps}
              deferRepoContextFetch={isDraftThreadHandoffPending && !threadId}
              repoThreadId={repoThreadId ?? undefined}
              showBranchSwitcher={!isQuickChat}
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
