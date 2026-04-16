"use client";

import { useEffect } from "react";

import { PageWrapper } from "@/components/shell";
import { useShell } from "@/components/shell/shell-context";
import { api } from "@/trpc/react";

import { closeRepoDiffSidebarForThreadChange } from "./repo-diff-sidebar-store";
import { ThreadScreen } from "./thread-screen";
import { buildThreadQueryOptions } from "./thread-query-options";
import { Spinner } from "@heroui/react";

export function ThreadRouteScreen({ threadId }: { threadId: string }) {
  const { navigateHome } = useShell();
  const utils = api.useUtils();
  const cachedThread = utils.threads.get.getData({ threadId });
  const threadQuery = api.threads.get.useQuery(
    { threadId },
    buildThreadQueryOptions(cachedThread),
  );

  useEffect(() => {
    if (threadQuery.error?.data?.code === "NOT_FOUND" && !threadQuery.data) {
      navigateHome({ replace: true });
    }
  }, [navigateHome, threadQuery.error?.data?.code, threadQuery.data]);

  useEffect(() => {
    return () => {
      closeRepoDiffSidebarForThreadChange(threadId);
    };
  }, [threadId]);

  if (
    threadQuery.error &&
    threadQuery.error.data?.code !== "NOT_FOUND" &&
    !threadQuery.data
  ) {
    return (
      <PageWrapper flush>
        <div className="flex h-full items-center justify-center px-4">
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            Something went wrong while loading the thread.
          </p>
        </div>
      </PageWrapper>
    );
  }

  if (!threadQuery.data) {
    return (
      <PageWrapper flush>
        <div className="flex h-full items-center justify-center px-4">
          <Spinner size="sm" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <ThreadScreen
      initialMessages={threadQuery.data.messages}
      queuedFollowUps={threadQuery.data.queuedFollowUps}
      thread={threadQuery.data.thread}
      workspace={threadQuery.data.workspace}
    />
  );
}
