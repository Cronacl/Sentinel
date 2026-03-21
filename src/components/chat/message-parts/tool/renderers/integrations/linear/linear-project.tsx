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

type ProjectOutput = {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  progress: number;
  targetDate: string | null;
  startDate: string | null;
  leadName: string;
  memberCount: number;
  issueCount: number;
  completedIssueCount: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectListOutput = { projects: ProjectOutput[] };

const MUTATE_TOOLS = new Set([
  "linear_create_project",
  "linear_update_project",
]);

export const LinearProjectTool = memo(function LinearProjectTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_projects";
  const isMutate = MUTATE_TOOLS.has(toolName);
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as ProjectOutput | ProjectListOutput)
      : null;

  const input =
    "input" in part ? (part.input as Record<string, unknown>) : null;

  const projects: ProjectOutput[] = output
    ? "projects" in output
      ? output.projects
      : [output as ProjectOutput]
    : [];

  const hasContent = Boolean(
    (state.needsApproval && input) || projects.length > 0,
  );

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const summary = (() => {
    if (state.isError) return "Failed";
    if (state.isRunning)
      return isMutate
        ? toolName === "linear_create_project"
          ? "Creating project\u2026"
          : "Updating project\u2026"
        : isList
          ? "Fetching projects\u2026"
          : "Fetching project\u2026";
    if (state.needsApproval)
      return `${toolName === "linear_create_project" ? "Create" : "Update"} project \u2014 awaiting approval`;
    if (isList)
      return `Listed ${projects.length} project${projects.length !== 1 ? "s" : ""}`;
    if (projects.length > 0)
      return isMutate
        ? `${toolName === "linear_create_project" ? "Created" : "Updated"} ${projects[0]!.name}`
        : projects[0]!.name;
    return "Project";
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
      provider="Linear"
      providerIcon={
        <IntegrationProviderIcon provider="linear" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={hasContent}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {state.needsApproval && input ? (
        <div className="space-y-1 text-xs text-foreground/70">
          {input.name ? (
            <p className="font-medium text-foreground">{String(input.name)}</p>
          ) : null}
          {input.description ? (
            <p className="line-clamp-3 text-[11px] text-foreground/50">
              {String(input.description).slice(0, 200)}
            </p>
          ) : null}
        </div>
      ) : projects.length > 0 ? (
        <div className="space-y-1 p-1">
          {projects.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-foreground/5"
            >
              <Icon
                icon="solar:folder-with-files-linear"
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-foreground">
                  {p.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-foreground/40">
                  <span>{p.state}</span>
                  <span>{Math.round(p.progress * 100)}%</span>
                  {p.leadName ? <span>{p.leadName}</span> : null}
                  <span>{p.issueCount} issues</span>
                  {p.targetDate ? (
                    <span>
                      Due {new Date(p.targetDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
