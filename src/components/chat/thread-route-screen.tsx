"use client";

import { Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PageWrapper } from "@/components/shell";
import { api } from "@/trpc/react";

import { ThreadScreen } from "./thread-screen";

export function ThreadRouteScreen({ threadId }: { threadId: string }) {
  const router = useRouter();
  const threadQuery = api.threads.get.useQuery({ threadId });

  useEffect(() => {
    if (threadQuery.error?.data?.code === "NOT_FOUND") {
      router.replace("/");
    }
  }, [router, threadQuery.error?.data?.code]);

  if (threadQuery.error && threadQuery.error.data?.code !== "NOT_FOUND") {
    return (
      <PageWrapper flush title="Thread">
        <div className="flex h-[calc(100vh-44px)] items-center justify-center px-4">
          <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2.5 text-xs">
            {threadQuery.error.message}
          </p>
        </div>
      </PageWrapper>
    );
  }

  if (!threadQuery.data) {
    return (
      <PageWrapper flush title="Thread">
        <div className="flex h-[calc(100vh-44px)] items-center justify-center px-4">
          <Spinner color="current" size="sm" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <ThreadScreen
      initialMessages={threadQuery.data.messages}
      thread={threadQuery.data.thread}
      workspace={threadQuery.data.workspace}
    />
  );
}
