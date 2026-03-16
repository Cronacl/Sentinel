"use client";

import { memo, useCallback } from "react";

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

export const GHSearchTool = memo(function GHSearchTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isCodeSearch = toolName === "gh_search_code";

  const output =
    hasOutput && "output" in part
      ? (part.output as RepoSearchOutput | CodeSearchOutput)
      : null;
  const input = "input" in part ? (part.input as { query?: string }) : null;

  const resultCount = output
    ? "repos" in output
      ? output.repos.length
      : "results" in output
        ? output.results.length
        : 0
    : 0;
  const totalCount = output
    ? "totalCount" in output
      ? output.totalCount
      : 0
    : 0;

  const canOpen = Boolean(output && resultCount > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || resultCount === 0) return;
    open(
      <GHSearchSidebar
        query={input?.query ?? ""}
        output={output}
        isCodeSearch={isCodeSearch}
      />,
    );
  }, [open, output, input?.query, isCodeSearch, resultCount]);

  const label = (() => {
    if (isError)
      return isCodeSearch ? "Code search failed" : "Repo search failed";
    if (isRunning) {
      const searchType = isCodeSearch ? "code" : "repos";
      return input?.query
        ? `Searching ${searchType} for \u201c${input.query}\u201d`
        : `Searching ${searchType}\u2026`;
    }
    if (output) {
      const kind = isCodeSearch ? "result" : "repo";
      return `Found ${totalCount} ${kind}${totalCount !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return isCodeSearch ? "Searching code\u2026" : "Searching repos\u2026";
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
      <IntegrationProviderIcon
        provider="github"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
