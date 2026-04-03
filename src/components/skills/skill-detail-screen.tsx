"use client";

import { Button, Chip, ScrollShadow, Skeleton } from "@heroui/react";
import {
  AiIdeaIcon,
  ArrowLeft01Icon,
  BrushIcon,
  BulbIcon,
  CubeIcon,
  Magnet01Icon,
  Mail01Icon,
  McpServerIcon,
  Megaphone01Icon,
  NoteEditIcon,
  NotebookIcon,
  PaintBoardIcon,
  QuillWrite01Icon,
  ShareKnowledgeIcon,
  SparklesIcon,
  TestTube01Icon,
  WebDesign02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";

import { MarkdownContent } from "@/components/chat/message-parts/text";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  CloudflareIcon,
  FigmaIcon,
  GitHubIcon,
  MicrosoftExcelIcon,
  PdfIcon,
  PlaywrightIcon,
  PowerPointIcon,
  RemotionIcon,
  VercelIcon,
  WordIcon,
} from "@/components/skills/skill-icons";
import { api } from "@/trpc/react";
import { SidebarToggle, useShell } from "../shell";

const SOURCE_LABEL = {
  agents: "Agents",
  claude: "Claude",
  codex: "Codex",
  sentinel: "Sentinel",
} as const;

const SCOPE_LABEL = {
  global: "Home",
  workspace: "Workspace",
} as const;

function formatSkillTitle(name: string) {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type BrandIconEntry = {
  type: "brand";
  component: ComponentType<SVGProps<SVGSVGElement>>;
};
type HugeIconEntry = { type: "huge"; icon: IconSvgElement };

const SKILL_ICON_MAP: Record<string, BrandIconEntry | HugeIconEntry> = {
  "vercel-deploy": { type: "brand", component: VercelIcon },
  playwright: { type: "brand", component: PlaywrightIcon },
  "playwright-dev": { type: "brand", component: PlaywrightIcon },
  slides: { type: "brand", component: PowerPointIcon },
  doc: { type: "brand", component: WordIcon },
  pdf: { type: "brand", component: PdfIcon },
  xlsx: { type: "brand", component: MicrosoftExcelIcon },
  "gh-fix-ci": { type: "brand", component: GitHubIcon },
  "gh-address-comments": { type: "brand", component: GitHubIcon },
  "figma-implement-design": { type: "brand", component: FigmaIcon },
  "cloudflare-deploy": { type: "brand", component: CloudflareIcon },
  remotion: { type: "brand", component: RemotionIcon },
  "frontend-design": { type: "huge", icon: PaintBoardIcon },
  "mcp-builder": { type: "huge", icon: McpServerIcon },
  "webapp-testing": { type: "huge", icon: TestTube01Icon },
  "openai-docs": { type: "huge", icon: NotebookIcon },
  "skill-creator": { type: "huge", icon: BrushIcon },
  "skill-installer": { type: "huge", icon: SparklesIcon },
  "github-fix-ci": { type: "brand", component: GitHubIcon },
  copywriting: { type: "huge", icon: QuillWrite01Icon },
  "marketing-ideas": { type: "huge", icon: BulbIcon },
  "lead-magnets": { type: "huge", icon: Magnet01Icon },
  "cold-email": { type: "huge", icon: Mail01Icon },
  "ad-creative": { type: "huge", icon: Megaphone01Icon },
  "social-content": { type: "huge", icon: ShareKnowledgeIcon },
};

function SkillIcon({ name, size = 16 }: { name: string; size?: number }) {
  const normalized = name.trim().toLowerCase();
  const entry = SKILL_ICON_MAP[normalized];

  if (entry?.type === "brand") {
    const BrandComponent = entry.component;
    return <BrandComponent width={size} height={size} />;
  }

  const hugeIcon =
    entry?.type === "huge" ? entry.icon : (CubeIcon as IconSvgElement);
  return (
    <HugeiconsIcon
      color="currentColor"
      icon={hugeIcon}
      size={size}
      strokeWidth={1.5}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="border-separator/20 bg-surface rounded-2xl border p-2.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-3 w-full rounded-md" />
          </div>
        </div>
      </div>

      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-5 w-24 rounded-md" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-5/6 rounded-md" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>

      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-5 w-20 rounded-md" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>

      <div className="border-separator/20 bg-surface rounded-2xl border p-4">
        <Skeleton className="h-5 w-16 rounded-md" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-5 w-20 rounded-full" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkillDetailScreen({
  skillName,
  target = "sentinel",
}: {
  skillName: string;
  target?: "claude" | "codex" | "sentinel";
}) {
  const { leftSidebarOpen } = useShell();
  const [copiedLabel, setCopiedLabel] = useState<"name" | "path" | null>(null);

  const skill = api.skills.get.useQuery(
    { name: skillName, target },
    { refetchInterval: 2_000 },
  );

  useEffect(() => {
    if (!copiedLabel) return;
    const timeout = window.setTimeout(() => setCopiedLabel(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [copiedLabel]);

  const handleCopy = async (value: string, label: "name" | "path") => {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopiedLabel(label);
  };

  const resolvedName = skill.data?.name ?? skillName;
  const loadedSkill = skill.data ?? null;

  return (
    <SettingsPageWrapper
      title={
        <div className="flex items-center gap-2">
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          <Link
            href="/skills"
            className="text-muted hover:text-foreground transition-colors"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={20}
              strokeWidth={1.5}
            />
          </Link>
          {formatSkillTitle(resolvedName)}
        </div>
      }
    >
      {skill.error ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-2xl border px-3 py-2.5 text-xs">
          {skill.error.message}
        </p>
      ) : null}

      {skill.isPending && !skill.data ? (
        <DetailSkeleton />
      ) : !loadedSkill ? (
        <div className="border-separator/20 bg-surface rounded-2xl border p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
              <HugeiconsIcon
                color="currentColor"
                icon={CubeIcon}
                size={16}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <h2 className="text-foreground text-sm font-medium">
                Skill not found
              </h2>
              <p className="text-muted mt-0.5 text-xs">
                The requested skill is no longer available in the current
                workspace.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Skill identity banner */}
          <div className="border-separator/20 bg-surface flex items-center gap-2.5 rounded-2xl border p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-separator bg-background text-foreground">
              <SkillIcon name={resolvedName} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate text-sm font-medium">
                  {formatSkillTitle(loadedSkill.name)}
                </span>
                <Chip
                  size="sm"
                  className="bg-warning-soft text-warning-soft-foreground"
                >
                  {SOURCE_LABEL[loadedSkill.sourceKind]}
                </Chip>
              </div>
              <p className="text-muted mt-0.5 truncate text-xs">
                {loadedSkill.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                onPress={() => void handleCopy(loadedSkill.name, "name")}
                size="sm"
                variant="tertiary"
                className="h-7 px-2 rounded-[10px]"
              >
                {copiedLabel === "name" ? "Copied" : "Copy name"}
              </Button>
              <Button
                onPress={() => void handleCopy(loadedSkill.skillFile, "path")}
                size="sm"
                variant="tertiary"
                className="h-7 px-2 rounded-[10px]"
              >
                {copiedLabel === "path" ? "Copied" : "Copy path"}
              </Button>
            </div>
          </div>

          {/* Overview */}
          <section>
            <h2 className="text-foreground mb-3 px-3 text-sm font-medium">
              Overview
            </h2>
            <div className="border-separator/20 bg-surface rounded-2xl border p-4">
              <ScrollShadow className="max-h-[48vh]" orientation="vertical">
                <div className="pr-2 [&_.sentinel-prose]:max-w-none [&_.sentinel-prose]:text-sm [&_.sentinel-prose_h1]:text-base [&_.sentinel-prose_h1]:font-medium [&_.sentinel-prose_h2]:text-sm [&_.sentinel-prose_h2]:font-medium [&_.sentinel-prose_li]:text-sm [&_.sentinel-prose_p]:text-sm">
                  <MarkdownContent
                    text={loadedSkill.content || "No preview available."}
                  />
                </div>
              </ScrollShadow>
            </div>
          </section>

          {/* Location */}
          <section>
            <h2 className="text-foreground mb-3 px-3 text-sm font-medium">
              Location
            </h2>
            <div className="grid grid-cols-1 gap-1">
              <div className="border-separator/20 bg-surface rounded-2xl border p-2.5 px-3">
                <p className="text-foreground text-xs font-medium">
                  Skill file
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-muted">
                  {loadedSkill.skillFile}
                </p>
              </div>
              <div className="border-separator/20 bg-surface rounded-2xl border p-2.5 px-3">
                <p className="text-foreground text-xs font-medium">Directory</p>
                <p className="mt-0.5 break-all font-mono text-xs text-muted">
                  {loadedSkill.directory}
                </p>
              </div>
            </div>
          </section>

          {/* Files */}
          <section>
            <h2 className="text-foreground mb-3 px-3 text-sm font-medium">
              Files
            </h2>
            <div className="border-separator/20 bg-surface rounded-2xl border p-4">
              {loadedSkill.files.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {loadedSkill.files.slice(0, 12).map((file) => (
                    <Chip
                      key={file}
                      size="sm"
                      className="bg-warning-soft text-warning-soft-foreground"
                    >
                      {file}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-xs">
                  No bundled files were discovered for this skill.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </SettingsPageWrapper>
  );
}
