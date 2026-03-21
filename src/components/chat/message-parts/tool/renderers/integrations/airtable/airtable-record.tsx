"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type RecordOutput = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

type ListOutput = { records: RecordOutput[]; totalCount: number };

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const AirtableRecordTool = memo(function AirtableRecordTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "airtable_list_records";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as RecordOutput | ListOutput)
      : null;

  const records: RecordOutput[] = output
    ? "records" in output
      ? output.records
      : [output as RecordOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : records.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Listing records\u2026"
      : "Fetching record\u2026"
    : state.isError
      ? "Failed to fetch"
      : isList
        ? `${totalCount} record${totalCount !== 1 ? "s" : ""}`
        : records.length > 0
          ? `Record ${records[0]!.id}`
          : "Record details";

  const fieldNames =
    records.length > 0 ? Object.keys(records[0]!.fields).slice(0, 6) : [];

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
      isExpandable={records.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {isList && records.length > 0 ? (
        <div className="overflow-x-auto p-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-foreground/10">
                {fieldNames.map((name) => (
                  <th
                    key={name}
                    className="px-2 py-1.5 text-left font-medium text-foreground/50"
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr
                  key={rec.id}
                  className="border-b border-foreground/5 last:border-none hover:bg-foreground/3"
                >
                  {fieldNames.map((name) => (
                    <td
                      key={name}
                      className="px-2 py-1.5 text-foreground/70 max-w-[180px] truncate"
                    >
                      {formatFieldValue(rec.fields[name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : records.length === 1 ? (
        <div className="space-y-1 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-foreground/40">
            <Icon icon="solar:document-linear" className="h-3 w-3" />
            <span className="font-mono">{records[0]!.id}</span>
          </div>
          {Object.entries(records[0]!.fields).map(([key, val]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 text-foreground/40 min-w-[80px]">
                {key}
              </span>
              <span className="text-foreground/70 break-all">
                {formatFieldValue(val)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
