import { SkillDetailScreen } from "@/components/skills/skill-detail-screen";

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ skillName: string }>;
  searchParams: Promise<{ target?: string }>;
}) {
  const { skillName } = await params;
  const { target } = await searchParams;

  return (
    <SkillDetailScreen
      skillName={decodeURIComponent(skillName)}
      target={target === "codex" ? "codex" : "sentinel"}
    />
  );
}
