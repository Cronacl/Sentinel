"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type LabelOutput = {
  id: string;
  name: string;
  color: string;
  description: string;
  isGroup: boolean;
  parentName: string | null;
};

type LabelListOutput = { labels: LabelOutput[] };

export const LinearLabelTool = memo(function LinearLabelTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "linear_list_labels";
  const isCreate = toolName === "linear_create_label";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as LabelOutput | LabelListOutput)
      : null;

  const input = "input" in part
    ? (part.input as Record<string, unknown>)
    : null;

  const labels: LabelOutput[] = output
    ? "labels" in output
      ? output.labels
      : [output as LabelOutput]
    : [];

  const hasContent = Boolean(
    (state.needsApproval && input) || labels.length > 0,
  );

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const summary = state.isRunning
    ? isCreate
      ? "Creating label\u2026"
      : "Fetching labels\u2026"
    : state.isError
      ? "Failed"
      : state.needsApproval
        ? "Create label \u2014 awaiting approval"
        : isList
          ? `Listed ${labels.length} label${labels.length !== 1 ? "s" : ""}`
          : labels.length > 0
            ? isCreate
              ? `Created label \u201c${labels[0]!.name}\u201d`
              : labels[0]!.name
            : "Labels";

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
        </div>
      ) : labels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 p-1">
          {labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-foreground/70"
              style={{ backgroundColor: `${l.color}20` }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
              {l.parentName ? (
                <span className="text-foreground/30">{l.parentName}</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
