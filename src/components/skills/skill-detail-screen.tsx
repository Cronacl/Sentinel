"use client";

import { Button, Chip, ScrollShadow, Skeleton } from "@heroui/react";
import {
  AiIdeaIcon,
  ArrowLeft01Icon,
  BrushIcon,
  CubeIcon,
  GithubIcon,
  NotebookIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MarkdownContent } from "@/components/chat/message-parts/text";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { api } from "@/trpc/react";

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

function getSkillIcon(name: string) {
  const normalized = name.trim().toLowerCase();
  if (normalized === "ai-sdk") return AiIdeaIcon;
  if (normalized === "github-fix-ci") return GithubIcon;
  if (normalized === "openai-docs") return NotebookIcon;
  if (normalized === "skill-creator") return BrushIcon;
  if (normalized === "skill-installer") return SparklesIcon;
  return CubeIcon;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-4/5 rounded-md" />
          </div>
        </div>
      </section>

      <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-5/6 rounded-md" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </section>

      <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
        <Skeleton className="h-5 w-20 rounded-md" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-3/4 rounded-md" />
        </div>
      </section>
    </div>
  );
}

export function SkillDetailScreen({ skillName }: { skillName: string }) {
  const [copiedLabel, setCopiedLabel] = useState<"name" | "path" | null>(null);

  const skill = api.skills.get.useQuery(
    { name: skillName },
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
  const SkillIcon = getSkillIcon(resolvedName);
  const loadedSkill = skill.data ?? null;

  return (
    <SettingsPageWrapper
      actions={
        <Link href="/skills">
          <Button size="sm" variant="tertiary">
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.5}
            />
            Back to skills
          </Button>
        </Link>
      }
      subtitle="Skill details"
      title={formatSkillTitle(resolvedName)}
    >
      {skill.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {skill.error.message}
        </p>
      ) : null}

      {skill.isPending && !skill.data ? (
        <DetailSkeleton />
      ) : !loadedSkill ? (
        <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
          <div className="flex items-start gap-3">
            <div className="border-separator bg-background flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
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
              <p className="text-muted mt-1 text-sm">
                The requested skill is no longer available in the current
                workspace.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
            <div className="flex items-start gap-3">
              <div className="border-border/50 bg-background/80 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-foreground/80">
                <HugeiconsIcon
                  color="currentColor"
                  icon={SkillIcon}
                  size={18}
                  strokeWidth={1.5}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-foreground text-base font-medium">
                  {formatSkillTitle(loadedSkill.name)}
                </h2>
                <p className="text-muted text-sm">{loadedSkill.description}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/30 pt-4">
              <Button
                onPress={() => void handleCopy(loadedSkill.name, "name")}
                size="sm"
                variant="tertiary"
                className="border border-border/50"
              >
                {copiedLabel === "name" ? "Copied name" : "Copy name"}
              </Button>
              <Button
                onPress={() => void handleCopy(loadedSkill.skillFile, "path")}
                size="sm"
                variant="tertiary"
                className="border border-border/50"
              >
                {copiedLabel === "path" ? "Copied path" : "Copy path"}
              </Button>
            </div>
          </section>

          <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
            <div className="space-y-0.5">
              <h2 className="text-foreground text-base font-medium">
                Overview
              </h2>
              <p className="text-muted text-sm">
                Full instructions and runtime guidance for this skill.
              </p>
            </div>

            <div className="mt-4">
              <ScrollShadow className="max-h-[48vh]" orientation="vertical">
                <div className="pr-2 [&_.sentinel-prose]:max-w-none [&_.sentinel-prose]:text-sm [&_.sentinel-prose_h1]:text-base [&_.sentinel-prose_h1]:font-medium [&_.sentinel-prose_h2]:text-sm [&_.sentinel-prose_h2]:font-medium [&_.sentinel-prose_li]:text-sm [&_.sentinel-prose_p]:text-sm">
                  <MarkdownContent
                    text={loadedSkill.content || "No preview available."}
                  />
                </div>
              </ScrollShadow>
            </div>
          </section>

          <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
            <h2 className="text-foreground text-base font-medium">Location</h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-border/60 bg-background/70 p-2 px-3">
                <p className="text-foreground text-xs">Skill file</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground/50">
                  {loadedSkill.skillFile}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 p-2 px-3">
                <p className="text-foreground text-xs">Directory</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground/50">
                  {loadedSkill.directory}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-surface/50 rounded-3xl border border-border/50 p-4">
            <h2 className="text-foreground text-base font-medium">Files</h2>
            <p className="text-muted mt-1 text-sm">
              Bundled assets discovered alongside SKILL.md.
            </p>
            <div className="mt-3">
              {loadedSkill.files.length ? (
                <div className="flex flex-wrap gap-2">
                  {loadedSkill.files.slice(0, 12).map((file) => (
                    <Chip
                      key={file}
                      size="sm"
                      variant="tertiary"
                      className="border border-border/50 bg-background/80 text-foreground/75"
                    >
                      {file}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-sm">
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
