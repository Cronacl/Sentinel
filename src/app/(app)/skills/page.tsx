"use client";

import { Button, Chip, Input, Skeleton, Spinner } from "@heroui/react";
import {
  AiIdeaIcon,
  ArrowRight01Icon,
  BrushIcon,
  CubeIcon,
  GithubIcon,
  NotebookIcon,
  PlusSignIcon,
  RefreshIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { api, type RouterOutputs } from "@/trpc/react";

type SkillListItem = RouterOutputs["skills"]["list"]["skills"][number];

const SOURCE_LABEL = {
  agents: "Agents",
  claude: "Claude",
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

function matchesSkill(
  skill: Pick<SkillListItem, "description" | "name" | "scope" | "sourceKind">,
  query: string,
) {
  if (!query) {
    return true;
  }

  const haystack =
    `${skill.name} ${skill.description} ${skill.scope} ${skill.sourceKind}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function getSkillIcon(name: string) {
  const normalized = name.trim().toLowerCase();

  if (normalized === "ai-sdk") {
    return AiIdeaIcon;
  }

  if (normalized === "github-fix-ci") {
    return GithubIcon;
  }

  if (normalized === "openai-docs") {
    return NotebookIcon;
  }

  if (normalized === "skill-creator") {
    return BrushIcon;
  }

  if (normalized === "skill-installer") {
    return SparklesIcon;
  }

  return CubeIcon;
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

function SkillRow({ skill }: { skill: SkillListItem }) {
  const SkillIcon = getSkillIcon(skill.name);

  return (
    <Link
      className="border-separator bg-surface hover:bg-surface/50 group flex items-center gap-3 rounded-2xl border p-4 transition-colors"
      href={`/skills/${encodeURIComponent(skill.name)}`}
      prefetch
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-background/50 text-foreground/75">
        <HugeiconsIcon
          color="currentColor"
          icon={SkillIcon}
          size={16}
          strokeWidth={1.5}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {formatSkillTitle(skill.name)}
          </span>
          <Chip
            className="hidden sm:inline-flex border border-border/50 bg-background/80 text-foreground/75"
            size="sm"
            variant="tertiary"
          >
            {SOURCE_LABEL[skill.sourceKind]}
          </Chip>
        </div>
        <p className="text-muted mt-0.5 truncate text-xs">
          {skill.description}
        </p>
      </div>

      <div className="text-muted shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <HugeiconsIcon
          color="currentColor"
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={1.5}
        />
      </div>
    </Link>
  );
}

export default function SkillsPage() {
  const [query, setQuery] = useState("");

  const skills = api.skills.list.useQuery(undefined, {
    refetchInterval: 2_000,
  });

  const allSkills = skills.data?.skills ?? [];
  const filteredSkills = useMemo(
    () => allSkills.filter((skill) => matchesSkill(skill, query)),
    [allSkills, query],
  );

  const newSkillHref = allSkills.some(
    (skill) => skill.name.trim().toLowerCase() === "skill-creator",
  )
    ? "/skills/skill-creator"
    : "https://agentskills.io/specification";

  return (
    <SettingsPageWrapper
      actions={
        <>
          <Button
            isDisabled={skills.isFetching}
            onPress={() => void skills.refetch()}
            size="sm"
            variant="tertiary"
          >
            {skills.isFetching ? (
              <>
                <Spinner color="current" size="sm" />
                <span className="animate-pulse">Refreshing</span>
              </>
            ) : (
              <>
                <HugeiconsIcon
                  color="currentColor"
                  icon={RefreshIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                Refresh
              </>
            )}
          </Button>
          <Link
            href={newSkillHref}
            rel={
              newSkillHref.startsWith("http")
                ? "noopener noreferrer"
                : undefined
            }
            target={newSkillHref.startsWith("http") ? "_blank" : undefined}
          >
            <Button size="sm" variant="secondary">
              <HugeiconsIcon
                color="currentColor"
                icon={PlusSignIcon}
                size={16}
                strokeWidth={1.5}
              />
              New skill
            </Button>
          </Link>
        </>
      }
      subtitle="Browse discovered skills from your workspace and home directories."
      title="Skills"
    >
      {skills.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {skills.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills"
          value={query}
          variant="secondary"
        />

        <section className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {skills.isPending && !skills.data ? (
            <SkillsSkeleton />
          ) : filteredSkills.length ? (
            filteredSkills.map((skill) => (
              <SkillRow
                key={`${skill.scope}:${skill.sourceKind}:${skill.skillFile}`}
                skill={skill}
              />
            ))
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
            <div className="border-separator bg-surface rounded-xl border p-5">
              <h2 className="text-foreground text-sm font-medium">
                No skills discovered
              </h2>
              <p className="text-muted mt-1 text-sm">
                Add a skill under `.sentinel/skills`, `.agents/skills`, or
                `.claude/skills` to see it here.
              </p>
            </div>
          )}
        </section>
      </div>
    </SettingsPageWrapper>
  );
}
