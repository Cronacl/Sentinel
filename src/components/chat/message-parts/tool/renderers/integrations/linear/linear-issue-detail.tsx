"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type IssueOutput = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  stateName: string;
  stateType: string;
  priority: number;
  priorityLabel: string;
  labels: string[];
  assigneeName: string;
  creatorName: string;
  teamName: string;
  projectName: string;
  estimate: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type IssueListOutput = { issues: IssueOutput[]; totalCount?: number };

function stateIcon(stateType: string) {
  switch (stateType) {
    case "completed":
      return { icon: "solar:check-circle-linear", cls: "text-success" };
    case "cancelled":
      return { icon: "solar:close-circle-linear", cls: "text-foreground/40" };
    case "started":
      return { icon: "solar:play-circle-linear", cls: "text-primary" };
    case "unstarted":
      return { icon: "solar:record-circle-linear", cls: "text-foreground/50" };
    case "backlog":
      return { icon: "solar:archive-linear", cls: "text-foreground/30" };
    case "triage":
      return { icon: "solar:inbox-linear", cls: "text-warning" };
    default:
      return { icon: "solar:record-circle-linear", cls: "text-foreground/50" };
  }
}

export const LinearIssueDetailTool = memo(function LinearIssueDetailTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_issues";
  const isSearch = toolName === "linear_search_issues";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as IssueOutput | IssueListOutput)
      : null;

  const issues: IssueOutput[] = output
    ? "issues" in output
      ? output.issues
      : [output as IssueOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : issues.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isSearch
      ? "Searching issues\u2026"
      : isList
        ? "Fetching issues\u2026"
        : "Fetching issue\u2026"
    : state.isError
      ? "Failed to fetch issues"
      : isSearch
        ? `Found ${totalCount} issue${totalCount !== 1 ? "s" : ""}`
        : isList
          ? `Listed ${issues.length} issue${issues.length !== 1 ? "s" : ""}`
          : issues.length > 0
            ? `${issues[0]!.identifier} ${issues[0]!.title}`
            : "Issue details";

  return (
    <IntegrationToolLayout
      provider="Linear"
      providerIcon={
        <IntegrationProviderIcon provider="linear" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={issues.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {issues.map((issue) => {
          const si = stateIcon(issue.stateType);
          return (
            <a
              key={issue.id}
              href={issue.url}
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
                  {issue.identifier} {issue.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-foreground/40">
                  <span>{issue.stateName}</span>
                  {issue.priorityLabel ? (
                    <span>{issue.priorityLabel}</span>
                  ) : null}
                  {issue.assigneeName ? (
                    <span>{issue.assigneeName}</span>
                  ) : null}
                  {issue.teamName ? <span>{issue.teamName}</span> : null}
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
          );
        })}
      </div>
    </IntegrationToolLayout>
  );
});
