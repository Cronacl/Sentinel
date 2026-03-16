"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type BlockOutput = {
  id: string;
  type: string;
  hasChildren: boolean;
  text: string;
};

type BlocksOutput = { blocks: BlockOutput[] };

const BLOCK_ICONS: Record<string, string> = {
  paragraph: "solar:text-linear",
  heading_1: "solar:text-bold-linear",
  heading_2: "solar:text-bold-linear",
  heading_3: "solar:text-bold-linear",
  bulleted_list_item: "solar:list-linear",
  numbered_list_item: "solar:list-1-linear",
  to_do: "solar:check-square-linear",
  toggle: "solar:alt-arrow-right-linear",
  code: "solar:code-linear",
  quote: "solar:quote-up-square-linear",
  callout: "solar:info-circle-linear",
  divider: "solar:minus-circle-linear",
  image: "solar:gallery-linear",
  video: "solar:video-frame-linear",
  file: "solar:file-linear",
  bookmark: "solar:bookmark-linear",
  table: "solar:widget-4-linear",
  child_page: "solar:document-text-linear",
  child_database: "solar:database-linear",
};

export const NotionBlocksTool = memo(function NotionBlocksTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isAppend = toolName === "notion_append_blocks";

  const input = state.hasInput && "input" in part ? (part.input as Record<string, unknown>) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as BlocksOutput) : null;

  const blocks = output?.blocks ?? [];

  const [isExpanded, setIsExpanded] = useState(
    isAppend ? state.needsApproval : false,
  );

  useEffect(() => {
    if (isAppend && state.needsApproval) setIsExpanded(true);
  }, [isAppend, state.needsApproval]);

  const summary = state.needsApproval
    ? `Notion: Append Blocks \u2014 awaiting approval`
    : state.isRunning
      ? isAppend
        ? "Appending blocks\u2026"
        : "Fetching blocks\u2026"
      : state.isError
        ? "Failed"
        : state.isDenied
          ? "Append Blocks \u2014 denied"
          : `${blocks.length} block${blocks.length !== 1 ? "s" : ""}`;

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
      provider="Notion"
      providerIcon={
        <IntegrationProviderIcon provider="notion" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={Boolean(
        blocks.length > 0 || (state.needsApproval && input),
      )}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-3">
        {state.needsApproval && input ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-right-linear" className="h-3 w-3" />
              <span>Blocks to append</span>
            </div>
            {Array.isArray(input.children) ? (
              <div className="space-y-1">
                {(input.children as Array<{ type: string; content: string }>).map(
                  (child, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md p-1.5 text-xs"
                    >
                      <Icon
                        icon={BLOCK_ICONS[child.type] ?? "solar:document-text-linear"}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40"
                      />
                      <span className="text-foreground/70">
                        {child.content.length > 80
                          ? `${child.content.slice(0, 80)}\u2026`
                          : child.content}
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {blocks.length > 0 ? (
          <div className="space-y-0.5 p-1">
            {blocks.map((block) => (
              <div
                key={block.id}
                className="flex items-start gap-2 rounded-md p-1.5"
              >
                <Icon
                  icon={BLOCK_ICONS[block.type] ?? "solar:document-text-linear"}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-foreground/70">
                    {block.text
                      ? block.text.length > 120
                        ? `${block.text.slice(0, 120)}\u2026`
                        : block.text
                      : block.type.replace(/_/g, " ")}
                  </p>
                  {block.hasChildren ? (
                    <span className="text-[9px] text-foreground/30">
                      has children
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
