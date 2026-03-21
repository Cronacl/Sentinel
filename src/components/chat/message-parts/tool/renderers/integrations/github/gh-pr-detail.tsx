"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type PROutput = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  author: string;
  head: string;
  base: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  reviewDecision: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};

type PRListOutput = { prs: PROutput[] };

function prStateIcon(pr: PROutput) {
  if (pr.merged) return { icon: "solar:merge-linear", cls: "text-primary" };
  if (pr.draft)
    return { icon: "solar:document-linear", cls: "text-foreground/40" };
  if (pr.state === "open")
    return { icon: "solar:git-pull-request-linear", cls: "text-success" };
  return { icon: "solar:git-pull-request-closed-linear", cls: "text-danger" };
}

export const GHPRDetailTool = memo(function GHPRDetailTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const isList = toolName === "gh_list_prs";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as PROutput | PRListOutput)
      : null;

  const prs: PROutput[] = output
    ? "prs" in output
      ? output.prs
      : [output as PROutput]
    : [];

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Fetching pull requests\u2026"
      : "Fetching pull request\u2026"
    : state.isError
      ? "Failed to fetch pull request"
      : isList
        ? `Listed ${prs.length} PR${prs.length !== 1 ? "s" : ""}`
        : prs.length > 0
          ? `#${prs[0]!.number} ${prs[0]!.title}`
          : "Pull request details";

  return (
    <IntegrationToolLayout
      provider="GitHub"
      providerIcon={
        <IntegrationProviderIcon provider="github" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={prs.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-2 p-1">
        {prs.map((pr) => {
          const si = prStateIcon(pr);
          return (
            <a
              key={pr.id}
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-foreground/5"
            >
              <Icon
                icon={si.icon}
                className={`mt-0.5 h-4 w-4 shrink-0 ${si.cls}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-foreground">
                  #{pr.number} {pr.title}
                </p>
                <div className="mt-0.5 text-[10px] text-foreground/40">
                  <span>
                    {pr.head} &rarr; {pr.base}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-foreground/40">
                  <span>{pr.author}</span>
                  {pr.additions > 0 || pr.deletions > 0 ? (
                    <span>
                      <span className="text-success">+{pr.additions}</span>{" "}
                      <span className="text-danger">-{pr.deletions}</span>
                    </span>
                  ) : null}
                  {pr.changedFiles > 0 ? (
                    <span>{pr.changedFiles} files</span>
                  ) : null}
                  {pr.comments > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <Icon
                        icon="solar:chat-round-line-linear"
                        className="h-3 w-3"
                      />
                      {pr.comments}
                    </span>
                  ) : null}
                </div>
                {pr.labels.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {pr.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px] text-foreground/60"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </a>
          );
        })}
      </div>
    </IntegrationToolLayout>
  );
});
