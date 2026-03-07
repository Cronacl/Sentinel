import { redirect } from "next/navigation";

export default async function LegacyWorkspaceThreadPage({
  params,
}: {
  params: Promise<{ threadId: string; workspaceId: string }>;
}) {
  const { threadId } = await params;

  redirect(`/thread/${threadId}`);
}
