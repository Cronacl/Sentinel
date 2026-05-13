"use client";

import {
  Button,
  Input,
  Modal,
  Skeleton,
  Spinner,
  Tabs,
  useOverlayState,
} from "@heroui/react";
import {
  AiIdeaIcon,
  BrushIcon,
  BulbIcon,
  CubeIcon,
  GithubIcon,
  Magnet01Icon,
  Mail01Icon,
  McpServerIcon,
  Megaphone01Icon,
  NoteEditIcon,
  NotebookIcon,
  PaintBoardIcon,
  PlusSignIcon,
  QuillWrite01Icon,
  ShareKnowledgeIcon,
  SparklesIcon,
  TestTube01Icon,
  WebDesign02Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useMemo, useState } from "react";

import { type SelectOption } from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { CustomSkillInstallDrawer } from "@/components/skills/custom-skill-install-sidebar";
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
import { api, type RouterOutputs } from "@/trpc/react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type SkillListItem = RouterOutputs["skills"]["list"]["skills"][number];
type RegistryItem = RouterOutputs["skills"]["registry"][number];
type SkillInstallTarget =
  | "claude"
  | "codex"
  | "copilot"
  | "cursor"
  | "opencode"
  | "sentinel";
type InstalledSkillAction = Pick<SkillListItem, "name" | "scope" | "target">;

type UnifiedSkill = {
  key: string;
  name: string;
  displayName: string;
  description: string;
  registryEntry: RegistryItem | null;
  installedTargets: {
    sentinel: boolean;
    claude: boolean;
    codex: boolean;
    copilot: boolean;
    cursor: boolean;
    opencode: boolean;
  };
  installedSkills: SkillListItem[];
  detailHref: string | null;
};

type ViewFilter = "all" | "installed" | "available";
type SkillCategoryKey =
  | "external"
  | "development"
  | "deployment"
  | "docs"
  | "media"
  | "marketing"
  | "installed"
  | "other";

type SkillCategorySection = {
  key: SkillCategoryKey;
  items: UnifiedSkill[];
  title: string;
};

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TARGET_OPTIONS: SelectOption[] = [
  {
    description: "Install into Sentinel's local skill directories.",
    label: "Sentinel",
    value: "sentinel",
  },
  {
    description: "Install into Claude's .claude/skills directories.",
    label: "Claude",
    value: "claude",
  },
  {
    description: "Install into the Codex home skills directory.",
    label: "Codex",
    value: "codex",
  },
  {
    description:
      "Install into Copilot's .github/skills workspace folder or ~/.copilot/skills home folder.",
    label: "Copilot",
    value: "copilot",
  },
  {
    description: "Install into Cursor's .cursor/skills directory.",
    label: "Cursor",
    value: "cursor",
  },
  {
    description:
      "Install into OpenCode's .opencode/skills workspace folder or ~/.config/opencode/skills home folder.",
    label: "OpenCode",
    value: "opencode",
  },
] as const;

const SKILL_CATEGORY_ORDER: SkillCategoryKey[] = [
  "development",
  "deployment",
  "docs",
  "media",
  "marketing",
  "installed",
  "other",
  "external",
];

const SKILL_CATEGORY_TITLES: Record<SkillCategoryKey, string> = {
  external: "External",
  development: "Development",
  deployment: "Deployment",
  docs: "Docs & Data",
  media: "Media",
  marketing: "Marketing",
  installed: "Installed",
  other: "Other",
};

const SKILL_CATEGORY_MAP: Record<string, SkillCategoryKey> = {
  "frontend-design": "development",
  "mcp-builder": "development",
  "webapp-testing": "development",
  "figma-implement-design": "development",
  "gh-fix-ci": "development",
  "gh-address-comments": "development",
  playwright: "development",
  "cloudflare-deploy": "deployment",
  "vercel-deploy": "deployment",
  "doc-coauthoring": "docs",
  pdf: "docs",
  doc: "docs",
  slides: "docs",
  xlsx: "docs",
  remotion: "media",
  copywriting: "marketing",
  "marketing-ideas": "marketing",
  "lead-magnets": "marketing",
  "cold-email": "marketing",
  "ad-creative": "marketing",
  "social-content": "marketing",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatSkillTitle(name: string) {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInstalledDetailHref(skill: SkillListItem) {
  if (skill.target === "codex") {
    return `/skills/${encodeURIComponent(skill.name)}?target=codex`;
  }
  if (skill.target === "claude") {
    return `/skills/${encodeURIComponent(skill.name)}?target=claude`;
  }
  if (skill.target === "copilot") {
    return `/skills/${encodeURIComponent(skill.name)}?target=copilot`;
  }
  if (skill.target === "cursor") {
    return `/skills/${encodeURIComponent(skill.name)}?target=cursor`;
  }
  if (skill.target === "opencode") {
    return `/skills/${encodeURIComponent(skill.name)}?target=opencode`;
  }
  return `/skills/${encodeURIComponent(skill.name)}`;
}

function getInstallStateKey(name: string, target: SkillInstallTarget) {
  return `${name}:${target}`;
}

function markRegistrySkillInstalled(
  current: RegistryItem[] | undefined,
  name: string,
  target: SkillInstallTarget,
) {
  if (!current) return current;
  const normalizedName = name.trim().toLowerCase();
  return current.map((entry) =>
    entry.name.trim().toLowerCase() === normalizedName
      ? {
          ...entry,
          installedTargets: { ...entry.installedTargets, [target]: true },
        }
      : entry,
  );
}

function hasAnyInstall(targets: {
  sentinel: boolean;
  claude: boolean;
  codex: boolean;
  copilot: boolean;
  cursor: boolean;
  opencode: boolean;
}) {
  return (
    targets.sentinel ||
    targets.claude ||
    targets.codex ||
    targets.copilot ||
    targets.cursor ||
    targets.opencode
  );
}

function isFullyInstalled(
  targets: {
    sentinel: boolean;
    claude: boolean;
    codex: boolean;
    copilot: boolean;
    cursor: boolean;
    opencode: boolean;
  },
  options?: {
    codexAvailable?: boolean;
    copilotAvailable?: boolean;
    cursorAvailable?: boolean;
    openCodeAvailable?: boolean;
  },
) {
  const codexRequired = options?.codexAvailable ?? true;
  const copilotRequired = options?.copilotAvailable ?? true;
  const cursorRequired = options?.cursorAvailable ?? true;
  const openCodeRequired = options?.openCodeAvailable ?? true;

  return (
    targets.sentinel &&
    targets.claude &&
    (codexRequired ? targets.codex : true) &&
    (copilotRequired ? targets.copilot : true) &&
    (cursorRequired ? targets.cursor : true) &&
    (openCodeRequired ? targets.opencode : true)
  );
}

/* -------------------------------------------------------------------------- */
/*  Build unified list                                                        */
/* -------------------------------------------------------------------------- */

function buildUnifiedList(
  registryEntries: RegistryItem[],
  installedSkills: SkillListItem[],
): UnifiedSkill[] {
  const map = new Map<string, UnifiedSkill>();

  // 1. Seed from registry
  for (const entry of registryEntries) {
    const norm = entry.name.trim().toLowerCase();
    map.set(norm, {
      key: `registry:${norm}`,
      name: norm,
      displayName: entry.displayName,
      description: entry.description,
      registryEntry: entry,
      installedTargets: { ...entry.installedTargets },
      installedSkills: [],
      detailHref: null,
    });
  }

  // 2. Layer installed skills on top
  for (const skill of installedSkills) {
    const norm = skill.name.trim().toLowerCase();
    const existing = map.get(norm);

    if (existing) {
      const hadManagedInstall = existing.installedSkills.some(
        (installed) => installed.installOrigin === "sentinel",
      );
      existing.installedTargets[skill.target as SkillInstallTarget] = true;
      existing.installedSkills.push(skill);
      if (
        !existing.registryEntry &&
        !hadManagedInstall &&
        skill.installOrigin === "sentinel"
      ) {
        existing.description = skill.description ?? existing.description;
        existing.detailHref = getInstalledDetailHref(skill);
      }
      if (!existing.detailHref) {
        existing.detailHref = getInstalledDetailHref(skill);
      }
    } else {
      map.set(norm, {
        key: `custom:${skill.target}:${norm}`,
        name: norm,
        displayName: formatSkillTitle(skill.name),
        description: skill.description ?? "",
        registryEntry: null,
        installedTargets: {
          sentinel: skill.target === "sentinel",
          claude: skill.target === "claude",
          codex: skill.target === "codex",
          copilot: skill.target === "copilot",
          cursor: skill.target === "cursor",
          opencode: skill.target === "opencode",
        },
        installedSkills: [skill],
        detailHref: getInstalledDetailHref(skill),
      });
    }
  }

  // 3. Sort: installed first, then alphabetical
  return Array.from(map.values()).sort((a, b) => {
    const aInstalled = hasAnyInstall(a.installedTargets);
    const bInstalled = hasAnyInstall(b.installedTargets);
    if (aInstalled !== bInstalled) return aInstalled ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

function matchesUnified(item: UnifiedSkill, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack =
    `${item.displayName} ${item.description} ${item.name}`.toLowerCase();
  return haystack.includes(q);
}

function hasExternalInstall(item: UnifiedSkill) {
  return item.installedSkills.some((skill) => skill.isExternal);
}

function hasManagedInstall(item: UnifiedSkill) {
  return item.installedSkills.some(
    (skill) => skill.installOrigin === "sentinel",
  );
}

function shouldTreatAsExternal(item: UnifiedSkill) {
  return (
    !item.registryEntry && !hasManagedInstall(item) && hasExternalInstall(item)
  );
}

function getSkillCategory(item: UnifiedSkill): SkillCategoryKey {
  if (shouldTreatAsExternal(item)) {
    return "external";
  }

  const normalized = item.name.trim().toLowerCase();
  const category = SKILL_CATEGORY_MAP[normalized];

  if (category) {
    return category;
  }

  if (!item.registryEntry && hasAnyInstall(item.installedTargets)) {
    return "installed";
  }

  return "other";
}

function buildSkillSections(items: UnifiedSkill[]): SkillCategorySection[] {
  const groups = new Map<SkillCategoryKey, UnifiedSkill[]>();

  for (const item of items) {
    const category = getSkillCategory(item);
    const existing = groups.get(category);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(category, [item]);
    }
  }

  return SKILL_CATEGORY_ORDER.flatMap((key) => {
    const categoryItems = groups.get(key);
    if (!categoryItems?.length) {
      return [];
    }

    return [
      {
        key,
        items: categoryItems,
        title: SKILL_CATEGORY_TITLES[key],
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

type BrandIconEntry = {
  type: "brand";
  component: ComponentType<SVGProps<SVGSVGElement>>;
};
type HugeIconEntry = { type: "huge"; icon: IconSvgElement };

type SkillIconMeta = (BrandIconEntry | HugeIconEntry) & {
  accent: string;
};

const SKILL_ICON_MAP: Record<string, SkillIconMeta> = {
  "vercel-deploy": {
    type: "brand",
    component: VercelIcon,
    accent: "bg-background dark:bg-background",
  },
  playwright: {
    type: "brand",
    component: PlaywrightIcon,
    accent: "bg-green-50 dark:bg-green-950/50",
  },
  "playwright-dev": {
    type: "brand",
    component: PlaywrightIcon,
    accent: "bg-green-50 dark:bg-green-950/50",
  },
  slides: {
    type: "brand",
    component: PowerPointIcon,
    accent: "bg-orange-50 dark:bg-orange-950/40",
  },
  doc: {
    type: "brand",
    component: WordIcon,
    accent: "bg-blue-50 dark:bg-blue-950/40",
  },
  pdf: {
    type: "brand",
    component: PdfIcon,
    accent: "bg-red-50 dark:bg-red-950/40",
  },
  xlsx: {
    type: "brand",
    component: MicrosoftExcelIcon,
    accent: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  "gh-fix-ci": {
    type: "brand",
    component: GitHubIcon,
    accent: "bg-background dark:bg-background",
  },
  "gh-address-comments": {
    type: "brand",
    component: GitHubIcon,
    accent: "bg-background dark:bg-background",
  },
  "figma-implement-design": {
    type: "brand",
    component: FigmaIcon,
    accent: "bg-purple-50 dark:bg-purple-950/40",
  },
  "cloudflare-deploy": {
    type: "brand",
    component: CloudflareIcon,
    accent: "bg-amber-50 dark:bg-amber-950/40",
  },
  remotion: {
    type: "brand",
    component: RemotionIcon,
    accent: "bg-sky-50 dark:bg-sky-950/40",
  },
  "frontend-design": {
    type: "huge",
    icon: PaintBoardIcon,
    accent: "bg-background dark:bg-background",
  },
  "mcp-builder": {
    type: "huge",
    icon: McpServerIcon,
    accent: "bg-background dark:bg-background",
  },
  "webapp-testing": {
    type: "huge",
    icon: TestTube01Icon,
    accent: "bg-background dark:bg-background",
  },
  "openai-docs": {
    type: "huge",
    icon: NotebookIcon,
    accent: "bg-background dark:bg-background",
  },
  "skill-creator": {
    type: "huge",
    icon: BrushIcon,
    accent: "bg-b ackground/50",
  },
  "skill-installer": {
    type: "huge",
    icon: SparklesIcon,
    accent: "bg-background dark:bg-background",
  },
  "github-fix-ci": {
    type: "brand",
    component: GitHubIcon,
    accent: "bg-background dark:bg-background",
  },
  copywriting: {
    type: "huge",
    icon: QuillWrite01Icon,
    accent: "bg-background dark:bg-background",
  },
  "marketing-ideas": {
    type: "huge",
    icon: BulbIcon,
    accent: "bg-background dark:bg-background",
  },
  "lead-magnets": {
    type: "huge",
    icon: Magnet01Icon,
    accent: "bg-background dark:bg-background",
  },
  "cold-email": {
    type: "huge",
    icon: Mail01Icon,
    accent: "bg-background dark:bg-background",
  },
  "ad-creative": {
    type: "huge",
    icon: Megaphone01Icon,
    accent: "bg-background dark:bg-background",
  },
  "social-content": {
    type: "huge",
    icon: ShareKnowledgeIcon,
    accent: "bg-background dark:bg-background",
  },
  "doc-coauthoring": {
    type: "huge",
    icon: NoteEditIcon,
    accent: "bg-background dark:bg-background",
  },
};

const EXTERNAL_ACCENT = "bg-background dark:bg-background";
const DEFAULT_ACCENT = "bg-background dark:bg-background";

function getSkillAccent(name: string, isExternal: boolean) {
  if (isExternal) return EXTERNAL_ACCENT;
  return SKILL_ICON_MAP[name.trim().toLowerCase()]?.accent ?? DEFAULT_ACCENT;
}

function SkillIcon({
  name,
  size = 20,
  isExternal = false,
}: {
  name: string;
  size?: number;
  isExternal?: boolean;
}) {
  if (isExternal) {
    return (
      <HugeiconsIcon
        color="currentColor"
        icon={ZapIcon}
        size={size}
        strokeWidth={1.5}
      />
    );
  }

  const normalized = name.trim().toLowerCase();
  const entry = SKILL_ICON_MAP[normalized];

  if (entry?.type === "brand") {
    const BrandComponent = entry.component;
    return <BrandComponent height={size} width={size} />;
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

/* -------------------------------------------------------------------------- */
/*  Filled checkmark icon                                                     */
/* -------------------------------------------------------------------------- */

function CheckCircleFilled({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="currentColor"
        d="m10.6 13.8l-2.15-2.15q-.275-.275-.7-.275t-.7.275t-.275.7t.275.7L9.9 15.9q.3.3.7.3t.7-.3l5.65-5.65q.275-.275.275-.7t-.275-.7t-.7-.275t-.7.275zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function SkillsSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5"
          key={index}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-[14px]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-3 w-44 rounded-md" />
          </div>
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filter tabs (HeroUI Tabs)                                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Unified skill cell                                                        */
/* -------------------------------------------------------------------------- */

function SkillCellContent({
  item,
  isExternal,
}: {
  item: UnifiedSkill;
  isExternal: boolean;
}) {
  const accent = getSkillAccent(item.name, isExternal);

  return (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${accent}`}
      >
        <SkillIcon isExternal={isExternal} name={item.name} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-foreground text-[13px] font-semibold leading-tight line-clamp-1">
          {item.displayName}
        </span>
        <p className="text-muted mt-0.5 truncate text-xs leading-snug">
          {item.description}
        </p>
      </div>
    </>
  );
}

function SkillCell({
  item,
  codexAvailable,
  copilotAvailable,
  cursorAvailable,
  openCodeAvailable,
  isInstalling,
  onOpenInstall,
}: {
  item: UnifiedSkill;
  codexAvailable: boolean;
  copilotAvailable: boolean;
  cursorAvailable: boolean;
  openCodeAvailable: boolean;
  isInstalling: boolean;
  onOpenInstall: (item: UnifiedSkill) => void;
}) {
  const hasInstalledTarget = hasAnyInstall(item.installedTargets);
  const fullyInstalled =
    isFullyInstalled(item.installedTargets, {
      codexAvailable,
      copilotAvailable,
      cursorAvailable,
      openCodeAvailable,
    }) ||
    (!item.registryEntry && hasInstalledTarget);
  const canOpenInstall = Boolean(item.registryEntry);
  const isExternal = shouldTreatAsExternal(item);

  return (
    <div className="group flex items-center gap-3 rounded-2xl bg-surface/70 dark:bg-surface/50 px-3 py-2.5 transition-colors hover:bg-surface-hover/20">
      {item.detailHref ? (
        <Link
          href={item.detailHref}
          prefetch
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <SkillCellContent item={item} isExternal={isExternal} />
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SkillCellContent item={item} isExternal={isExternal} />
        </div>
      )}

      <div className="shrink-0">
        {canOpenInstall ? (
          <Button
            aria-label={
              fullyInstalled
                ? `Manage ${item.displayName} installs`
                : hasInstalledTarget
                  ? `Continue installing ${item.displayName}`
                  : `Install ${item.displayName}`
            }
            onPress={() => onOpenInstall(item)}
            size="sm"
            variant="ghost"
            isIconOnly
            className="h-7 w-7 min-w-0"
            isDisabled={isInstalling}
            isPending={isInstalling}
          >
            {({ isPending }) =>
              isPending ? (
                <Spinner color="current" size="sm" />
              ) : fullyInstalled ? (
                <CheckCircleFilled size={18} className="text-success" />
              ) : (
                <HugeiconsIcon
                  color="currentColor"
                  icon={PlusSignIcon}
                  size={16}
                  strokeWidth={2}
                  className="text-muted transition-colors group-hover:text-foreground"
                />
              )
            }
          </Button>
        ) : fullyInstalled ? (
          <div className="flex h-7 w-7 items-center justify-center">
            <CheckCircleFilled size={18} className="text-success" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Install modal                                                             */
/* -------------------------------------------------------------------------- */

function SkillInstallModal({
  skill,
  codexAvailable,
  copilotAvailable,
  cursorAvailable,
  openCodeAvailable,
  installingSkills,
  installErrors,
  onInstall,
  isOpen,
  onOpenChange,
}: {
  skill: UnifiedSkill | null;
  codexAvailable: boolean;
  copilotAvailable: boolean;
  cursorAvailable: boolean;
  openCodeAvailable: boolean;
  installingSkills: Set<string>;
  installErrors: Record<string, string>;
  onInstall: (entry: RegistryItem, target: SkillInstallTarget) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const state = useOverlayState({ isOpen, onOpenChange });
  const entry = skill?.registryEntry ?? null;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className=" sm:max-w-[440px]">
            {skill && entry ? (
              <>
                <Modal.Header className="items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${getSkillAccent(skill.name, false)}`}
                    >
                      <SkillIcon name={skill.name} size={20} />
                    </div>
                    <div className="min-w-0">
                      <Modal.Heading className="text-base">
                        Install {skill.displayName}
                      </Modal.Heading>
                      <p className="text-muted mt-0.5 text-[13px] leading-snug line-clamp-2">
                        {skill.description}
                      </p>
                    </div>
                  </div>
                  <Modal.CloseTrigger />
                </Modal.Header>

                <Modal.Body className="space-y-1 p-2">
                  {TARGET_OPTIONS.map((option) => {
                    const target = option.value as SkillInstallTarget;
                    const isInstalled = skill.installedTargets[target];
                    const installKey = getInstallStateKey(skill.name, target);
                    const isTargetInstalling = installingSkills.has(installKey);
                    const targetError = installErrors[installKey] ?? null;
                    const isUnavailable =
                      (target === "codex" && !codexAvailable) ||
                      (target === "copilot" && !copilotAvailable) ||
                      (target === "cursor" && !cursorAvailable) ||
                      (target === "opencode" && !openCodeAvailable);

                    return (
                      <div key={target}>
                        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <span className="text-foreground text-sm font-medium">
                              {option.label}
                            </span>
                            <p className="text-muted mt-0.5 text-xs leading-snug">
                              {isUnavailable
                                ? `${option.label} is currently unavailable.`
                                : option.description}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isInstalled ? (
                              <div className="flex items-center gap-1.5 text-success">
                                <CheckCircleFilled size={16} />
                                <span className="text-xs font-medium">
                                  Installed
                                </span>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 min-w-[72px] px-2.5"
                                isDisabled={isUnavailable || isTargetInstalling}
                                isPending={isTargetInstalling}
                                onPress={() => onInstall(entry, target)}
                              >
                                {({ isPending }) =>
                                  isPending ? (
                                    <Spinner color="current" size="sm" />
                                  ) : (
                                    "Install"
                                  )
                                }
                              </Button>
                            )}
                          </div>
                        </div>

                        {targetError ? (
                          <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mx-1 mt-0.5 rounded-lg border px-2.5 py-1.5 text-xs">
                            {targetError}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </Modal.Body>

                <Modal.Footer>
                  <Button
                    onPress={() => onOpenChange(false)}
                    variant="secondary"
                    className="w-full"
                  >
                    Done
                  </Button>
                </Modal.Footer>
              </>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                 */
/* -------------------------------------------------------------------------- */

export default function SkillsPage() {
  const [installDrawerOpen, setInstallDrawerOpen] = useState(false);
  const [installModalSkill, setInstallModalSkill] =
    useState<UnifiedSkill | null>(null);
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [installErrors, setInstallErrors] = useState<Record<string, string>>(
    {},
  );
  const [installingSkills, setInstallingSkills] = useState<Set<string>>(
    new Set(),
  );

  const utils = api.useUtils();

  const skills = api.skills.list.useQuery(undefined, {
    refetchInterval: 2_000,
  });
  const registry = api.skills.registry.useQuery();
  const engines = api.engines.list.useQuery();

  const installMutation = api.skills.install.useMutation();

  const allSkills = skills.data?.skills ?? [];
  const registryEntries = registry.data ?? [];
  const codexAvailable = Boolean(
    engines.data?.find((engine) => engine.engine === "codex")?.isAvailable,
  );
  const copilotAvailable = Boolean(
    engines.data?.find((engine) => engine.engine === "copilot")?.isAvailable,
  );
  const cursorAvailable = Boolean(
    engines.data?.find((engine) => engine.engine === "cursor")?.isAvailable,
  );
  const openCodeAvailable = Boolean(
    engines.data?.find((engine) => engine.engine === "opencode")?.isAvailable,
  );

  const isLoading =
    (skills.isPending && !skills.data) ||
    (registry.isPending && !registry.data);

  // Build the unified list
  const unified = useMemo(
    () => buildUnifiedList(registryEntries, allSkills),
    [registryEntries, allSkills],
  );

  // Keep modal skill data fresh as installs complete
  const activeModalSkill = useMemo(() => {
    if (!installModalSkill) return null;
    return (
      unified.find((s) => s.name === installModalSkill.name) ??
      installModalSkill
    );
  }, [unified, installModalSkill]);

  // Filter + search
  const viewCounts = useMemo(() => {
    const counts = { all: 0, installed: 0, available: 0 };
    for (const item of unified) {
      if (!matchesUnified(item, query)) continue;
      counts.all++;
      if (hasAnyInstall(item.installedTargets)) counts.installed++;
      else counts.available++;
    }
    return counts;
  }, [unified, query]);

  const filtered = useMemo(
    () =>
      unified.filter((item) => {
        if (!matchesUnified(item, query)) return false;
        if (viewFilter === "installed")
          return hasAnyInstall(item.installedTargets);
        if (viewFilter === "available")
          return !hasAnyInstall(item.installedTargets);
        return true;
      }),
    [unified, query, viewFilter],
  );

  const sections = useMemo(() => buildSkillSections(filtered), [filtered]);

  const handleInstall = useCallback(
    async (entry: RegistryItem, target: SkillInstallTarget) => {
      const installKey = getInstallStateKey(entry.name, target);

      setInstallingSkills((prev) => new Set(prev).add(installKey));
      setInstallErrors((prev) => {
        const next = { ...prev };
        delete next[installKey];
        return next;
      });

      try {
        const result = await installMutation.mutateAsync({
          name: entry.name,
          scope: "global",
          target,
        });
        utils.skills.registry.setData(undefined, (current) =>
          markRegistrySkillInstalled(current, entry.name, target),
        );
        await Promise.all([
          utils.skills.list.invalidate(),
          utils.skills.registry.invalidate(),
        ]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Installation failed.";
        setInstallErrors((prev) => ({ ...prev, [installKey]: message }));
      } finally {
        setInstallingSkills((prev) => {
          const next = new Set(prev);
          next.delete(installKey);
          return next;
        });
      }
    },
    [installMutation, utils],
  );

  const newSkillHref = allSkills.some(
    (skill) => skill.name.trim().toLowerCase() === "skill-creator",
  )
    ? "/skills/skill-creator"
    : "https://agentskills.io/specification";

  return (
    <SettingsPageWrapper
      actions={
        <Button
          onPress={() => setInstallDrawerOpen(true)}
          size="sm"
          variant="primary"
          className="h-7 px-2"
        >
          Add custom
        </Button>
      }
      title="Skills"
    >
      {skills.error ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mb-4 rounded-2xl border px-3 py-2.5 text-xs">
          {skills.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {/* Search + filter row */}
        <div className="flex items-center gap-3">
          <Input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills..."
            value={query}
            variant="secondary"
            fullWidth
          />
        </div>

        {/* Unified grid */}
        <div className="flex flex-col gap-3">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              <SkillsSkeleton />
            </div>
          ) : sections.length ? (
            sections.map((section) => (
              <section className="flex flex-col gap-1.5" key={section.key}>
                <div className="px-1.5 pb-0.5">
                  <h2 className="text-foreground text-sm font-medium">
                    {section.title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {section.items.map((item) => {
                    const isItemInstalling =
                      installingSkills.has(
                        getInstallStateKey(item.name, "sentinel"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "claude"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "codex"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "copilot"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "cursor"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "opencode"),
                      );

                    return (
                      <SkillCell
                        item={item}
                        codexAvailable={codexAvailable}
                        copilotAvailable={copilotAvailable}
                        cursorAvailable={cursorAvailable}
                        openCodeAvailable={openCodeAvailable}
                        isInstalling={isItemInstalling}
                        key={item.key}
                        onOpenInstall={setInstallModalSkill}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-2xl bg-surface px-4 py-8 text-center">
              <p className="text-foreground text-sm font-medium">
                No skills found
              </p>
              <p className="text-muted mt-1 text-xs">
                {query
                  ? "Try a different search term."
                  : "Install a skill or add a custom one to get started."}
              </p>
            </div>
          )}
        </div>
      </div>
      <SkillInstallModal
        skill={activeModalSkill}
        codexAvailable={codexAvailable}
        copilotAvailable={copilotAvailable}
        cursorAvailable={cursorAvailable}
        openCodeAvailable={openCodeAvailable}
        installingSkills={installingSkills}
        installErrors={installErrors}
        onInstall={handleInstall}
        isOpen={installModalSkill !== null}
        onOpenChange={(open) => {
          if (!open) setInstallModalSkill(null);
        }}
      />
      <CustomSkillInstallDrawer
        codexAvailable={codexAvailable}
        copilotAvailable={copilotAvailable}
        cursorAvailable={cursorAvailable}
        createSkillHref={newSkillHref}
        isOpen={installDrawerOpen}
        onOpenChange={setInstallDrawerOpen}
        openCodeAvailable={openCodeAvailable}
      />
    </SettingsPageWrapper>
  );
}
