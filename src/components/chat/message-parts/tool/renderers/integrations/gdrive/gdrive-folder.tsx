"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type FolderInput = {
  name: string;
  parentFolderId?: string;
};

type FolderOutput = {
  folder: {
    id: string;
    name: string;
    webViewLink: string;
  };
};

export const GDriveFolderTool = memo(function GDriveFolderTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    setIsExpanded(state.needsApproval);
  }, [part.toolCallId, state.needsApproval]);

  const input = "input" in part ? (part.input as FolderInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as FolderOutput)
      : null;

  const folderName = output?.folder.name ?? input?.name ?? "";

  const summary = state.needsApproval
    ? `Create folder "${folderName}" — awaiting approval`
    : state.isRunning
      ? `Creating folder "${folderName}"…`
      : state.hasOutput && output
        ? `Folder created: "${output.folder.name}"`
        : state.isError
          ? "Failed to create folder"
          : `Creating folder "${folderName}"…`;

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
      isExpandable={Boolean(input || output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output?.folder.webViewLink ? (
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href={output.folder.webViewLink}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon
              icon="solar:square-arrow-right-up-linear"
              className="h-3 w-3"
            />
            Open in Drive
          </a>
        ) : undefined
      }
    >
      {input ? (
        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <Icon
            icon="solar:folder-add-linear"
            className="h-3.5 w-3.5 shrink-0 text-foreground/40"
          />
          <span className="text-foreground">{input.name}</span>
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
