"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type UserOutput = {
  id: string;
  email?: string;
};

export const AirtableUserTool = memo(function AirtableUserTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part ? (part.output as UserOutput) : null;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? "Fetching user\u2026"
    : state.isError
      ? "Failed to fetch user"
      : output?.email
        ? output.email
        : output?.id
          ? `User ${output.id}`
          : "User identity";

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
      isExpandable={output !== null}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {output ? (
        <div className="flex items-start gap-2.5 p-2">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground/50">
            <Icon icon="solar:user-linear" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            {output.email ? (
              <p className="text-[12.5px] font-medium text-foreground">
                {output.email}
              </p>
            ) : null}
            <p className="font-mono text-[10.5px] text-foreground/40">
              {output.id}
            </p>
          </div>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
