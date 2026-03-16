"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
  actor: string;
};

type ListRunsOutput = { runs: WorkflowRun[]; totalCount: number };
type RunLogsOutput = { url: string };
type RerunOutput = { success: boolean };

function conclusionIcon(conclusion: string | null, status: string) {
  if (status === "in_progress" || status === "queued")
    return { icon: "solar:refresh-linear", cls: "text-warning animate-spin" };
  switch (conclusion) {
    case "success":
      return { icon: "solar:check-circle-linear", cls: "text-success" };
    case "failure":
      return { icon: "solar:close-circle-linear", cls: "text-danger" };
    case "cancelled":
      return { icon: "solar:forbidden-circle-linear", cls: "text-foreground/40" };
    default:
      return { icon: "solar:question-circle-linear", cls: "text-foreground/40" };
  }
}

export const GHActionsTool = memo(function GHActionsTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const output =
    state.hasOutput && "output" in part
      ? (part.output as ListRunsOutput | RunLogsOutput | RerunOutput)
      : null;

  const runs: WorkflowRun[] =
    output && "runs" in output ? output.runs : [];
  const logUrl = output && "url" in output ? output.url : null;
  const rerunSuccess = output && "success" in output ? output.success : null;

  const summary = (() => {
    if (state.isError) return "Failed";
    if (state.isRunning) {
      if (toolName === "gh_list_runs") return "Fetching workflow runs\u2026";
      if (toolName === "gh_get_run_logs") return "Fetching run logs\u2026";
      return "Re-running workflow\u2026";
    }
    if (state.needsApproval) return "Re-run workflow \u2014 awaiting approval";
    if (toolName === "gh_list_runs")
      return `Listed ${runs.length} workflow run${runs.length !== 1 ? "s" : ""}`;
    if (toolName === "gh_get_run_logs" && logUrl) return "Run logs ready";
    if (toolName === "gh_rerun_workflow" && rerunSuccess)
      return "Workflow re-run triggered";
    return "Actions";
  })();

  return (
    <IntegrationToolLayout
      actions={
        state.showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onApprove?.(state.approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onDeny?.(state.approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      errorText={state.isError ? state.errorText : undefined}
      provider="GitHub"
      providerIcon={
        <IntegrationProviderIcon provider="github" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={runs.length > 0 || Boolean(logUrl)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {runs.length > 0 ? (
        <div className="space-y-1 p-1">
          {runs.map((run) => {
            const ci = conclusionIcon(run.conclusion, run.status);
            return (
              <a
                key={run.id}
                href={run.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/5"
              >
                <Icon
                  icon={ci.icon}
                  className={`h-3.5 w-3.5 shrink-0 ${ci.cls}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-foreground">
                    {run.name} #{run.runNumber}
                  </p>
                  <p className="text-[10px] text-foreground/40">
                    {run.branch} &middot; {run.event} &middot; {run.actor}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-foreground/30">
                  {run.conclusion ?? run.status}
                </span>
              </a>
            );
          })}
        </div>
      ) : logUrl ? (
        <div className="p-2">
          <a
            href={logUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] text-primary hover:underline"
          >
            <Icon icon="solar:download-linear" className="h-3.5 w-3.5" />
            Download logs
          </a>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
