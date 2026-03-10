"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  Form,
  Input,
  Kbd,
  Label,
  Modal,
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
import type { ReasoningEffort } from "@/lib/ai/models";
import type { ThreadUIMessage } from "@/lib/ai/thread-message-types";
import {
  applyOptimisticThreadPinUpdate,
  restoreOptimisticThreadPinUpdate,
} from "@/lib/threads/cache";
import { api } from "@/trpc/react";
import type { ChatOnDataCallback } from "ai";
import type { FileUIPart } from "ai";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";

type ThreadScreenProps = {
  initialMessages: ThreadUIMessage[];
  thread: {
    chatModelId: string | null;
    chatReasoningEffort: string | null;
    id: string;
    pinnedAt: Date | null;
    summary: string | null;
    title: string;
  };
  workspace: {
    createdAt: Date;
    description: string | null;
    id: string;
    name: string;
    rootPath: string | null;
    updatedAt: Date;
  };
};

export function ThreadScreen({
  initialMessages,
  thread,
  workspace,
}: ThreadScreenProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [threadTitle, setThreadTitle] = useState(thread.title);
  const [editingMessage, setEditingMessage] = useState<ThreadUIMessage | null>(
    null,
  );

  useEffect(() => {
    setThreadTitle(thread.title);
  }, [thread.title]);

  const handleData = useCallback<ChatOnDataCallback<ThreadUIMessage>>(
    (dataPart) => {
      if (
        dataPart.type === "data-thread-title" &&
        dataPart.data.threadId === thread.id
      ) {
        setThreadTitle(dataPart.data.title);
        utils.threads.get.setData({ threadId: thread.id }, (current) =>
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
      }

      if (
        dataPart.type === "data-thread-invalidation" &&
        dataPart.data.threadId === thread.id
      ) {
        void utils.threads.get.invalidate({ threadId: thread.id });
        void utils.threads.list.invalidate();
      }
    },
    [thread.id, utils.threads.get, utils.threads.list],
  );

  const handleFinish = useCallback(() => {
    void utils.threads.get.invalidate({ threadId: thread.id });
    void utils.threads.list.invalidate();
  }, [thread.id, utils.threads.get, utils.threads.list]);

  const handleError = useCallback((error: Error) => {
    setChatError(error.message);
  }, []);

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
        name: workspace.name,
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
    onSuccess: () => {
      void utils.threads.get.invalidate({ threadId: thread.id });
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
    threadId: thread.id,
    initialMessages,
    onData: handleData,
    workspaceId: workspace.id,
    onFinish: handleFinish,
    onError: handleError,
  });
  const {
    editMessage,
    messages,
    regenerateMessage,
    retryMessage,
    sendMessage,
    status,
    stop,
  } = chat;

  const isBusy = status === "submitted" || status === "streaming";

  const handleSend = useCallback(
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
      setChatError(null);
      void sendMessage({ files, modelId, reasoningEffort, text });
    },
    [sendMessage],
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
          <Dropdown.Popover className="min-w-[200px]" placement="bottom end">
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
      title={
        <span className="flex items-center gap-1.5">
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
      flush
    >
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
                  onEdit={handleEdit}
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
            className="sticky bottom-0 z-50 mx-auto w-full max-w-2xl px-6 pb-3 pt-2"
          >
            <ChatComposer
              activeWorkspace={workspace}
              attachmentSeed={editingAttachmentSeed}
              isEditing={editingMessage != null}
              onCancelEdit={handleCancelEdit}
              onSend={editingMessage ? handleEditSubmit : handleSend}
              onStop={stop}
              promptSeed={editingPromptSeed}
              promptSeedKey={editingMessage?.id}
              status={status}
              threadId={thread.id}
              threadSelection={{
                modelId: thread.chatModelId,
                reasoningEffort:
                  (thread.chatReasoningEffort as ReasoningEffort | null) ??
                  null,
              }}
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
    </PageWrapper>
  );
}
