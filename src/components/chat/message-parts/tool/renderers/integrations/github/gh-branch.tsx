"use client";

import { Button } from "@heroui/react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type BranchOutput = {
  name: string;
  sha: string;
  protected: boolean;
};

type ListBranchesOutput = { branches: BranchOutput[] };

export const GHBranchTool = memo(function GHBranchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "gh_list_branches";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as BranchOutput | ListBranchesOutput)
      : null;
  const input =
    "input" in part ? (part.input as Record<string, unknown>) : null;

  const branches: BranchOutput[] = output
    ? "branches" in output
      ? output.branches
      : [output as BranchOutput]
    : [];

  const summary = state.isRunning
    ? isList
      ? "Fetching branches\u2026"
      : "Creating branch\u2026"
    : state.isError
      ? isList
        ? "Failed to list branches"
        : "Failed to create branch"
      : state.needsApproval
        ? `Create branch \u201c${input?.branchName ?? ""}\u201d \u2014 awaiting approval`
        : isList
          ? `Listed ${branches.length} branch${branches.length !== 1 ? "es" : ""}`
          : branches.length > 0
            ? `Created branch \u201c${branches[0]!.name}\u201d`
            : "Branch";

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
      isExpandable={branches.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {branches.map((b) => (
          <div
            key={b.name}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          >
            <Icon
              icon="solar:branch-linear"
              className="h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <code className="flex-1 truncate text-[11px] text-foreground/70">
              {b.name}
            </code>
            {b.protected ? (
              <Icon
                icon="solar:lock-linear"
                className="h-3 w-3 shrink-0 text-warning"
              />
            ) : null}
            <code className="shrink-0 text-[10px] text-foreground/30">
              {b.sha.slice(0, 7)}
            </code>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
