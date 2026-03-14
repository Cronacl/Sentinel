import { SkillDetailScreen } from "@/components/skills/skill-detail-screen";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ skillName: string }>;
}) {
  const { skillName } = await params;

  return <SkillDetailScreen skillName={decodeURIComponent(skillName)} />;
}
