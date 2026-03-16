"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type IssueOutput = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  assignees: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  milestone: string;
};

type IssuesListOutput = { issues: IssueOutput[] };

export const GHIssueDetailTool = memo(function GHIssueDetailTool({
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
  const isList = toolName === "gh_list_issues";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as IssueOutput | IssuesListOutput)
      : null;

  const issues: IssueOutput[] = output
    ? "issues" in output
      ? output.issues
      : [output as IssueOutput]
    : [];

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Fetching issues\u2026"
      : "Fetching issue\u2026"
    : state.isError
      ? "Failed to fetch issue"
      : isList
        ? `Listed ${issues.length} issue${issues.length !== 1 ? "s" : ""}`
        : issues.length > 0
          ? `#${issues[0]!.number} ${issues[0]!.title}`
          : "Issue details";

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
      isExpandable={issues.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-2 p-1">
        {issues.map((issue) => (
          <a
            key={issue.id}
            href={issue.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-foreground/5"
          >
            <Icon
              icon={
                issue.state === "open"
                  ? "solar:record-circle-linear"
                  : "solar:check-circle-linear"
              }
              className={`mt-0.5 h-4 w-4 shrink-0 ${issue.state === "open" ? "text-success" : "text-primary"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                #{issue.number} {issue.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-foreground/40">
                <span>{issue.author}</span>
                <span>
                  {new Date(issue.createdAt).toLocaleDateString()}
                </span>
                {issue.comments > 0 ? (
                  <span className="flex items-center gap-0.5">
                    <Icon
                      icon="solar:chat-round-line-linear"
                      className="h-3 w-3"
                    />
                    {issue.comments}
                  </span>
                ) : null}
              </div>
              {issue.labels.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {issue.labels.map((l) => (
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
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
