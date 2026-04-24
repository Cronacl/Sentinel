"use client";

import {
  BrushIcon,
  BulbIcon,
  CubeIcon,
  Magnet01Icon,
  Mail01Icon,
  McpServerIcon,
  Megaphone01Icon,
  NotebookIcon,
  PaintBoardIcon,
  QuillWrite01Icon,
  ShareKnowledgeIcon,
  SparklesIcon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Icon } from "@iconify/react";
import type { ComponentType, SVGProps } from "react";

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
  "github-fix-ci": { type: "brand", component: GitHubIcon },
  "figma-implement-design": { type: "brand", component: FigmaIcon },
  "cloudflare-deploy": { type: "brand", component: CloudflareIcon },
  remotion: { type: "brand", component: RemotionIcon },
  "frontend-design": { type: "huge", icon: PaintBoardIcon },
  "mcp-builder": { type: "huge", icon: McpServerIcon },
  "webapp-testing": { type: "huge", icon: TestTube01Icon },
  "openai-docs": { type: "huge", icon: NotebookIcon },
  "skill-creator": { type: "huge", icon: BrushIcon },
  "skill-installer": { type: "huge", icon: SparklesIcon },
  copywriting: { type: "huge", icon: QuillWrite01Icon },
  "marketing-ideas": { type: "huge", icon: BulbIcon },
  "lead-magnets": { type: "huge", icon: Magnet01Icon },
  "cold-email": { type: "huge", icon: Mail01Icon },
  "ad-creative": { type: "huge", icon: Megaphone01Icon },
  "social-content": { type: "huge", icon: ShareKnowledgeIcon },
};

function normalizeSkillName(name: string) {
  return name.trim().toLowerCase();
}

export function hasCuratedSkillIcon(name: string) {
  return SKILL_ICON_MAP[normalizeSkillName(name)] != null;
}

export function isSafeSkillIconName(value: string | null | undefined) {
  return Boolean(
    value && /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_.-]*$/i.test(value.trim()),
  );
}

export function SkillIcon({
  className,
  metadataIcon,
  name,
  size = 16,
}: {
  className?: string;
  metadataIcon?: string | null;
  name: string;
  size?: number;
}) {
  const entry = SKILL_ICON_MAP[normalizeSkillName(name)];

  if (entry?.type === "brand") {
    const BrandComponent = entry.component;
    return <BrandComponent className={className} width={size} height={size} />;
  }

  if (entry?.type === "huge") {
    return (
      <HugeiconsIcon
        className={className}
        color="currentColor"
        icon={entry.icon}
        size={size}
        strokeWidth={1.5}
      />
    );
  }

  if (isSafeSkillIconName(metadataIcon)) {
    return <Icon className={className} icon={metadataIcon!.trim()} />;
  }

  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={CubeIcon}
      size={size}
      strokeWidth={1.5}
    />
  );
}
