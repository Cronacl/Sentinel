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
import { useThreadChat } from "@/hooks/use-thread-chat";
import type { ReasoningEffort } from "@/lib/ai/models";
import type { ThreadUIMessage } from "@/lib/ai/thread-message-types";
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
      }

      if (
        dataPart.type === "data-thread-invalidation" &&
        dataPart.data.threadId === draftThreadId
      ) {
        void utils.threads.get.invalidate({ threadId: draftThreadId });
        void utils.threads.list.invalidate();
      }
    },
    [draftThreadId, utils.threads.get, utils.threads.list],
  );

  const handleFinish = useCallback(() => {
    void utils.threads.get.invalidate({ threadId: draftThreadId });
    void utils.threads.list.invalidate();
  }, [draftThreadId, utils.threads.get, utils.threads.list]);

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
  const { messages, sendMessage, status, stop } = chat;

  const hasMessages = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const threadDetailsQuery = api.threads.get.useQuery(
    { threadId: draftThreadId },
    { enabled: hasMessages },
  );

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
      setGeneratedTitle(null);
      void sendMessage({ files, modelId, reasoningEffort, text });
      void utils.threads.list.invalidate();
    },
    [sendMessage, utils.threads.list],
  );

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
      setDraftThreadId(crypto.randomUUID());
    };

    window.addEventListener("sentinel:new-thread", handleNewThread);
    return () =>
      window.removeEventListener("sentinel:new-thread", handleNewThread);
  }, [threadId]);

  useEffect(() => {
    const handlePopState = () => {
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  useEffect(() => {
    if (threadId || !hasMessages) {
      return;
    }

    if (hasHandedOffRef.current) {
      return;
    }

    hasHandedOffRef.current = true;
    router.replace(`/thread/${draftThreadId}`);
  }, [
    draftThreadId,
    hasMessages,
    router,
    threadId,
  ]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        workspaceMenuRef.current &&
        event.target instanceof Node &&
        !workspaceMenuRef.current.contains(event.target)
      ) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (hasMessages) {
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
                activeWorkspace={selectedWorkspace}
                onSend={handleSend}
                onStop={stop}
                status={status}
                threadId={draftThreadId}
                threadSelection={
                  threadDetailsQuery.data
                    ? {
                        modelId: threadDetailsQuery.data.thread.chatModelId,
                        reasoningEffort:
                          (threadDetailsQuery.data.thread
                            .chatReasoningEffort as ReasoningEffort | null) ??
                          null,
                      }
                    : null
                }
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

            <h2 className="text-2xl font-medium tracking-tight text-foreground">
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
                    className="absolute left-1/2 top-10 z-[200] w-[320px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background p-1 shadow-overlay"
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

          <div className="sticky bottom-0 z-50 mx-auto w-full max-w-2xl px-6 pb-3 pt-2">
            <ChatComposer
              activeWorkspace={selectedWorkspace}
              onSend={handleSend}
              onStop={stop}
              status={status}
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
