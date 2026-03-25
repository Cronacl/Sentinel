"use client";

import {
  Button,
  Chip,
  Dropdown,
  Input,
  Skeleton,
  Spinner,
} from "@heroui/react";
import {
  AiIdeaIcon,
  ArrowRight01Icon,
  BrushIcon,
  BulbIcon,
  CubeIcon,
  Delete02Icon,
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

type SkillListItem = RouterOutputs["skills"]["list"]["skills"][number];
type RegistryItem = RouterOutputs["skills"]["registry"][number];
type SkillInstallTarget = "codex" | "sentinel";
type InstalledSkillAction = Pick<SkillListItem, "name" | "scope" | "target">;

const SOURCE_LABEL = {
  agents: "Agents",
  claude: "Claude",
  codex: "Codex",
  sentinel: "Sentinel",
} as const;

const TARGET_LABEL = {
  codex: "Codex",
  sentinel: "Sentinel",
} as const;

const TARGET_OPTIONS: SelectOption[] = [
  {
    description: "Install into Sentinel's local skill directories.",
    label: "Sentinel",
    value: "sentinel",
  },
  {
    description: "Install into the Codex home skills directory.",
    label: "Codex",
    value: "codex",
  },
] as const;

function formatSkillTitle(name: string) {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesSkill(
  skill: Pick<
    SkillListItem,
    "description" | "name" | "scope" | "sourceKind" | "target"
  >,
  query: string,
) {
  if (!query) {
    return true;
  }

  const haystack =
    `${skill.name} ${skill.description} ${skill.scope} ${skill.sourceKind} ${skill.target}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesRegistrySkill(
  skill: Pick<RegistryItem, "name" | "displayName" | "description" | "repoUrl">,
  query: string,
) {
  if (!query) {
    return true;
  }

  const haystack =
    `${skill.name} ${skill.displayName} ${skill.description} ${skill.repoUrl}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function isRegistrySkillFullyInstalled(
  skill: Pick<RegistryItem, "installedTargets">,
) {
  return skill.installedTargets.codex && skill.installedTargets.sentinel;
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

function SkillIcon({ name, size = 24 }: { name: string; size?: number }) {
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

function repoLabel(repoUrl: string) {
  try {
    return new URL(repoUrl).pathname.replace(/^\//, "").replace(/\/$/, "");
  } catch {
    return repoUrl;
  }
}

function getInstallStateKey(name: string, target: SkillInstallTarget) {
  return `${name}:${target}`;
}

function getInstalledDetailHref(skill: SkillListItem) {
  if (skill.target === "codex") {
    return `/skills/${encodeURIComponent(skill.name)}?target=codex`;
  }

  return `/skills/${encodeURIComponent(skill.name)}`;
}

function SkillsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="border-separator bg-surface flex items-center gap-3 rounded-2xl border p-4"
          key={index}
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36 rounded-md" />
            <Skeleton className="h-3 w-56 max-w-full rounded-md" />
          </div>
          <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full sm:block" />
        </div>
      ))}
    </>
  );
}

function InstalledSkillRow({
  skill,
  onUninstall,
  isUninstalling,
}: {
  skill: SkillListItem;
  onUninstall: ((skill: InstalledSkillAction) => void) | null;
  isUninstalling: boolean;
}) {
  return (
    <div className="border-separator bg-surface group flex items-center gap-3 rounded-2xl border p-3 transition-colors">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
        href={getInstalledDetailHref(skill)}
        prefetch
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/50 text-foreground/75">
          <SkillIcon name={skill.name} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">
              {formatSkillTitle(skill.name)}
            </span>
            {/* <Chip
              className="hidden sm:inline-flex border border-border/50 bg-background/80 text-foreground/75"
              size="sm"
              variant="tertiary"
            >
              {SOURCE_LABEL[skill.sourceKind]}
            </Chip>
            <Chip
              className="hidden md:inline-flex border border-border/50 bg-background/80 text-foreground/75"
              size="sm"
              variant="tertiary"
            >
              {TARGET_LABEL[skill.target]}
            </Chip> */}
          </div>
          <p className="text-muted mt-0.5 truncate text-xs">
            {skill.description}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {onUninstall ? (
          <Button
            isDisabled={isUninstalling}
            isPending={isUninstalling}
            onPress={() =>
              onUninstall({
                name: skill.name,
                scope: skill.scope,
                target: skill.target,
              })
            }
            size="sm"
            variant="ghost"
          >
            {({ isPending }) =>
              isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <HugeiconsIcon
                  color="currentColor"
                  icon={Delete02Icon}
                  size={14}
                  strokeWidth={1.5}
                />
              )
            }
          </Button>
        ) : null}
        <Link href={getInstalledDetailHref(skill)} prefetch>
          <div className="text-muted opacity-0 transition-opacity group-hover:opacity-100">
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={1.5}
            />
          </div>
        </Link>
      </div>
    </div>
  );
}

function RegistrySkillRow({
  codexAvailable,
  entry,
  installError,
  isInstalling,
  onInstall,
}: {
  codexAvailable: boolean;
  entry: RegistryItem;
  installError: string | null;
  isInstalling: boolean;
  onInstall: (entry: RegistryItem, target: SkillInstallTarget) => void;
}) {
  const installStatusLabel =
    entry.installedTargets.codex && entry.installedTargets.sentinel
      ? "Installed in Sentinel and Codex"
      : entry.installedTargets.codex
        ? "Installed in Codex"
        : entry.installedTargets.sentinel
          ? "Installed in Sentinel"
          : null;
  const allTargetsInstalled =
    entry.installedTargets.codex && entry.installedTargets.sentinel;

  return (
    <div className="border-separator bg-surface rounded-2xl border p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/50 text-foreground/75">
          <SkillIcon name={entry.name} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">
              {entry.displayName}
            </span>
          </div>
          <p className="text-muted mt-0.5 line-clamp-2 text-xs">
            {entry.description}
          </p>
          <a
            className="text-muted mt-0.5 inline-flex items-center gap-1 text-[11px] transition-colors hover:text-foreground"
            href={entry.repoUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={GithubIcon}
              size={11}
              strokeWidth={1.5}
            />
            {repoLabel(entry.repoUrl)}
          </a>
          {installStatusLabel ? (
            <p className="text-muted mt-2 text-[11px]">{installStatusLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Dropdown>
          <Button
            isDisabled={isInstalling || allTargetsInstalled}
            isPending={isInstalling}
            size="sm"
            variant="secondary"
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isPending
                  ? "Installing..."
                  : allTargetsInstalled
                    ? "Installed"
                    : "Install"}
              </>
            )}
          </Button>
          <Dropdown.Popover className="min-w-[240px]" placement="bottom end">
            <Dropdown.Menu
              onAction={(key) =>
                onInstall(entry, String(key) as SkillInstallTarget)
              }
            >
              {TARGET_OPTIONS.map((option) => {
                const target = option.value as SkillInstallTarget;
                const optionInstalled = entry.installedTargets[target];
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
      </div>

      {installError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mt-2 rounded-xl border px-3 py-2 text-xs">
          {installError}
        </p>
      ) : null}
    </div>
  );
}

export default function SkillsPage() {
  const { leftSidebarOpen } = useShell();
  const { open: openRightSidebar } = useRightSidebar();
  const [query, setQuery] = useState("");
  const [installErrors, setInstallErrors] = useState<Record<string, string>>(
    {},
  );
  const [installingSkills, setInstallingSkills] = useState<Set<string>>(
    new Set(),
  );
  const [uninstallingSkills, setUninstallingSkills] = useState<Set<string>>(
    new Set(),
  );

  const utils = api.useUtils();

  const skills = api.skills.list.useQuery(undefined, {
    refetchInterval: 2_000,
  });
  const registry = api.skills.registry.useQuery();
  const engines = api.engines.list.useQuery();

  const installMutation = api.skills.install.useMutation();
  const uninstallMutation = api.skills.uninstall.useMutation();

  const allSkills = skills.data?.skills ?? [];
  const registryEntries = registry.data ?? [];
  const codexAvailable = Boolean(
    engines.data?.find((engine) => engine.engine === "codex")?.isAvailable,
  );

  const registryByName = useMemo(
    () => new Map(registryEntries.map((e) => [e.name.trim().toLowerCase(), e])),
    [registryEntries],
  );

  const filteredInstalled = useMemo(
    () => allSkills.filter((skill) => matchesSkill(skill, query)),
    [allSkills, query],
  );

  const availableRegistry = useMemo(
    () =>
      registryEntries.filter(
        (entry) =>
          !isRegistrySkillFullyInstalled(entry) &&
          matchesRegistrySkill(entry, query),
      ),
    [registryEntries, query],
  );

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
        await installMutation.mutateAsync({
          name: entry.name,
          scope: "global",
          target,
        });
        void utils.skills.list.invalidate();
        void utils.skills.registry.invalidate();
        sileo.success({ description: "Skill installed." });
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

  const handleUninstall = useCallback(
    async ({ name, scope, target }: InstalledSkillAction) => {
      const uninstallKey = `${target}:${scope}:${name}`;
      setUninstallingSkills((prev) => new Set(prev).add(uninstallKey));

      try {
        await uninstallMutation.mutateAsync({ name, scope, target });
        void utils.skills.list.invalidate();
        void utils.skills.registry.invalidate();
        sileo.success({ description: "Skill uninstalled." });
      } catch (error) {
        sileo.error({
          description:
            error instanceof Error
              ? error.message
              : "Failed to uninstall skill.",
        });
      } finally {
        setUninstallingSkills((prev) => {
          const next = new Set(prev);
          next.delete(uninstallKey);
          return next;
        });
      }
    },
    [uninstallMutation, utils],
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
          variant="secondary"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={PlusSignIcon}
            size={16}
            strokeWidth={1.5}
          />
          New skill
        </Button>
      }
      subtitle={
        <span className="max-w-sm">
          Browse discovered skills across Sentinel and Codex, and install
          recommended skills into either runtime.
        </span>
      }
      title={
        <div>
          {!leftSidebarOpen ? <SidebarToggle /> : null}
          Skills
        </div>
      }
    >
      {skills.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {skills.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search installed and available skills"
          value={query}
          variant="secondary"
        />

        <section>
          <h2 className="text-foreground mb-3 text-sm font-medium">
            Installed
          </h2>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {skills.isPending && !skills.data ? (
              <SkillsSkeleton />
            ) : filteredInstalled.length ? (
              filteredInstalled.map((skill) => {
                const match = registryByName.get(
                  skill.name.trim().toLowerCase(),
                );
                return (
                  <InstalledSkillRow
                    isUninstalling={uninstallingSkills.has(
                      `${skill.target}:${skill.scope}:${skill.name}`,
                    )}
                    key={`${skill.target}:${skill.scope}:${skill.skillFile}`}
                    onUninstall={match ? handleUninstall : null}
                    skill={skill}
                  />
                );
              })
            ) : allSkills.length ? (
              <div className="border-separator bg-surface rounded-xl border p-5">
                <h2 className="text-foreground text-sm font-medium">
                  No matching skills
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Try a different search term.
                </p>
              </div>
            ) : (
              <div className="border-separator bg-surface col-span-full rounded-xl border p-5">
                <h2 className="text-foreground text-sm font-medium">
                  No skills installed
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Install a recommended skill below, or add one under{" "}
                  <code className="text-foreground/80">.sentinel/skills</code>{" "}
                  or <code className="text-foreground/80">~/.codex/skills</code>
                  .
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-foreground mb-3 text-sm font-medium">
            Recommended
          </h2>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {registry.isPending && !registry.data ? (
              <SkillsSkeleton />
            ) : availableRegistry.length ? (
              availableRegistry.map((entry) => {
                return (
                  <RegistrySkillRow
                    codexAvailable={codexAvailable}
                    entry={entry}
                    installError={
                      installErrors[
                        getInstallStateKey(entry.name, "sentinel")
                      ] ??
                      installErrors[getInstallStateKey(entry.name, "codex")] ??
                      null
                    }
                    isInstalling={
                      installingSkills.has(
                        getInstallStateKey(entry.name, "sentinel"),
                      ) ||
                      installingSkills.has(
                        getInstallStateKey(entry.name, "codex"),
                      )
                    }
                    key={entry.name}
                    onInstall={handleInstall}
                  />
                );
              })
            ) : registryEntries.length &&
              registryEntries.every((entry) =>
                isRegistrySkillFullyInstalled(entry),
              ) ? (
              <div className="border-separator bg-surface col-span-full rounded-xl border p-5">
                <h2 className="text-foreground text-sm font-medium">
                  All recommended skills installed
                </h2>
                <p className="text-muted mt-1 text-sm">
                  You have installed every skill from the curated registry for
                  both runtimes.
                </p>
              </div>
            ) : (
              <div className="border-separator bg-surface col-span-full rounded-xl border p-5">
                <h2 className="text-foreground text-sm font-medium">
                  No matching skills
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Try a different search term.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
}
