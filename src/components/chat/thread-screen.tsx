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
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useRouter } from "next/navigation";

import { PageWrapper } from "@/components/shell";
import { useThreadChat } from "@/hooks/use-thread-chat";
import type { QueuedFollowUpSummary } from "@/lib/ai/chat/session-types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import {
  applyThreadSnapshotCacheUpdate,
  applyThreadSettingsCacheUpdate,
  applyThreadStatusCacheUpdate,
  applyOptimisticThreadPinUpdate,
  restoreOptimisticThreadPinUpdate,
} from "@/lib/threads/cache";
import { api } from "@/trpc/react";
import type { FileUIPart } from "ai";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";
import { ThreadRepoActions } from "./thread-repo-actions";

type ThreadScreenProps = {
  initialMessages: ThreadUIMessage[];
  queuedFollowUps: QueuedFollowUpSummary[];
  thread: {
    activeRunId: string | null;
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
    modelId: thread.chatModelId,
    mode: thread.mode,
    reasoningEffort:
      (thread.chatReasoningEffort as ReasoningEffort | null) ?? null,
  });
  const [editingMessage, setEditingMessage] = useState<ThreadUIMessage | null>(
    null,
  );

  useEffect(() => {
    setThreadTitle(thread.title);
  }, [thread.title]);

  const handleError = useCallback((error: Error) => {
    setChatError(error.message);
  }, []);
  const handleSnapshot = useCallback(
    (snapshot: {
      activeRunId: string | null;
      messages: ThreadUIMessage[];
      queuedFollowUps: QueuedFollowUpSummary[];
      threadStatus: "idle" | "streaming" | "awaiting_approval";
      threadTitle: string;
    }) => {
      const current = utils.threads.get.getData({ threadId: thread.id });
      applyThreadSnapshotCacheUpdate({
        snapshot: {
          messages: snapshot.messages,
          queuedFollowUps: snapshot.queuedFollowUps,
          thread: {
            activeRunId: snapshot.activeRunId,
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
    },
    [thread.id, utils, workspace.id],
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
  const isPinned = thread.pinnedAt != null;
  const pinToggleLockRef = useRef(false);
  const startPlanImplementationLockRef = useRef(false);

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
    hydrateFromServer: true,
    initialActiveRunId: thread.activeRunId,
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
    editMessage,
    messages,
    queueFollowUp,
    queuedFollowUps: liveQueuedFollowUps,
    regenerateMessage,
    retryMessage,
    sendMessage,
    status,
    steerFollowUp,
    stopStream,
  } = chat;

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (status === "streaming") {
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
    if (isBusy) return;
    setThreadSelectionState({
      modelId: thread.chatModelId,
      mode: thread.mode,
      reasoningEffort:
        (thread.chatReasoningEffort as ReasoningEffort | null) ?? null,
    });
  }, [thread.chatModelId, thread.chatReasoningEffort, thread.mode, isBusy]);

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
      threadMode,
    }: {
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      setThreadSelectionState({
        modelId,
        mode: threadMode ?? threadSelectionState.mode,
        reasoningEffort: reasoningEffort ?? null,
      });
      applyThreadSettingsCacheUpdate({
        patch: {
          chatModelId: modelId,
          chatReasoningEffort: reasoningEffort ?? null,
          mode: threadMode ?? threadSelectionState.mode,
        },
        threadId: thread.id,
        utils,
        workspaceId: workspace.id,
      });
      void sendMessage({
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
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: {
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await queueFollowUp({
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode: threadMode ?? threadSelectionState.mode,
      });
      await utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    },
    [queueFollowUp, thread.id, threadSelectionState.mode, utils],
  );

  const handleSteerFollowUp = useCallback(
    async ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: {
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
      threadMode?: "chat" | "plan";
    }) => {
      setChatError(null);
      await steerFollowUp({
        files,
        modelId,
        reasoningEffort,
        text,
        threadMode: threadMode ?? threadSelectionState.mode,
      });
      await utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    },
    [steerFollowUp, thread.id, threadSelectionState.mode, utils],
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

  const handleEdit = useCallback((message: ThreadUIMessage) => {
    setEditingMessage(message);
    setChatError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

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

  const handleEditSubmit = useCallback(
    ({
      files,
      modelId,
      reasoningEffort,
      text,
    }: {
      files?: FileUIPart[];
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
    }) => {
      if (!editingMessage) {
        return;
      }

      setChatError(null);
      void editMessage({
        files,
        modelId,
        reasoningEffort,
        targetMessageId: editingMessage.id,
        text,
      });
      setEditingMessage(null);
    },
    [editMessage, editingMessage],
  );

  const confirmArchiveState = useOverlayState({});
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

  const handleStartPlanImplementation = useCallback(() => {
    if (isBusy || startPlanImplementationLockRef.current) {
      return;
    }
    startPlanImplementationLockRef.current = true;

    const cachedThread = utils.threads.get.getData({
      threadId: thread.id,
    })?.thread;
    const globalSelection = utils.chatPreferences.get.getData();
    const modelId =
      threadSelectionState.modelId ??
      cachedThread?.chatModelId ??
      globalSelection?.modelId ??
      null;
    const reasoningEffort =
      threadSelectionState.reasoningEffort ??
      (cachedThread?.chatReasoningEffort as ReasoningEffort | null) ??
      (globalSelection?.reasoningEffort as ReasoningEffort | null) ??
      null;

    if (!modelId) {
      startPlanImplementationLockRef.current = false;
      setChatError("Select a model before starting implementation.");
      return;
    }

    setChatError(null);
    setThreadSelectionState({
      modelId,
      mode: "chat",
      reasoningEffort,
    });
    applyThreadSettingsCacheUpdate({
      patch: {
        chatModelId: modelId,
        chatReasoningEffort: reasoningEffort,
        mode: "chat",
      },
      threadId: thread.id,
      utils,
      workspaceId: workspace.id,
    });

    void sendMessage({
      modelId,
      reasoningEffort,
      text: "Implement Plan",
      threadMode: "chat",
    });
  }, [
    isBusy,
    sendMessage,
    thread.id,
    threadSelectionState,
    utils,
    workspace.id,
  ]);

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
          workspaceId={workspace.id}
          workspaceRootPath={workspace.rootPath}
        />
      }
      title={
        <span className="flex min-w-0 max-w-[min(52vw,36rem)] items-center gap-1.5">
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
                <Kbd slot="keyboard">&#x2325;&#x2318;P</Kbd>
              </Dropdown.Item>
              <Dropdown.Item id="rename" textValue="Rename thread">
                <HugeiconsIcon
                  color="currentColor"
                  icon={PencilEdit02Icon}
                  size={16}
                  strokeWidth={1.5}
                />
                <Label>Rename thread</Label>
                <Kbd slot="keyboard">&#x2303;&#x2318;R</Kbd>
              </Dropdown.Item>
              <Dropdown.Item id="archive" textValue="Archive thread">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Archive02Icon}
                  size={16}
                  strokeWidth={1.5}
                />
                <Label>Archive thread</Label>
                <Kbd slot="keyboard">&#x21E7;&#x2318;A</Kbd>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      }
      flush
    >
      <div className="sentinel-scroll-shell relative h-full">
        <ScrollShadow
          ref={scrollAreaRef}
          className="sentinel-scroll-area flex h-[calc(100vh-44px)] flex-col"
        >
          <div className="mx-auto w-full max-w-2xl flex-1 px-6 pt-4 pb-20">
            <div className="flex flex-col gap-4">
              {messages.map((message, idx) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    status === "streaming" && idx === messages.length - 1
                  }
                  onApproveTool={handleApproveTool}
                  onAnswerPlanQuestions={handleAnswerPlanQuestions}
                  onDenyTool={handleDenyTool}
                  onEdit={handleEdit}
                  onStartPlanImplementation={handleStartPlanImplementation}
                  onRegenerate={handleRegenerate}
                  onRetry={handleRetry}
                  onSelectBranch={handleSelectBranch}
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
              activeWorkspace={workspace}
              attachmentSeed={editingAttachmentSeed}
              isEditing={editingMessage != null}
              onCancelEdit={handleCancelEdit}
              onQueueFollowUp={handleQueueFollowUp}
              onRemoveQueuedFollowUp={async (id) => {
                await removeQueuedFollowUp.mutateAsync({
                  followUpId: id,
                  threadId: thread.id,
                });
              }}
              onSend={editingMessage ? handleEditSubmit : handleSend}
              onStop={stopStream}
              onSteerFollowUp={handleSteerFollowUp}
              onSteerQueuedFollowUp={async (id) => {
                await steerQueuedFollowUp.mutateAsync({
                  followUpId: id,
                  threadId: thread.id,
                });
              }}
              promptSeed={editingPromptSeed}
              promptSeedKey={editingMessage?.id}
              queuedFollowUps={liveQueuedFollowUps}
              showBranchSwitcher
              status={status}
              threadId={thread.id}
              threadSelection={{
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
                Archive{" "}
                <span className="font-medium">{threadTitle}</span>?
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
    </PageWrapper>
  );
}
