"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type TeamOutput = {
  id: string;
  name: string;
  key: string;
  description: string;
  issueCount: number;
  memberCount: number;
  color: string;
  icon: string | null;
  createdAt: string;
};

type TeamListOutput = { teams: TeamOutput[] };

export const LinearTeamTool = memo(function LinearTeamTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_teams";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as TeamOutput | TeamListOutput)
      : null;

  const teams: TeamOutput[] = output
    ? "teams" in output
      ? output.teams
      : [output as TeamOutput]
    : [];

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Fetching teams\u2026"
      : "Fetching team\u2026"
    : state.isError
      ? "Failed to fetch teams"
      : isList
        ? `Listed ${teams.length} team${teams.length !== 1 ? "s" : ""}`
        : teams.length > 0
          ? `${teams[0]!.key} \u2014 ${teams[0]!.name}`
          : "Team details";

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
      isExpandable={teams.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 rounded-lg p-2"
          >
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: t.color || "#5e6ad2" }}
            >
              {t.key}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                {t.name}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-foreground/40">
                <span className="flex items-center gap-0.5">
                  <Icon icon="solar:users-group-rounded-linear" className="h-3 w-3" />
                  {t.memberCount}
                </span>
                <span>{t.issueCount} issues</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
