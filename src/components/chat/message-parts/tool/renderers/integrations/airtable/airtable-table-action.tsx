"use client";

import { Button } from "@heroui/react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type FieldOutput = {
  id: string;
  name: string;
  type: string;
  description?: string;
};

type TableOutput = {
  id: string;
  name: string;
  description?: string;
  fields: FieldOutput[];
  views: Array<{ id: string; name: string; type: string }>;
};

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const ACTION_LABELS: Record<string, string> = {
  airtable_create_table: "Create Table",
  airtable_create_field: "Create Field",
  airtable_update_field: "Update Field",
};

export const AirtableTableActionTool = memo(function AirtableTableActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const actionLabel = ACTION_LABELS[toolName] ?? "Table Action";
  const isCreateTable = toolName === "airtable_create_table";

  const input =
    state.hasInput && "input" in part
      ? (part.input as Record<string, unknown>)
      : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as TableOutput | FieldOutput)
      : null;

  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const summary = state.needsApproval
    ? `${actionLabel} \u2014 awaiting approval`
    : state.isRunning
      ? `${actionLabel}\u2026`
      : state.isError
        ? `${actionLabel} \u2014 failed`
        : state.isDenied
          ? `${actionLabel} \u2014 denied`
          : output && "fields" in output
            ? `Created table "${output.name}"`
            : output && "type" in output
              ? `${toolName === "airtable_create_field" ? "Created" : "Updated"} field "${output.name}"`
              : `${actionLabel} \u2014 done`;

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
      provider="Airtable"
      providerIcon={
        <IntegrationProviderIcon provider="airtable" className="h-4 w-4" />
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
              {Object.entries(input).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 text-foreground/40 min-w-[72px]">
                    {humanizeKey(key)}
                  </span>
                  <span className="text-foreground/70 break-all">
                    {typeof val === "object"
                      ? JSON.stringify(val, null, 2)
                      : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!state.needsApproval &&
        output &&
        isCreateTable &&
        "fields" in output ? (
          <div className="rounded-lg p-2">
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:widget-2-linear"
                className="h-4 w-4 text-foreground/50"
              />
              <p className="text-[12.5px] font-medium text-foreground">
                {output.name}
              </p>
            </div>
            {"fields" in output && Array.isArray(output.fields) ? (
              <div className="mt-2 ml-6 space-y-0.5">
                {(output as TableOutput).fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <Icon
                      icon="solar:widget-linear"
                      className="h-3 w-3 shrink-0 text-foreground/40"
                    />
                    <span className="text-foreground/70">{f.name}</span>
                    <span className="rounded bg-foreground/4 px-1.5 py-0.5 text-[10px] text-foreground/40">
                      {f.type}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {!state.needsApproval &&
        output &&
        !isCreateTable &&
        "type" in output ? (
          <div className="rounded-lg p-2">
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:widget-linear"
                className="h-4 w-4 text-foreground/50"
              />
              <p className="text-[12.5px] font-medium text-foreground">
                {output.name}
              </p>
              <span className="rounded bg-foreground/4 px-1.5 py-0.5 text-[10px] text-foreground/40">
                {(output as FieldOutput).type}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
