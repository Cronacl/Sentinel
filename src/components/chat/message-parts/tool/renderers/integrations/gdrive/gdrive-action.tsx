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

const ACTION_META: Record<
  string,
  {
    label: string;
    pastTense: string;
    gerund: string;
    icon: string;
    iconClass: string;
    inputLabel?: (input: Record<string, unknown>) => string;
  }
> = {
  gdrive_move: {
    label: "Move",
    pastTense: "File moved",
    gerund: "Moving",
    icon: "solar:move-to-folder-linear",
    iconClass: "text-primary",
  },
  gdrive_rename: {
    label: "Rename",
    pastTense: "File renamed",
    gerund: "Renaming",
    icon: "solar:pen-new-round-linear",
    iconClass: "text-primary",
    inputLabel: (input) =>
      input.newName ? `Rename to "${input.newName}"` : "Rename file",
  },
  gdrive_trash: {
    label: "Trash",
    pastTense: "File moved to trash",
    gerund: "Trashing",
    icon: "solar:trash-bin-2-linear",
    iconClass: "text-danger",
  },
  gdrive_share: {
    label: "Share",
    pastTense: "File shared",
    gerund: "Sharing",
    icon: "solar:share-linear",
    iconClass: "text-primary",
    inputLabel: (input) =>
      input.email
        ? `Share with ${input.email} (${input.role ?? "reader"})`
        : "Share file",
  },
};

export const GDriveActionTool = memo(function GDriveActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const meta = ACTION_META[toolName] ?? {
    label: "Action",
    pastTense: "Done",
    gerund: "Processing",
    icon: "solar:check-circle-linear",
    iconClass: "text-foreground/50",
  };
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const input =
    "input" in part ? (part.input as Record<string, unknown>) : null;

  const summary = state.needsApproval
    ? `${meta.label} file — awaiting approval`
    : state.isRunning
      ? `${meta.gerund} file…`
      : state.hasOutput
        ? meta.pastTense
        : state.isError
          ? `Failed to ${meta.label.toLowerCase()} file`
          : `${meta.gerund} file…`;

  const detailLabel = meta.inputLabel && input ? meta.inputLabel(input) : null;

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
      provider="Google Drive"
      providerIcon={
        <IntegrationProviderIcon provider="google_drive" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(input)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        state.hasOutput ? (
          <span className="flex items-center gap-1">
            <Icon icon={meta.icon} className={`h-3 w-3 ${meta.iconClass}`} />
            {meta.pastTense}
          </span>
        ) : undefined
      }
    >
      {state.needsApproval && input ? (
        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <Icon icon={meta.icon} className={`h-4 w-4 ${meta.iconClass}`} />
          <span>
            {detailLabel ?? (
              <>
                {meta.label} file{" "}
                <code className="rounded bg-foreground/5 px-1 py-0.5 text-[10px]">
                  {String(input.fileId ?? "")}
                </code>
              </>
            )}
          </span>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
