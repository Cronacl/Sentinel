import { AutomationDetailScreen } from "@/components/automations/automation-detail-screen";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;

  return (
    <AutomationDetailScreen automationId={decodeURIComponent(automationId)} />
  );
}
