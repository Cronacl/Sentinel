"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type CycleOutput = {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  issueCountCompleted: number;
  issueCountTotal: number;
  scopeCompleted: number;
  scopeTotal: number;
};

type CycleListOutput = { cycles: CycleOutput[] };
type CurrentCycleOutput = { cycle: CycleOutput | null };

export const LinearCycleTool = memo(function LinearCycleTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_cycles";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as CycleOutput | CycleListOutput | CurrentCycleOutput)
      : null;

  const cycles: CycleOutput[] = (() => {
    if (!output) return [];
    if ("cycles" in output) return output.cycles;
    if ("cycle" in output) return output.cycle ? [output.cycle] : [];
    return [output as CycleOutput];
  })();

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Fetching cycles\u2026"
      : "Fetching current cycle\u2026"
    : state.isError
      ? "Failed to fetch cycles"
      : isList
        ? `Listed ${cycles.length} cycle${cycles.length !== 1 ? "s" : ""}`
        : cycles.length > 0
          ? `Cycle ${cycles[0]!.number}${cycles[0]!.name ? ` \u2014 ${cycles[0]!.name}` : ""}`
          : "No active cycle";

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
      isExpandable={cycles.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {cycles.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2.5 rounded-lg p-2"
          >
            <Icon
              icon="solar:restart-linear"
              className="h-4 w-4 shrink-0 text-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                Cycle {c.number}
                {c.name ? ` \u2014 ${c.name}` : ""}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-foreground/40">
                <span>
                  {new Date(c.startsAt).toLocaleDateString()} &ndash;{" "}
                  {new Date(c.endsAt).toLocaleDateString()}
                </span>
                <span>{Math.round(c.progress * 100)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
