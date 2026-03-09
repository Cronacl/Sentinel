"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Archive02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { PageWrapper } from "@/components/shell";
import { useThreadChat } from "@/hooks/use-thread-chat";
import type { ReasoningEffort } from "@/lib/ai/models";
import type { ThreadUIMessage } from "@/lib/ai/thread-message-types";
import { api } from "@/trpc/react";
import type { ChatOnDataCallback } from "ai";
import type { FileUIPart } from "ai";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ChatScrollControl, useChatScrollControl } from "./chat-scroll-control";

type ThreadScreenProps = {
  initialMessages: ThreadUIMessage[];
  thread: {
    id: string;
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
  const utils = api.useUtils();
  const [threadTitle, setThreadTitle] = useState(thread.title);
  const [editingMessage, setEditingMessage] = useState<ThreadUIMessage | null>(null);
  const handleData: ChatOnDataCallback<ThreadUIMessage> = (dataPart) => {
    if (
      dataPart.type === "data-thread-title" &&
      dataPart.data.threadId === thread.id
    ) {
      setThreadTitle(dataPart.data.title);
    }

    if (
      dataPart.type === "data-thread-invalidation" &&
      dataPart.data.threadId === thread.id
    ) {
      void utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    }
  };

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
      window.history.pushState(null, "", "/");
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
    onFinish: () => {
      void utils.threads.get.invalidate({ threadId: thread.id });
      void utils.threads.list.invalidate();
    },
    onError: (error) => {
      setChatError(error.message);
    },
  });

  const isBusy = chat.status === "submitted" || chat.status === "streaming";

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
      void chat.sendMessage({ files, modelId, reasoningEffort, text });
    },
    [chat],
  );

  const handleEdit = useCallback(
    (message: ThreadUIMessage) => {
      setEditingMessage(message);
      setChatError(null);
    },
    [],
  );

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
          ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
            part.type === "text",
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
      void chat.editMessage({
        files,
        modelId,
        reasoningEffort,
        targetMessageId: editingMessage.id,
        text,
      });
      setEditingMessage(null);
    },
    [chat, editingMessage],
  );

  const handleRename = useCallback(() => {
    const nextTitle = window.prompt("Rename thread", threadTitle)?.trim();
    if (!nextTitle) {
      return;
    }
    void renameThread.mutate({
      threadId: thread.id,
      title: nextTitle,
    });
  }, [renameThread, thread.id, threadTitle]);

  const handleArchive = useCallback(() => {
    if (!window.confirm("Archive this thread?")) {
      return;
    }

    void archiveThread.mutate({ threadId: thread.id });
  }, [archiveThread, thread.id]);

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
        <>
          <button
            className="text-muted hover:text-foreground flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
            onClick={handleRename}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={PencilEdit02Icon} size={14} strokeWidth={1.7} />
            Rename
          </button>
          <button
            className="text-muted hover:text-foreground flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
            onClick={handleArchive}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Archive02Icon} size={14} strokeWidth={1.7} />
            Archive
          </button>
        </>
      }
      subtitle={workspace.name}
      title={threadTitle}
      flush
    >
      <div className="relative h-full">
        <ScrollShadow
          ref={scrollAreaRef}
          className="flex h-[calc(100vh-44px)] flex-col overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl flex-1 px-6 pt-4">
            <div className="flex flex-col gap-4">
              {chat.messages.map((message, idx) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={isBusy && idx === chat.messages.length - 1}
                  onEdit={handleEdit}
                  onRegenerate={(messageId) => void chat.regenerateMessage(messageId)}
                  onRetry={(messageId) => void chat.retryMessage(messageId)}
                  onSelectBranch={(messageId) =>
                    void setActiveBranch.mutate({
                      messageId,
                      threadId: thread.id,
                    })
                  }
                  onStop={() => chat.stop()}
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
            className="sticky bottom-0 z-50 mx-auto w-full max-w-3xl px-6 pb-3 pt-2"
          >
            <ChatComposer
              activeWorkspace={workspace}
              attachmentSeed={editingAttachmentSeed}
              isEditing={editingMessage != null}
              onCancelEdit={handleCancelEdit}
              onSend={editingMessage ? handleEditSubmit : handleSend}
              onStop={chat.stop}
              promptSeed={editingPromptSeed}
              promptSeedKey={editingMessage?.id}
              status={chat.status}
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
    </PageWrapper>
  );
}
