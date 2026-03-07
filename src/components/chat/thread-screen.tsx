"use client";

import { useEffect } from "react";

import { PageWrapper } from "@/components/shell";
import { api } from "@/trpc/react";

import { ChatComposer } from "./chat-composer";

type ThreadScreenProps = {
  initialMessages: Array<{
    id: string;
    parts: unknown;
    role: "assistant" | "system" | "user";
  }>;
  thread: {
    id: string;
    summary: string | null;
    title: string;
  };
  workspace: {
    id: string;
    name: string;
    rootPath: string | null;
  };
};

function getMessagePreview(parts: unknown) {
  if (!Array.isArray(parts)) {
    return "";
  }

  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return part.text;
    }
  }

  return "";
}

export function ThreadScreen({
  initialMessages,
  thread,
  workspace,
}: ThreadScreenProps) {
  const utils = api.useUtils();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const selectWorkspace = api.workspaces.select.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workspaces.getCurrent.invalidate(),
        utils.workspaces.list.invalidate(),
      ]);
    },
  });

  useEffect(() => {
    if (
      currentWorkspace.isLoading ||
      currentWorkspace.data?.id === workspace.id ||
      selectWorkspace.isPending
    ) {
      return;
    }

    void selectWorkspace.mutateAsync({ workspaceId: workspace.id });
  }, [
    currentWorkspace.data,
    currentWorkspace.isLoading,
    selectWorkspace,
    selectWorkspace.isPending,
    workspace.id,
  ]);

  return (
    <PageWrapper
      maxWidth="2xl"
      subtitle={workspace.name}
      title={thread.title}
      flush
    >
      <div className="flex h-[calc(100vh-44px)] flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-5 lg:py-5">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            {initialMessages.length > 0 ? (
              initialMessages.map((message) => (
                <article
                  className="rounded-2xl border border-border bg-surface px-4 py-3"
                  key={message.id}
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {message.role}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground whitespace-pre-wrap">
                    {getMessagePreview(message.parts) ||
                      "Non-text message parts"}
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-border bg-surface p-6">
                <p className="text-lg font-medium text-foreground">
                  Nothing here yet.
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Shape the first message below, attach anything Sentinel should
                  consider, and use the model picker to frame the thread.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 lg:px-5">
          <div className="mx-auto w-full max-w-5xl">
            <ChatComposer activeWorkspace={workspace} threadId={thread.id} />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
