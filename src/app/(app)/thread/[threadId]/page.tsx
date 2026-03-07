import { redirect } from "next/navigation";

import { NewThreadScreen } from "@/components/chat/new-thread-screen";
import { ThreadScreen } from "@/components/chat/thread-screen";
import { mapThreadMessagesToUIMessages } from "@/lib/ai/ui-messages";
import { db } from "@/server/db";
import { getLocalSession } from "@/server/local-profile";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const session = await getLocalSession();

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      workspace: true,
    },
  });

  if (!thread) {
    return <NewThreadScreen threadId={threadId} />;
  }

  if (
    thread.userId !== session.user.id ||
    thread.workspace.userId !== session.user.id
  ) {
    redirect("/");
  }

  const messages = await mapThreadMessagesToUIMessages(thread.messages);

  return (
    <ThreadScreen
      initialMessages={messages}
      thread={{
        id: thread.id,
        summary: thread.summary,
        title: thread.title,
      }}
      workspace={{
        id: thread.workspace.id,
        name: thread.workspace.name,
        rootPath: thread.workspace.rootPath,
      }}
    />
  );
}
