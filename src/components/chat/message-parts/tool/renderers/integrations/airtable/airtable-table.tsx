"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type FieldOutput = {
  id: string;
  name: string;
  type: string;
  description?: string;
};

type ViewOutput = {
  id: string;
  name: string;
  type: string;
};

type TableOutput = {
  id: string;
  name: string;
  description?: string;
  fields: FieldOutput[];
  views: ViewOutput[];
  primaryFieldId?: string;
};

type ListOutput = { tables: TableOutput[]; totalCount: number };

const FIELD_TYPE_ICONS: Record<string, string> = {
  singleLineText: "solar:text-linear",
  multilineText: "solar:document-text-linear",
  richText: "solar:document-text-linear",
  number: "solar:hashtag-linear",
  singleSelect: "solar:list-down-linear",
  multipleSelects: "solar:checklist-minimalistic-linear",
  date: "solar:calendar-linear",
  dateTime: "solar:calendar-linear",
  checkbox: "solar:check-square-linear",
  email: "solar:letter-linear",
  url: "solar:link-linear",
  phoneNumber: "solar:phone-linear",
  currency: "solar:dollar-minimalistic-linear",
  percent: "solar:chart-linear",
  rating: "solar:star-linear",
  autoNumber: "solar:sort-by-alphabet-linear",
  barcode: "solar:qr-code-linear",
  formula: "solar:calculator-linear",
  rollup: "solar:layers-linear",
  lookup: "solar:magnifer-linear",
  multipleRecordLinks: "solar:link-round-linear",
  multipleAttachments: "solar:paperclip-linear",
  createdTime: "solar:clock-circle-linear",
  lastModifiedTime: "solar:clock-circle-linear",
  createdBy: "solar:user-linear",
  lastModifiedBy: "solar:user-linear",
  button: "solar:cursor-linear",
  duration: "solar:stopwatch-linear",
  externalSyncSource: "solar:refresh-linear",
};

export const AirtableTableTool = memo(function AirtableTableTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "airtable_list_tables";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as TableOutput | ListOutput)
      : null;

  const tables: TableOutput[] = output
    ? "tables" in output
      ? output.tables
      : [output as TableOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : tables.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Listing tables\u2026"
      : "Fetching table\u2026"
    : state.isError
      ? "Failed to fetch"
      : isList
        ? `${totalCount} table${totalCount !== 1 ? "s" : ""}`
        : tables.length > 0
          ? tables[0]!.name
          : "Table details";

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
      isExpandable={tables.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-2 p-1">
        {tables.map((table) => (
          <div
            key={table.id}
            className="rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:widget-2-linear"
                className="h-4 w-4 text-foreground/50"
              />
              <p className="text-[12.5px] font-medium text-foreground">
                {table.name}
              </p>
              <span className="text-[10.5px] text-foreground/40">
                {table.fields.length} field{table.fields.length !== 1 ? "s" : ""}
                {" \u00B7 "}
                {table.views.length} view{table.views.length !== 1 ? "s" : ""}
              </span>
            </div>
            {table.description ? (
              <p className="mt-0.5 ml-6 text-[11px] text-foreground/50 line-clamp-1">
                {table.description}
              </p>
            ) : null}
            {!isList && table.fields.length > 0 ? (
              <div className="mt-2 ml-6 space-y-0.5">
                {table.fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <Icon
                      icon={FIELD_TYPE_ICONS[f.type] ?? "solar:widget-linear"}
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
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
