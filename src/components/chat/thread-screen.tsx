"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";

import { PageWrapper } from "@/components/shell";
import { useThreadChat } from "@/hooks/use-thread-chat";
import type { ReasoningEffort } from "@/lib/ai/models";
import { api } from "@/trpc/react";

import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { ScrollShadow } from "@heroui/react";

type ThreadScreenProps = {
  initialMessages: UIMessage[];
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
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isUserNearBottomRef = useRef(true);

  const chat = useThreadChat({
    threadId: thread.id,
    initialMessages,
    workspaceId: workspace.id,
    onFinish: () => {
      void utils.threads.list.invalidate();
    },
    onError: (error) => {
      setChatError(error.message);
    },
  });

  const isBusy = chat.status === "submitted" || chat.status === "streaming";

  const handleSend = useCallback(
    ({
      modelId,
      reasoningEffort,
      text,
    }: {
      modelId: string;
      reasoningEffort?: ReasoningEffort | null;
      text: string;
    }) => {
      setChatError(null);
      void chat.sendMessage({ modelId, reasoningEffort, text });
    },
    [chat],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollArea;
      isUserNearBottomRef.current =
        scrollHeight - scrollTop - clientHeight < 100;
    };

    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollArea.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isUserNearBottomRef.current) {
      scrollToBottom();
    }
  }, [chat.messages, scrollToBottom]);

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
    <PageWrapper subtitle={workspace.name} title={thread.title} flush>
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
              />
            ))}

            {chatError && (
              <div className="rounded-lg border border-danger-soft-hover bg-danger-soft px-3 py-2.5">
                <p className="text-xs text-danger-soft-foreground">
                  {chatError}
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 z-50 mx-auto w-full max-w-3xl px-6 pb-3 pt-2">
          <ChatComposer
            activeWorkspace={workspace}
            onSend={handleSend}
            onStop={chat.stop}
            status={chat.status}
          />
        </div>
      </ScrollShadow>
    </PageWrapper>
  );
}
