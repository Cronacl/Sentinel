"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Dropdown,
  Form,
  Input,
  Kbd,
  Label,
  Modal,
  ScrollShadow,
  Spinner,
  TextField,
  useOverlayState,
} from "@heroui/react";
import {
  Archive02Icon,
  ArrowTurnBackwardIcon,
  MinimizeScreenIcon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useRouter } from "next/navigation";
import { sileo } from "sileo";

import { PageWrapper } from "@/components/shell";
import { useThreadChat } from "@/hooks/use-thread-chat";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";
import { moveQueuedFollowUpToFront } from "@/hooks/use-thread-chat";
import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { getErrorMessage } from "@/lib/errors";
import {
  useShortcutAction,
  useShortcutLabel,
  useShortcutScope,
} from "@/lib/shortcuts/provider";
import type { ChatEngine } from "@/server/db/enums";
import {
  applyThreadSnapshotCacheUpdate,
  applyThreadSettingsCacheUpdate,
  applyThreadStatusCacheUpdate,
  applyThreadTitleCacheUpdate,
  applyOptimisticThreadPinUpdate,
  restoreOptimisticThreadPinUpdate,
} from "@/lib/threads/cache";
import { api } from "@/trpc/react";
import type { FileUIPart } from "ai";

import {
  ChatComposer,
  type ChatComposerStartPlanImplementationHandler,
} from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";
import {
  buildRepoDiffPanelInvalidationInputs,
  reapplyUserMessageCheckpoint,
} from "./thread-checkpoints";
import { ThreadRepoActions } from "./thread-repo-actions";

type ThreadScreenProps = {
  initialMessages: ThreadUIMessage[];
  queuedFollowUps: QueuedFollowUpSummary[];
  thread: {
    activeRunId: string | null;
    chatEngine: ChatEngine;
    chatModelId: string | null;
    chatReasoningEffort: string | null;
    id: string;
    mode: "chat" | "plan";
    pinnedAt: Date | null;
    status: "idle" | "streaming" | "awaiting_approval";
    summary: string | null;
    title: string;
  };
  workspace: {
    createdAt: Date;
    description: string | null;
    id: string;
    name: string;
    permissionModeOverride: "default" | "full" | null;
    rootPath: string | null;
    updatedAt: Date;
  };
};

export function ThreadScreen({
  initialMessages,
  queuedFollowUps,
  thread,
  workspace,
}: ThreadScreenProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [threadTitle, setThreadTitle] = useState(thread.title);
  const [threadSelectionState, setThreadSelectionState] = useState({
    engine: thread.chatEngine,
    modelId: thread.chatModelId,
    mode: thread.mode,
    reasoningEffort:
      (thread.chatReasoningEffort as ReasoningEffort | null) ?? null,
  });
  const threadSelectionStateRef = useRef(threadSelectionState);
  threadSelectionStateRef.current = threadSelectionState;
  const [editingMessage, setEditingMessage] = useState<ThreadUIMessage | null>(
    null,
  );

  useEffect(() => {
    setThreadTitle(thread.title);
  }, [thread.title]);

  const handleError = useCallback((error: Error) => {
    if (isCommittedThreadActionError(error)) {
      return;
    }

    setChatError(error.message);
  }, []);
  const repoContextQueryInput = useMemo(
    () => ({
      threadId: thread.id,
      workspaceId: workspace.id,
    }),
    [thread.id, workspace.id],
  );
  const handleSnapshot = useCallback(
    (snapshot: {
      activeRunId: string | null;
      messages: ThreadUIMessage[];
      mode?: "chat" | "plan" | null;
      queuedFollowUps: QueuedFollowUpSummary[];
      threadStatus: "idle" | "streaming" | "awaiting_approval";
      threadTitle: string;
    }) => {
      setThreadTitle(snapshot.threadTitle);
      if (
        snapshot.mode &&
        snapshot.mode !== threadSelectionStateRef.current.mode
      ) {
        setThreadSelectionState((prev) => ({
          ...prev,
          mode: snapshot.mode!,
        }));
      }
      const current = utils.threads.get.getData({ threadId: thread.id });
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
        threadId: thread.id,
        utils,
        workspace: current?.workspace,
        workspaceId: workspace.id,
      });
      void utils.repo.getContext.invalidate(repoContextQueryInput);
    },
    [repoContextQueryInput, thread.id, utils, workspace.id],
  );

  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const selectWorkspace = api.workspaces.select.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previousCurrentWorkspace = utils.workspaces.getCurrent.getData();
      const previousWorkspaces = utils.workspaces.list.getData();

      utils.workspaces.getCurrent.setData(undefined, {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isArchived: false,
        isExpanded: false,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
        rootPath: workspace.rootPath,
        updatedAt: workspace.updatedAt,
        userId: "",
      });
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((item) => ({
          ...item,
          isSelected: item.id === workspaceId,
        })),
      );

      return { previousCurrentWorkspace, previousWorkspaces };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.getCurrent.setData(
        undefined,
        context?.previousCurrentWorkspace ?? null,
      );
      utils.workspaces.list.setData(
        undefined,
        context?.previousWorkspaces ?? [],
      );
    },
  });

  const [chatError, setChatError] = useState<string | null>(null);
  const [busyCheckpointMessageId, setBusyCheckpointMessageId] = useState<
    string | null
  >(null);
  const [pendingCheckpointReset, setPendingCheckpointReset] = useState<{
    checkpointId: string;
    message: ThreadUIMessage;
  } | null>(null);
  const isPinned = thread.pinnedAt != null;
  const threadScope = useShortcutScope({
    kind: "thread",
  });
  const pinShortcutLabel = useShortcutLabel("thread.pinToggle");
  const renameShortcutLabel = useShortcutLabel("thread.rename");
  const archiveShortcutLabel = useShortcutLabel("thread.archive");
  const pinToggleLockRef = useRef(false);
  const startPlanImplementationLockRef = useRef(false);
  const startPlanImplementationRef =
    useRef<ChatComposerStartPlanImplementationHandler | null>(null);

  const togglePin = api.threads.togglePin.useMutation({
    onMutate: async ({ pinned }) => {
      return applyOptimisticThreadPinUpdate({
        pinnedAt: pinned ? new Date() : null,
        threadId: thread.id,
        utils,
        workspaceId: workspace.id,
      });
    },
    onSuccess: (updatedThread) => {
      applyOptimisticThreadPinUpdate({
        pinnedAt: updatedThread.pinnedAt,
        threadId: thread.id,
        utils,
        workspaceId: workspace.id,
      });
    },
    onError: (_error, _variables, context) => {
      restoreOptimisticThreadPinUpdate(utils, context, thread.id);
    },
    onSettled: () => {
      pinToggleLockRef.current = false;
      void utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    },
  });
  const renameThread = api.threads.rename.useMutation({
    onSuccess: (nextThread) => {
      setThreadTitle(nextThread.title);
      applyThreadTitleCacheUpdate({
        threadId: thread.id,
        title: nextThread.title,
        utils,
        workspaceId: workspace.id,
      });
      void utils.threads.list.invalidate();
      void utils.threads.get.invalidate({ threadId: thread.id });
    },
  });
  const archiveThread = api.threads.archive.useMutation({
    onSuccess: () => {
      void utils.threads.list.invalidate();
      router.push("/");
    },
  });
  const setActiveBranch = api.threads.setActiveBranch.useMutation({
    onSuccess: (result) => {
      utils.threads.get.setData({ threadId: thread.id }, (current) =>
        current
          ? {
              ...current,
              messages: result.messages,
            }
          : current,
      );
      void utils.threads.get.invalidate({ threadId: thread.id });
    },
  });
  const removeQueuedFollowUp = api.threads.removeQueuedFollowUp.useMutation({
    onSuccess: () => {
      void utils.threads.get.invalidate({ threadId: thread.id });
    },
  });
  const steerQueuedFollowUp = api.threads.steerQueuedFollowUp.useMutation({
    onSuccess: () => {
      void utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    },
  });
  const {
    buttonDirection,
    composerDockRef,
    composerOffset,
    isButtonVisible,
    jump,
    scrollAreaRef,
  } = useChatScrollControl(thread.id);

  const chat = useThreadChat({
    initialActiveRunId: thread.activeRunId,
    initialChatEngine: thread.chatEngine,
    threadId: thread.id,
    initialMessages,
    initialQueuedFollowUps: queuedFollowUps,
    initialThreadStatus: thread.status,
    initialThreadTitle: thread.title,
    workspaceId: workspace.id,
    onError: handleError,
    onSnapshot: handleSnapshot,
  });
  const {
    addToolApprovalResponse,
    answerPlanQuestions,
    chatEngine,
    editMessage,
    errorMessage,
    messages,
    queueFollowUp,
    queuedFollowUps: liveQueuedFollowUps,
    replaceQueuedFollowUpsLocally,
    regenerateMessage,
    retryMessage,
    sendMessage,
    status,
    steerFollowUp,
    stopStream,
    threadStatus,
  } = chat;
  const repoContextQuery = api.repo.getContext.useQuery(repoContextQueryInput, {
    enabled: Boolean(workspace.rootPath),
  });
  const resetCheckpointMutation = api.repo.resetCheckpoint.useMutation();
  const toggleCheckpointMutation = api.repo.toggleCheckpoint.useMutation();

  const isBusy = status === "submitted" || status === "streaming";
  const visibleChatError = chatError ?? errorMessage;

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      applyThreadStatusCacheUpdate({
        status: "streaming",
        threadId: thread.id,
        utils,
        workspaceId: workspace.id,
      });
      void utils.threads.list.invalidate();
    }
  }, [status, thread.id, utils, workspace.id]);

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
      files,
      engine,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      files?: FileUIPart[];
      engine: ChatEngine;
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      setThreadSelectionState({
        engine,
        modelId,
        mode: threadMode ?? threadSelectionState.mode,
        reasoningEffort: reasoningEffort ?? null,
      });
      applyThreadSettingsCacheUpdate({
        patch: {
          chatEngine: engine,
          chatModelId: modelId,
          chatReasoningEffort: reasoningEffort ?? null,
          mode: threadMode ?? threadSelectionState.mode,
        },
        threadId: thread.id,
        utils,
        workspaceId: workspace.id,
      });
      await sendMessage({
        composerContext,
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode: threadMode ?? threadSelectionState.mode,
      });
    },
    [sendMessage, thread.id, threadSelectionState.mode, utils, workspace.id],
  );

  const handleQueueFollowUp = useCallback(
    async ({
      composerContext,
      files,
      engine,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      files?: FileUIPart[];
      engine: ChatEngine;
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await queueFollowUp({
        composerContext,
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode: threadMode ?? threadSelectionState.mode,
      });
      void utils.threads.list.invalidate();
    },
    [queueFollowUp, threadSelectionState.mode, utils],
  );

  const handleSteerFollowUp = useCallback(
    async ({
      composerContext,
      files,
      engine,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: {
      composerContext?: import("@/lib/composer-context/types").ComposerContext;
      files?: FileUIPart[];
      engine: ChatEngine;
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await steerFollowUp({
        composerContext,
        engine,
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode: threadMode ?? threadSelectionState.mode,
      });
      void utils.threads.list.invalidate();
    },
    [steerFollowUp, threadSelectionState.mode, utils],
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

  const handleEdit = useCallback((message: ThreadUIMessage) => {
    setEditingMessage(message);
    setChatError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

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
      setThreadSelectionState((current) => ({
        engine: engine ?? current.engine,
        modelId: modelId !== undefined ? modelId : current.modelId,
        mode: mode ?? current.mode,
        reasoningEffort:
          reasoningEffort !== undefined
            ? reasoningEffort
            : current.reasoningEffort,
      }));
    },
    [],
  );

  const editingAttachmentSeed = useMemo(
    () =>
      editingMessage?.parts.filter(
        (part): part is FileUIPart => part.type === "file",
      ) ?? [],
    [editingMessage],
  );

  const editingPromptSeed = useMemo(
    () =>
      editingMessage?.parts
        .filter(
          (
            part,
          ): part is Extract<
            ThreadUIMessage["parts"][number],
            { type: "text" }
          > => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n\n") ?? undefined,
    [editingMessage],
  );
  const userMessageCheckpointIds = useMemo(() => {
    const checkpointIds = new Map<string, string>();

    for (const message of messages) {
      const repoCheckpointId = message.metadata?.repoCheckpointId ?? null;
      if (!repoCheckpointId) {
        continue;
      }

      if (message.role === "user") {
        checkpointIds.set(message.id, repoCheckpointId);
        continue;
      }

      const parentMessageId = message.metadata?.parentMessageId ?? null;
      if (parentMessageId && !checkpointIds.has(parentMessageId)) {
        checkpointIds.set(parentMessageId, repoCheckpointId);
      }
    }

    for (let index = 0; index < messages.length - 1; index += 1) {
      const message = messages[index];
      if (
        !message ||
        message.role !== "user" ||
        checkpointIds.has(message.id)
      ) {
        continue;
      }

      const nextMessage = messages[index + 1];
      if (nextMessage?.role !== "assistant") {
        continue;
      }

      const nextCheckpointId = nextMessage.metadata?.repoCheckpointId ?? null;
      const parentMessageId = nextMessage.metadata?.parentMessageId ?? null;
      if (
        nextCheckpointId &&
        (parentMessageId == null || parentMessageId === message.id)
      ) {
        checkpointIds.set(message.id, nextCheckpointId);
      }
    }

    return checkpointIds;
  }, [messages]);

  const handleEditSubmit = useCallback(
    async ({
      engine,
      files,
      modelId,
      reasoningEffort,
      text,
    }: {
      engine: ChatEngine;
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
    }) => {
      if (!editingMessage) {
        return;
      }

      setChatError(null);
      try {
        await editMessage({
          engine,
          files,
          modelId,
          reasoningEffort,
          targetMessageId: editingMessage.id,
          text,
        });
        setEditingMessage(null);
      } catch (error) {
        if (isCommittedThreadActionError(error)) {
          setEditingMessage(null);
        }

        throw error;
      }
    },
    [editMessage, editingMessage],
  );

  const confirmArchiveState = useOverlayState({});
  const confirmResetCheckpointState = useOverlayState({});
  const renameState = useOverlayState({});
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleOpenRename = useCallback(() => {
    renameState.open();
  }, [renameState]);

  const handleRenameSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const nextTitle = (formData.get("title") as string)?.trim();
      if (!nextTitle) return;
      void renameThread.mutate({ threadId: thread.id, title: nextTitle });
      renameState.close();
    },
    [renameThread, renameState, thread.id],
  );

  const handleTogglePin = useCallback(() => {
    if (pinToggleLockRef.current) {
      return;
    }

    const nextPinned =
      (utils.threads.get.getData({ threadId: thread.id })?.thread.pinnedAt ??
        thread.pinnedAt) == null;

    pinToggleLockRef.current = true;
    void togglePin.mutate({ pinned: nextPinned, threadId: thread.id });
  }, [thread.id, thread.pinnedAt, togglePin, utils.threads.get]);

  const handleArchive = useCallback(() => {
    confirmArchiveState.open();
  }, [confirmArchiveState]);
  useShortcutAction("thread.pinToggle", handleTogglePin, {
    scopeId: threadScope.id,
  });
  useShortcutAction("thread.rename", handleOpenRename, {
    scopeId: threadScope.id,
  });
  useShortcutAction("thread.archive", handleArchive, {
    scopeId: threadScope.id,
  });

  const codexReview = api.engines.codexReview.useMutation();
  const codexRollback = api.engines.codexRollback.useMutation();
  const codexCompact = api.engines.codexCompact.useMutation();

  const handleStartCodexReview = useCallback(() => {
    if (chatEngine !== "codex") return;
    void codexReview.mutate({ threadId: thread.id });
  }, [chatEngine, codexReview, thread.id]);

  const handleCodexRollback = useCallback(() => {
    if (chatEngine !== "codex") return;
    void codexRollback.mutate({ count: 1, threadId: thread.id });
  }, [chatEngine, codexRollback, thread.id]);

  const handleCodexCompact = useCallback(() => {
    if (chatEngine !== "codex") return;
    void codexCompact.mutate({ threadId: thread.id });
  }, [chatEngine, codexCompact, thread.id]);

  const handleConfirmArchive = useCallback(() => {
    void archiveThread.mutate({ threadId: thread.id });
  }, [archiveThread, thread.id]);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      void regenerateMessage(messageId);
    },
    [regenerateMessage],
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      void retryMessage(messageId);
    },
    [retryMessage],
  );

  const handleSelectBranch = useCallback(
    (messageId: string) => {
      void setActiveBranch.mutate({
        messageId,
        threadId: thread.id,
      });
    },
    [setActiveBranch, thread.id],
  );

  const handleOpenResetCheckpoint = useCallback(
    (message: ThreadUIMessage, checkpointId: string) => {
      setPendingCheckpointReset({ checkpointId, message });
      setChatError(null);
      confirmResetCheckpointState.open();
    },
    [confirmResetCheckpointState],
  );

  const handleConfirmResetCheckpoint = useCallback(async () => {
    if (!pendingCheckpointReset) {
      return;
    }

    const { checkpointId, message } = pendingCheckpointReset;
    const previousRepoContext =
      utils.repo.getContext.getData(repoContextQueryInput) ?? null;

    setBusyCheckpointMessageId(message.id);
    setChatError(null);

    if (previousRepoContext) {
      utils.repo.getContext.setData(repoContextQueryInput, {
        ...previousRepoContext,
        checkpointAnchorMessageId: message.id,
      });
    }

    try {
      const result = await resetCheckpointMutation.mutateAsync({
        checkpointId,
        threadId: thread.id,
        userMessageId: message.id,
        workspaceId: workspace.id,
      });

      utils.repo.getContext.setData(repoContextQueryInput, result.repoContext);
      await Promise.all(
        buildRepoDiffPanelInvalidationInputs({
          threadId: thread.id,
          workspaceId: workspace.id,
        }).map((input) => utils.repo.getDiffPanelData.invalidate(input)),
      );

      setEditingMessage(message);
      sileo.success({
        description:
          "The repo was restored and the composer is now editing this message.",
        title: "Ready to branch from here",
      });

      confirmResetCheckpointState.close();
      setPendingCheckpointReset(null);
    } catch (error) {
      if (previousRepoContext) {
        utils.repo.getContext.setData(
          repoContextQueryInput,
          previousRepoContext,
        );
      }
      setChatError(getErrorMessage(error, "Unable to reset to this point."));
    } finally {
      setBusyCheckpointMessageId(null);
      await utils.repo.getContext.invalidate(repoContextQueryInput);
    }
  }, [
    chatEngine,
    confirmResetCheckpointState,
    pendingCheckpointReset,
    repoContextQueryInput,
    resetCheckpointMutation,
    thread.id,
    utils.repo.getContext,
    utils.repo.getDiffPanelData,
    workspace.id,
  ]);

  const handleReapplyCheckpoint = useCallback(
    async (message: ThreadUIMessage) => {
      const previousRepoContext =
        utils.repo.getContext.getData(repoContextQueryInput) ?? null;

      setBusyCheckpointMessageId(message.id);
      try {
        const reapplied = await reapplyUserMessageCheckpoint({
          clearEditingMessage: () => setEditingMessage(null),
          invalidateRepoContext: () =>
            utils.repo.getContext.invalidate(repoContextQueryInput),
          invalidateRepoDiffPanels: () =>
            Promise.all(
              buildRepoDiffPanelInvalidationInputs({
                threadId: thread.id,
                workspaceId: workspace.id,
              }).map((input) => utils.repo.getDiffPanelData.invalidate(input)),
            ),
          notifySuccess: () => {
            sileo.success({
              description:
                "The repo was restored to the latest checkpoint and the composer exited edit mode.",
              title: "Latest checkpoint restored",
            });
          },
          previousRepoContext,
          setError: setChatError,
          setRepoContext: (nextRepoContext) => {
            utils.repo.getContext.setData(repoContextQueryInput, (current) =>
              current ? { ...current, ...nextRepoContext } : current,
            );
          },
          threadId: thread.id,
          toggleCheckpoint: (input) =>
            toggleCheckpointMutation.mutateAsync(input),
          workspaceId: workspace.id,
        });

        if (reapplied) {
          setPendingCheckpointReset(null);
        }
      } finally {
        setBusyCheckpointMessageId(null);
      }
    },
    [
      repoContextQueryInput,
      thread.id,
      toggleCheckpointMutation,
      utils.repo.getContext,
      utils.repo.getDiffPanelData,
      workspace.id,
    ],
  );

  const handleRepoCheckpointAction = useCallback(
    (input: {
      action: "reapply" | "reset";
      checkpointId: string;
      message: ThreadUIMessage;
    }) => {
      if (input.action === "reapply") {
        void handleReapplyCheckpoint(input.message);
        return;
      }

      handleOpenResetCheckpoint(input.message, input.checkpointId);
    },
    [handleOpenResetCheckpoint, handleReapplyCheckpoint],
  );

  const handleResetCheckpointOpenChange = useCallback(
    (isOpen: boolean) => {
      confirmResetCheckpointState.setOpen(isOpen);
      if (!isOpen) {
        setPendingCheckpointReset(null);
      }
    },
    [confirmResetCheckpointState],
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

  const supportsSentinelMessageActions = chatEngine === "sentinel";
  const isBranchSwitchingDisabled =
    status === "submitted" || status === "streaming";

  useEffect(() => {
    if (
      currentWorkspace.isLoading ||
      currentWorkspace.data?.id === workspace.id ||
      selectWorkspace.isPending
    ) {
      return;
    }

    void selectWorkspace.mutate({ workspaceId: workspace.id });
  }, [
    currentWorkspace.data,
    currentWorkspace.isLoading,
    selectWorkspace,
    selectWorkspace.isPending,
    workspace.id,
  ]);

  return (
    <PageWrapper
      actions={
        <ThreadRepoActions
          threadId={thread.id}
          workspaceId={workspace.id}
          workspaceRootPath={workspace.rootPath}
        />
      }
      title={
        <span className="flex min-w-0 max-w-[min(36vw,22rem)] items-center gap-1.5">
          {isPinned && (
            <HugeiconsIcon
              className="shrink-0 text-muted"
              color="currentColor"
              icon={PinIcon}
              size={13}
              strokeWidth={1.5}
            />
          )}
          <span className="truncate">{threadTitle}</span>
        </span>
      }
      titleActions={
        <Dropdown>
          <Button
            aria-label="Thread options"
            isIconOnly
            size="sm"
            variant="ghost"
            className="h-7 w-7 min-w-7"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={MoreHorizontalIcon}
              size={18}
              strokeWidth={1.5}
            />
          </Button>
          <Dropdown.Popover className="min-w-[200px]" placement="bottom start">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "pin") handleTogglePin();
                if (key === "rename") handleOpenRename();
                if (key === "archive") handleArchive();
                if (key === "codex-review") void handleStartCodexReview();
                if (key === "codex-rollback") void handleCodexRollback();
                if (key === "codex-compact") void handleCodexCompact();
              }}
            >
              <Dropdown.Item
                id="pin"
                textValue={isPinned ? "Unpin thread" : "Pin thread"}
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={isPinned ? PinOffIcon : PinIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <Label>{isPinned ? "Unpin thread" : "Pin thread"}</Label>
                {pinShortcutLabel ? (
                  <Kbd slot="keyboard">{pinShortcutLabel}</Kbd>
                ) : null}
              </Dropdown.Item>
              <Dropdown.Item id="rename" textValue="Rename thread">
                <HugeiconsIcon
                  color="currentColor"
                  icon={PencilEdit02Icon}
                  size={16}
                  strokeWidth={1.5}
                />
                <Label>Rename thread</Label>
                {renameShortcutLabel ? (
                  <Kbd slot="keyboard">{renameShortcutLabel}</Kbd>
                ) : null}
              </Dropdown.Item>
              <Dropdown.Item id="archive" textValue="Archive thread">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Archive02Icon}
                  size={16}
                  strokeWidth={1.5}
                />
                <Label>Archive thread</Label>
                {archiveShortcutLabel ? (
                  <Kbd slot="keyboard">{archiveShortcutLabel}</Kbd>
                ) : null}
              </Dropdown.Item>
              {chatEngine === "codex" && (
                <>
                  <Dropdown.Item id="codex-review" textValue="Start review">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ViewIcon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    <Label>Start review</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="codex-rollback" textValue="Undo last turn">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ArrowTurnBackwardIcon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    <Label>Undo last turn</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="codex-compact" textValue="Compact context">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={MinimizeScreenIcon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    <Label>Compact context</Label>
                  </Dropdown.Item>
                </>
              )}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      }
      flush
    >
      <div className="sentinel-scroll-shell relative h-full min-h-0">
        <ScrollShadow
          ref={scrollAreaRef}
          visibility="top"
          className="sentinel-scroll-area flex h-full flex-col"
        >
          <div className="mx-auto w-full max-w-2xl flex-1 px-6 pt-4 pb-20">
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
                  onApproveToolWithDecision={handleApproveToolWithDecision}
                  onAnswerPlanQuestions={handleAnswerPlanQuestions}
                  onDenyTool={handleDenyTool}
                  onEdit={handleEdit}
                  onRepoCheckpointAction={handleRepoCheckpointAction}
                  onStartPlanImplementation={
                    !isBusy &&
                    (idx === messages.length - 1 || idx === messages.length - 2)
                      ? handleStartPlanImplementation
                      : undefined
                  }
                  onRegenerate={
                    supportsSentinelMessageActions
                      ? handleRegenerate
                      : undefined
                  }
                  onRetry={
                    supportsSentinelMessageActions ? handleRetry : undefined
                  }
                  onSelectBranch={handleSelectBranch}
                  disableBranchSwitching={isBranchSwitchingDisabled}
                  repoCheckpointAnchorMessageId={
                    repoContextQuery.data?.checkpointAnchorMessageId ?? null
                  }
                  repoCheckpointBusyMessageId={busyCheckpointMessageId}
                  repoCheckpointCursorId={
                    repoContextQuery.data?.checkpointCursorId ?? null
                  }
                  repoCheckpointId={
                    message.role === "user"
                      ? (userMessageCheckpointIds.get(message.id) ?? null)
                      : null
                  }
                  repoCheckpointLatestId={
                    repoContextQuery.data?.checkpointLatestId ?? null
                  }
                  repoCheckpointPathMatches={
                    repoContextQuery.data?.checkpointPathMatches ?? true
                  }
                  workspaceRootPath={workspace.rootPath}
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
              activeWorkspace={workspace}
              attachmentSeed={editingAttachmentSeed}
              isEditing={editingMessage != null}
              onCancelEdit={handleCancelEdit}
              onQueueFollowUp={handleQueueFollowUp}
              onRemoveQueuedFollowUp={async (id) => {
                const previousQueue = liveQueuedFollowUps;
                replaceQueuedFollowUpsLocally(
                  previousQueue.filter((followUp) => followUp.id !== id),
                );

                try {
                  await removeQueuedFollowUp.mutateAsync({
                    followUpId: id,
                    threadId: thread.id,
                  });
                } catch (error) {
                  replaceQueuedFollowUpsLocally(previousQueue);
                  throw error;
                }
              }}
              onRegisterStartPlanImplementation={
                handleRegisterStartPlanImplementation
              }
              onSelectionChange={handleSelectionChange}
              onSend={editingMessage ? handleEditSubmit : handleSend}
              onStartPlanImplementationSend={handleSend}
              onStop={stopStream}
              onSteerFollowUp={handleSteerFollowUp}
              onSteerQueuedFollowUp={async (id) => {
                const previousQueue = liveQueuedFollowUps;
                replaceQueuedFollowUpsLocally(
                  moveQueuedFollowUpToFront(previousQueue, id),
                );

                try {
                  await steerQueuedFollowUp.mutateAsync({
                    followUpId: id,
                    threadId: thread.id,
                  });
                } catch (error) {
                  replaceQueuedFollowUpsLocally(previousQueue);
                  throw error;
                }
              }}
              promptSeed={editingPromptSeed}
              promptSeedKey={editingMessage?.id ?? "__composer-empty__"}
              queuedFollowUps={liveQueuedFollowUps}
              repoThreadId={thread.id}
              showBranchSwitcher
              status={status}
              threadId={thread.id}
              threadSelection={{
                engine: threadSelectionState.engine,
                modelId: threadSelectionState.modelId,
                mode: threadSelectionState.mode,
                reasoningEffort: threadSelectionState.reasoningEffort,
              }}
            />
          </div>
        </ScrollShadow>
        <ChatScrollControl
          bottomOffset={composerOffset}
          direction={buttonDirection}
          isVisible={isButtonVisible}
          onClick={jump}
        />
      </div>
      <Modal.Root state={renameState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-separator w-full border sm:max-w-[400px]">
              <Form className="contents" onSubmit={handleRenameSubmit}>
                <Modal.Header className="items-start justify-between gap-4">
                  <Modal.Heading className="text-base">
                    Rename thread
                  </Modal.Heading>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body className="p-2">
                  <TextField.Root
                    autoFocus
                    defaultValue={threadTitle}
                    isRequired
                    name="title"
                  >
                    <Label>Thread title</Label>
                    <Input.Root ref={renameInputRef} />
                  </TextField.Root>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    onPress={() => renameState.close()}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button isPending={renameThread.isPending} type="submit">
                    Rename
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <AlertDialog.Backdrop
        isOpen={confirmArchiveState.isOpen}
        onOpenChange={confirmArchiveState.setOpen}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Archive thread</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Archive <span className="font-medium">{threadTitle}</span>?
              </p>
              <p className="mt-1 text-xs text-muted">
                The thread will be removed from your active list. You can
                restore it later from the archived threads view.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => confirmArchiveState.close()}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={archiveThread.isPending}
                onPress={handleConfirmArchive}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Archive
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <AlertDialog.Backdrop
        isOpen={confirmResetCheckpointState.isOpen}
        onOpenChange={handleResetCheckpointOpenChange}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[460px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Reset to this message</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Return to this user message and remove the repo changes that
                came after it?
              </p>
              <p className="mt-1 text-xs text-muted">
                The repo will be restored to the point before the following
                response, the composer will open this message in edit mode, and
                later turns will stay available as an alternate branch.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => handleResetCheckpointOpenChange(false)}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={resetCheckpointMutation.isPending}
                onPress={handleConfirmResetCheckpoint}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Reset to here
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </PageWrapper>
  );
}
