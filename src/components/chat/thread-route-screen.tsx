"use client";

import { Spinner } from "@heroui/react";
import { useEffect } from "react";

import { PageWrapper } from "@/components/shell";
import { useShell } from "@/components/shell/shell-context";
import { peekThreadSessionSnapshot } from "@/hooks/use-thread-chat";
import { api } from "@/trpc/react";

import { closeRepoDiffSidebarForThreadChange } from "./repo-diff-sidebar-store";
import { ThreadScreen } from "./thread-screen";
import { peekThreadRouteHandoff } from "./thread-route-handoff";
import {
  resolveThreadRouteComposerUiState,
  resolveThreadRouteData,
  shouldRefreshThreadRouteData,
} from "./thread-route-screen.helpers";
import { buildThreadQueryOptions } from "./thread-query-options";

export function ThreadRouteScreen({ threadId }: { threadId: string }) {
  const { navigateHome } = useShell();
  const utils = api.useUtils();
  const cachedThread = utils.threads.get.getData({ threadId });
  const liveSnapshot = peekThreadSessionSnapshot(threadId);
  const handoffState = peekThreadRouteHandoff(threadId);
  const threadQuery = api.threads.get.useQuery(
    { threadId },
    buildThreadQueryOptions(cachedThread, {
      refreshOnMount: shouldRefreshThreadRouteData(cachedThread, liveSnapshot),
    }),
  );
  const baseThread = threadQuery.data ?? cachedThread;
  const threadData = resolveThreadRouteData(baseThread, liveSnapshot);
  const initialComposerUiState = resolveThreadRouteComposerUiState(
    threadData,
    handoffState,
  );

  useEffect(() => {
    if (
      threadQuery.error?.data?.code === "NOT_FOUND" &&
      !threadQuery.data &&
      !threadData
    ) {
      navigateHome({ replace: true });
    }
  }, [
    navigateHome,
    threadData,
    threadQuery.error?.data?.code,
    threadQuery.data,
  ]);

  useEffect(() => {
    return () => {
      closeRepoDiffSidebarForThreadChange(threadId);
    };
  }, [threadId]);

  if (
    threadQuery.error &&
    threadQuery.error.data?.code !== "NOT_FOUND" &&
    !threadQuery.data &&
    !threadData
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

  if (!threadData) {
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
      initialComposerUiState={initialComposerUiState}
      initialMessages={threadData.messages}
      queuedFollowUps={threadData.queuedFollowUps}
      thread={threadData.thread}
      workspace={threadData.workspace}
    />
  );
}
