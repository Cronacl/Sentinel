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

type PageOutput = {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  properties: Record<string, string>;
};

const ACTION_LABELS: Record<string, string> = {
  notion_create_database_entry: "Create Entry",
  notion_update_database_entry: "Update Entry",
};

export const NotionDatabaseActionTool = memo(function NotionDatabaseActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const actionLabel = ACTION_LABELS[toolName] ?? "Database Action";

  const input = state.hasInput && "input" in part ? (part.input as Record<string, unknown>) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as PageOutput) : null;

  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [state.needsApproval]);

  const formatIcon = (icon: string | null) => {
    if (!icon) return "\u{1F4C4}";
    if (icon.startsWith("http")) return "\u{1F4C4}";
    return icon;
  };

  const summary = state.needsApproval
    ? `Notion: ${actionLabel} \u2014 awaiting approval`
    : state.isRunning
      ? `${actionLabel}\u2026`
      : state.isError
        ? `${actionLabel} \u2014 failed`
        : state.isDenied
          ? `${actionLabel} \u2014 denied`
          : output
            ? `${formatIcon(output.icon)} ${output.title}`
            : actionLabel;

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
        (state.needsApproval && input) || (state.hasOutput && output),
      )}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-3">
        {state.needsApproval && input ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-right-linear" className="h-3 w-3" />
              <span>Input</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(input)
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="shrink-0 text-foreground/40 min-w-[72px] capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span className="text-foreground/70 break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        {state.hasOutput && output ? (
          <a
            href={output.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-sm">
              {output.icon?.startsWith("http") ? (
                <img src={output.icon} alt="" className="h-4 w-4 object-contain" />
              ) : (
                output.icon ?? "\u{1F4C4}"
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-foreground">
                {output.title}
              </p>
              {Object.keys(output.properties).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(output.properties)
                    .slice(0, 4)
                    .map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5 text-[10.5px] text-foreground/50"
                      >
                        <span className="text-foreground/30">{key}:</span>
                        <span>{val.length > 30 ? `${val.slice(0, 30)}\u2026` : val}</span>
                      </span>
                    ))}
                </div>
              ) : null}
            </div>
          </a>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
