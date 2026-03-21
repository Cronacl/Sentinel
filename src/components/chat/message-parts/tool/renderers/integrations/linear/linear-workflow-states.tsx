"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type WorkflowStateOutput = {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
  teamName: string;
};

type StatesListOutput = { states: WorkflowStateOutput[] };

function typeIcon(type: string) {
  switch (type) {
    case "completed":
      return "solar:check-circle-linear";
    case "cancelled":
      return "solar:close-circle-linear";
    case "started":
      return "solar:play-circle-linear";
    case "unstarted":
      return "solar:record-circle-linear";
    case "backlog":
      return "solar:archive-linear";
    case "triage":
      return "solar:inbox-linear";
    default:
      return "solar:record-circle-linear";
  }
}

export const LinearWorkflowStatesTool = memo(function LinearWorkflowStatesTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as StatesListOutput)
      : null;

  const states = output?.states ?? [];
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? "Fetching workflow states\u2026"
    : state.isError
      ? "Failed to fetch workflow states"
      : `Listed ${states.length} workflow state${states.length !== 1 ? "s" : ""}`;

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
      isExpandable={states.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {states.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          >
            <Icon
              icon={typeIcon(s.type)}
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: s.color }}
            />
            <span className="flex-1 text-[11px] text-foreground/70">
              {s.name}
            </span>
            <span className="shrink-0 text-[10px] text-foreground/30">
              {s.type}
            </span>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
