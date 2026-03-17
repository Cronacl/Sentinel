"use client";

import { memo, useState, useCallback } from "react";
import { CloseButton, Separator } from "@heroui/react";
import { Icon } from "@iconify/react";

import { useRightSidebar } from "@/components/shell/shell-context";

type RepoResult = {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  visibility: string;
  defaultBranch: string;
  updatedAt: string;
  owner: string;
  isPrivate: boolean;
};

type CodeResult = {
  name: string;
  path: string;
  htmlUrl: string;
  repository: string;
  textMatches: string[];
};

type RepoSearchOutput = {
  repos: RepoResult[];
  totalCount: number;
};

type CodeSearchOutput = {
  results: CodeResult[];
  totalCount: number;
};

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
};

function RepoRow({
  repo,
  onSelect,
}: {
  repo: RepoResult;
  onSelect: (repo: RepoResult) => void;
}) {
  const langColor = LANGUAGE_COLORS[repo.language] ?? "#8b8b8b";

  return (
    <button
      type="button"
      onClick={() => onSelect(repo)}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/5"
    >
      <Icon
        icon={repo.isPrivate ? "solar:lock-linear" : "solar:book-linear"}
        className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {repo.fullName}
        </p>
        {repo.description ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/50">
            {repo.description}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-3 text-[10px] text-foreground/40">
          {repo.language ? (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: langColor }}
              />
              {repo.language}
            </span>
          ) : null}
          <span className="flex items-center gap-0.5">
            <Icon icon="solar:star-linear" className="h-3 w-3" />
            {repo.stars.toLocaleString()}
          </span>
          <span className="flex items-center gap-0.5">
            <Icon icon="solar:copy-linear" className="h-3 w-3" />
            {repo.forks.toLocaleString()}
          </span>
        </div>
      </div>
    </button>
  );
}

function CodeRow({ result }: { result: CodeResult }) {
  return (
    <a
      href={result.htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/5"
    >
      <Icon
        icon="solar:code-linear"
        className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {result.path}
        </p>
        <p className="mt-0.5 text-[11px] text-foreground/40">
          {result.repository}
        </p>
        {result.textMatches.length > 0 ? (
          <pre className="mt-1 overflow-hidden truncate rounded bg-foreground/5 px-2 py-1 text-[10px] text-foreground/60">
            {result.textMatches[0]}
          </pre>
        ) : null}
      </div>
    </a>
  );
}

function RepoDetail({ repo }: { repo: RepoResult }) {
  const langColor = LANGUAGE_COLORS[repo.language] ?? "#8b8b8b";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-[15px] font-medium text-foreground">
          {repo.fullName}
        </h3>
        {repo.description ? (
          <p className="mt-1 text-[12px] text-foreground/60">
            {repo.description}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/30 bg-foreground/2 px-3 py-2">
          <p className="text-[10px] text-foreground/40">
            Stars
          </p>
          <p className="text-[13px] font-medium text-foreground">
            {repo.stars.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border/30 bg-foreground/2 px-3 py-2">
          <p className="text-[10px] text-foreground/40">
            Forks
          </p>
          <p className="text-[13px] font-medium text-foreground">
            {repo.forks.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border/30 bg-foreground/2 px-3 py-2">
          <p className="text-[10px] text-foreground/40">
            Open Issues
          </p>
          <p className="text-[13px] font-medium text-foreground">
            {repo.openIssues.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border/30 bg-foreground/2 px-3 py-2">
          <p className="text-[10px] text-foreground/40">
            Language
          </p>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            {repo.language ? (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: langColor }}
              />
            ) : null}
            {repo.language || "—"}
          </p>
        </div>
      </div>

      <div className="space-y-2 text-[12px] text-foreground/60">
        <div className="flex items-center justify-between">
          <span>Visibility</span>
          <span className="font-medium text-foreground/80">
            {repo.visibility}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Default branch</span>
          <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-[11px] text-foreground/70">
            {repo.defaultBranch}
          </code>
        </div>
        <div className="flex items-center justify-between">
          <span>Owner</span>
          <span className="font-medium text-foreground/80">{repo.owner}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Updated</span>
          <span className="font-medium text-foreground/80">
            {new Date(repo.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <a
        href={repo.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[12px] text-primary hover:underline"
      >
        <Icon icon="solar:link-round-linear" className="h-3.5 w-3.5" />
        Open on GitHub
      </a>
    </div>
  );
}

type SidebarProps = {
  query: string;
  output: RepoSearchOutput | CodeSearchOutput;
  isCodeSearch: boolean;
};

export const GHSearchSidebar = memo(function GHSearchSidebar({
  query,
  output,
  isCodeSearch,
}: SidebarProps) {
  const { close } = useRightSidebar();
  const [selectedRepo, setSelectedRepo] = useState<RepoResult | null>(null);

  const handleBack = useCallback(() => {
    setSelectedRepo(null);
  }, []);

  const title = selectedRepo
    ? selectedRepo.fullName
    : isCodeSearch
      ? "Code Search"
      : "Repo Search";

  const totalCount =
    "totalCount" in output ? output.totalCount : 0;
  const subtitle = selectedRepo
    ? undefined
    : `"${query}" \u2014 ${totalCount} result${totalCount !== 1 ? "s" : ""}`;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        {selectedRepo ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Icon icon="solar:arrow-left-linear" className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-[11px] text-foreground/50">
              {subtitle}
            </p>
          ) : null}
        </div>
        <CloseButton onPress={close} />
      </header>

      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedRepo ? (
          <RepoDetail repo={selectedRepo} />
        ) : isCodeSearch && "results" in output ? (
          <div className="space-y-0.5 p-2">
            {output.results.map((r, idx) => (
              <CodeRow key={`${r.repository}-${r.path}-${idx}`} result={r} />
            ))}
          </div>
        ) : "repos" in output ? (
          <div className="space-y-0.5 p-2">
            {output.repos.map((r) => (
              <RepoRow key={r.id} repo={r} onSelect={setSelectedRepo} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});
