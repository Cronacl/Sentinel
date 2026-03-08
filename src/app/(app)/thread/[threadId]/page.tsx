import { ThreadRouteScreen } from "@/components/chat/thread-route-screen";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  return <ThreadRouteScreen threadId={threadId} />;
}
