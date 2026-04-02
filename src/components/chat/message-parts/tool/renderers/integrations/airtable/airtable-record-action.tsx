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

type RecordOutput = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

type RecordsResult = { records: RecordOutput[]; totalCount: number };
type DeleteResult = { deletedIds: string[]; totalCount: number };

const ACTION_LABELS: Record<string, string> = {
  airtable_create_records: "Create Records",
  airtable_update_records: "Update Records",
  airtable_delete_records: "Delete Records",
};

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const AirtableRecordActionTool = memo(function AirtableRecordActionTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const actionLabel = ACTION_LABELS[toolName] ?? "Record Action";
  const isDelete = toolName === "airtable_delete_records";

  const input =
    state.hasInput && "input" in part
      ? (part.input as Record<string, unknown>)
      : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as RecordsResult | DeleteResult)
      : null;

  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const resultCount = output
    ? "records" in output
      ? output.totalCount
      : "deletedIds" in output
        ? output.totalCount
        : 0
    : 0;

  const summary = state.needsApproval
    ? `${actionLabel} \u2014 awaiting approval`
    : state.isRunning
      ? `${actionLabel}\u2026`
      : state.isError
        ? `${actionLabel} \u2014 failed`
        : state.isDenied
          ? `${actionLabel} \u2014 denied`
          : isDelete
            ? `Deleted ${resultCount} record${resultCount !== 1 ? "s" : ""}`
            : `${toolName === "airtable_create_records" ? "Created" : "Updated"} ${resultCount} record${resultCount !== 1 ? "s" : ""}`;

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
        {!state.needsApproval && output && "records" in output ? (
          <div className="space-y-1 p-1">
            {output.records.map((rec) => {
              const fieldEntries = Object.entries(rec.fields).slice(0, 4);
              return (
                <div
                  key={rec.id}
                  className="rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/5"
                >
                  <div className="flex items-center gap-1.5 text-[10.5px] text-foreground/40">
                    <Icon icon="solar:document-linear" className="h-3 w-3" />
                    <span className="font-mono">{rec.id}</span>
                  </div>
                  {fieldEntries.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {fieldEntries.map(([key, val]) => (
                        <div
                          key={key}
                          className="flex items-start gap-2 text-[11px]"
                        >
                          <span className="shrink-0 text-foreground/40 min-w-[60px]">
                            {key}
                          </span>
                          <span className="text-foreground/70 truncate max-w-[200px]">
                            {formatFieldValue(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {!state.needsApproval && output && "deletedIds" in output ? (
          <div className="p-2">
            <div className="flex items-center gap-1.5 text-[11px] text-foreground/60">
              <Icon
                icon="solar:trash-bin-trash-linear"
                className="h-3.5 w-3.5 text-danger/60"
              />
              <span>
                {output.totalCount} record{output.totalCount !== 1 ? "s" : ""}{" "}
                deleted
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              {output.deletedIds.map((id) => (
                <p
                  key={id}
                  className="font-mono text-[10px] text-foreground/35"
                >
                  {id}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
