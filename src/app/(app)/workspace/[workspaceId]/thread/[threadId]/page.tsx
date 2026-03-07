"use client";

import { Skeleton } from "@heroui/react";
import { useParams } from "next/navigation";

import { PageWrapper } from "@/components/shell";
import { api } from "@/trpc/react";

function ThreadPageSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}

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

export default function ThreadPage() {
  const params = useParams<{ threadId: string; workspaceId: string }>();
  const thread = api.threads.get.useQuery({ threadId: params.threadId });

  return (
    <PageWrapper
      subtitle={thread.data?.workspace.name ?? "Thread"}
      title={thread.data?.thread.title ?? "Thread"}
    >
      {thread.isLoading ? <ThreadPageSkeleton /> : null}

      {!thread.isLoading && thread.data ? (
        <div className="flex flex-col gap-3">
          {thread.data.messages.length > 0 ? (
            thread.data.messages.map((message) => (
              <article
                className="border-separator bg-surface rounded-2xl border px-4 py-3"
                key={message.id}
              >
                <div className="text-muted text-[11px] uppercase tracking-[0.14em]">
                  {message.role}
                </div>
                <p className="text-foreground mt-2 text-sm leading-6 whitespace-pre-wrap">
                  {getMessagePreview(message.parts) || "Non-text message parts"}
                </p>
              </article>
            ))
          ) : (
            <div className="border-separator bg-surface rounded-2xl border px-4 py-5">
              <p className="text-foreground text-sm font-medium">
                No messages yet
              </p>
              <p className="text-muted mt-1 text-sm">
                The thread route is in place so the sidebar can navigate
                cleanly. The full chat composer and stream handling can build on
                this next.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </PageWrapper>
  );
}
