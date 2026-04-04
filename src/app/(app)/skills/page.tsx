"use client";

import {
  Button,
  Dropdown,
  Input,
  Skeleton,
  Spinner,
  Tabs,
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
import { sileo } from "sileo";

import { type SelectOption } from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { CustomSkillInstallSidebar } from "@/components/skills/custom-skill-install-sidebar";
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
import { SidebarToggle, useRightSidebar, useShell } from "@/components/shell";
import { api, type RouterOutputs } from "@/trpc/react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type SkillListItem = RouterOutputs["skills"]["list"]["skills"][number];
type RegistryItem = RouterOutputs["skills"]["registry"][number];
type SkillInstallTarget = "claude" | "codex" | "sentinel";
type InstalledSkillAction = Pick<SkillListItem, "name" | "scope" | "target">;

type UnifiedSkill = {
  key: string;
  name: string;
  displayName: string;
  description: string;
  registryEntry: RegistryItem | null;
  installedTargets: { sentinel: boolean; claude: boolean; codex: boolean };
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
}) {
  return targets.sentinel || targets.claude || targets.codex;
}

function isFullyInstalled(
  targets: {
    sentinel: boolean;
    claude: boolean;
    codex: boolean;
  },
  options?: {
    codexAvailable?: boolean;
  },
) {
  const codexRequired = options?.codexAvailable ?? true;

  return (
    targets.sentinel && targets.claude && (codexRequired ? targets.codex : true)
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
          className="flex items-center gap-2.5 rounded-2xl bg-surface px-2.5 py-2"
          key={index}
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
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

function SkillCell({
  item,
  codexAvailable,
  isInstalling,
  installError,
  onInstall,
}: {
  item: UnifiedSkill;
  codexAvailable: boolean;
  isInstalling: boolean;
  installError: string | null;
  onInstall: (entry: RegistryItem, target: SkillInstallTarget) => void;
}) {
  const fullyInstalled =
    isFullyInstalled(item.installedTargets, { codexAvailable }) ||
    // Custom installed skills (not from registry) are inherently "complete"
    (!item.registryEntry && hasAnyInstall(item.installedTargets));
  const canInstall = item.registryEntry && !fullyInstalled;

  // Wrap the clickable area (icon + text) in a Link, but keep the action
  // button outside so the Dropdown works independently.
  return (
    <div>
      <div className="border-separator/20 flex items-center gap-2.5 rounded-2xl border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-hover">
        {item.detailHref ? (
          <Link
            href={item.detailHref}
            prefetch
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            {/* Icon */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background text-foreground">
              <SkillIcon
                isExternal={shouldTreatAsExternal(item)}
                name={item.name}
                size={16}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-foreground text-[13px] font-medium leading-tight line-clamp-1">
                {item.displayName}
              </span>
              <p className="text-muted mt-0.5 truncate text-[11px]">
                {item.description}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-separator bg-background text-foreground">
              <SkillIcon
                isExternal={shouldTreatAsExternal(item)}
                name={item.name}
                size={16}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-foreground text-[13px] font-medium leading-tight line-clamp-1">
                {item.displayName}
              </span>
              <p className="text-muted mt-0.5 truncate text-[11px]">
                {item.description}
              </p>
            </div>
          </div>
        )}

        {/* Action indicator */}
        <div className="shrink-0">
          {canInstall ? (
            <Dropdown>
              <Button
                isDisabled={isInstalling}
                isPending={isInstalling}
                size="sm"
                variant="tertiary"
                isIconOnly
                className="h-6 w-6 min-w-0 rounded-full"
              >
                {({ isPending }) =>
                  isPending ? (
                    <Spinner color="current" size="sm" />
                  ) : (
                    <HugeiconsIcon
                      color="currentColor"
                      icon={PlusSignIcon}
                      size={16}
                      strokeWidth={2}
                      className="text-muted"
                    />
                  )
                }
              </Button>
              <Dropdown.Popover
                className="min-w-[240px]"
                placement="bottom end"
              >
                <Dropdown.Menu
                  onAction={(key) =>
                    item.registryEntry &&
                    onInstall(
                      item.registryEntry,
                      String(key) as SkillInstallTarget,
                    )
                  }
                >
                  {TARGET_OPTIONS.map((option) => {
                    const target = option.value as SkillInstallTarget;
                    const optionInstalled = item.installedTargets[target];
                    const optionDisabled =
                      optionInstalled ||
                      (target === "codex" && !codexAvailable) ||
                      isInstalling;

                    return (
                      <Dropdown.Item
                        id={target}
                        isDisabled={optionDisabled}
                        key={target}
                        textValue={`Install in ${option.label}`}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="text-sm">
                            {optionInstalled
                              ? `${option.label} installed`
                              : `Install in ${option.label}`}
                          </span>
                          <span className="text-muted text-xs">
                            {target === "codex" && !codexAvailable
                              ? "Codex is currently unavailable."
                              : option.description}
                          </span>
                        </div>
                      </Dropdown.Item>
                    );
                  })}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : fullyInstalled ? (
            <div className="flex h-6 w-6 items-center justify-center">
              <CheckCircleFilled size={18} className="text-success" />
            </div>
          ) : null}
        </div>
      </div>

      {installError ? (
        <p className="border-danger-soft-hover bg-danger-soft text-danger-soft-foreground mx-2 mt-0.5 rounded-xl border px-3 py-1.5 text-xs">
          {installError}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                 */
/* -------------------------------------------------------------------------- */

export default function SkillsPage() {
  const { leftSidebarOpen } = useShell();
  const { open: openRightSidebar } = useRightSidebar();
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

  const isLoading =
    (skills.isPending && !skills.data) ||
    (registry.isPending && !registry.data);

  // Build the unified list
  const unified = useMemo(
    () => buildUnifiedList(registryEntries, allSkills),
    [registryEntries, allSkills],
  );

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
        sileo.success({
          description: result.alreadyInstalled
            ? "Skill already installed. Refreshed skill state."
            : "Skill installed.",
        });
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

  const handleOpenInstallSidebar = useCallback(() => {
    openRightSidebar(
      <CustomSkillInstallSidebar
        codexAvailable={codexAvailable}
        createSkillHref={newSkillHref}
      />,
    );
  }, [codexAvailable, newSkillHref, openRightSidebar]);

  return (
    <SettingsPageWrapper
      actions={
        <Button
          onPress={handleOpenInstallSidebar}
          size="sm"
          variant="primary"
          className="h-7 px-2 rounded-[10px]"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={PlusSignIcon}
            size={16}
            strokeWidth={1.5}
          />
          Add custom
        </Button>
      }
      title={
        <div>
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          Skills
        </div>
      }
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
                    const installErrorForItem =
                      installErrors[
                        getInstallStateKey(item.name, "sentinel")
                      ] ??
                      installErrors[getInstallStateKey(item.name, "claude")] ??
                      installErrors[getInstallStateKey(item.name, "codex")] ??
                      null;

                    const isItemInstalling =
                      installingSkills.has(
                        getInstallStateKey(item.name, "sentinel"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "claude"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(item.name, "codex"),
                      );

                    return (
                      <SkillCell
                        item={item}
                        codexAvailable={codexAvailable}
                        isInstalling={isItemInstalling}
                        installError={installErrorForItem}
                        key={item.key}
                        onInstall={handleInstall}
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
    </SettingsPageWrapper>
  );
}
