import { McpServerForm } from "@/components/settings/mcp-server-form";

export default async function EditMcpServerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;

  return <McpServerForm mode="edit" serverId={serverId} />;
}
