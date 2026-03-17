"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type BaseOutput = {
  id: string;
  name: string;
  permissionLevel: string;
};

type ListOutput = { bases: BaseOutput[]; totalCount: number };

export const AirtableBaseTool = memo(function AirtableBaseTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part ? (part.output as ListOutput) : null;

  const bases = output?.bases ?? [];
  const totalCount = output?.totalCount ?? bases.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? "Listing bases\u2026"
    : state.isError
      ? "Failed to list bases"
      : `${totalCount} base${totalCount !== 1 ? "s" : ""}`;

  return (
    <IntegrationToolLayout
      provider="Airtable"
      providerIcon={
        <IntegrationProviderIcon provider="airtable" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={bases.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-0.5 p-1">
        {bases.map((base) => (
          <div
            key={base.id}
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground/50">
              <Icon icon="solar:database-linear" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-foreground">
                {base.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                <span className="inline-flex items-center rounded bg-foreground/4 px-1.5 py-0.5">
                  {base.permissionLevel}
                </span>
                <span className="font-mono text-foreground/30">{base.id}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
