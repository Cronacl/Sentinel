"use client";

import { memo, useCallback } from "react";
import { Icon } from "@iconify/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { GHSearchSidebar } from "./gh-search-sidebar";

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

type GetRepoOutput = RepoResult;
type ListReposOutput = { repos: RepoResult[] };

export const GHRepoTool = memo(function GHRepoTool({ part }: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isList = toolName === "gh_list_repos";

  const output =
    hasOutput && "output" in part
      ? (part.output as GetRepoOutput | ListReposOutput)
      : null;
  const input =
    "input" in part ? (part.input as { owner?: string; repo?: string }) : null;

  const repos = output
    ? "repos" in output
      ? output.repos
      : [output as RepoResult]
    : [];
  const canOpen = repos.length > 0;

  const handleOpenSidebar = useCallback(() => {
    if (repos.length === 0) return;
    open(
      <GHSearchSidebar
        query={
          isList
            ? "your repositories"
            : `${input?.owner ?? ""}/${input?.repo ?? ""}`
        }
        output={{ repos, totalCount: repos.length }}
        isCodeSearch={false}
      />,
    );
  }, [open, repos, isList, input?.owner, input?.repo]);

  const label = (() => {
    if (isError) return "Failed to fetch repo details";
    if (isRunning) {
      return isList
        ? "Fetching repositories\u2026"
        : `Fetching ${input?.owner ?? ""}/${input?.repo ?? ""}\u2026`;
    }
    if (repos.length > 0) {
      return isList
        ? `Listed ${repos.length} repositories`
        : repos[0]!.fullName;
    }
    return "Fetching repository\u2026";
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <IntegrationProviderIcon provider="github" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
