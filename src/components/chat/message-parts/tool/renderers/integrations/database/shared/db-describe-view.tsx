"use client";

import { memo } from "react";
import { Chip, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../../renderer";
import type { ToolPart } from "../../../../../types";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { getIntegrationToolInteractionState } from "../../shared/state";

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
};

type Index = {
  name: string;
  columns: string[];
  unique: boolean;
};

type ForeignKey = {
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

type DescribeOutput = {
  columns: Column[];
  indexes: Index[];
  foreignKeys: ForeignKey[];
};

export function createDbDescribeTool(provider: string, providerLabel: string) {
  return memo(function DbDescribeTool({
    part,
    onApprove,
    onDeny,
  }: RendererProps) {
    const state = getIntegrationToolInteractionState(part as ToolPart, {
      onApprove,
      onDeny,
    });
    const [isExpanded, setIsExpanded] = useToolExpansionState({
      toolCallId: part.toolCallId,
      defaultExpanded: false,
    });

    const input =
      "input" in part
        ? (part.input as { table?: string; schema?: string })
        : null;
    const output =
      state.hasOutput && "output" in part
        ? (part.output as DescribeOutput)
        : null;

    const tableName = input?.table ?? "table";
    const summary = state.isRunning
      ? `${providerLabel}: Describing ${tableName}...`
      : state.isError
        ? `${providerLabel}: Failed to describe ${tableName}`
        : output
          ? `${providerLabel}: ${tableName} — ${output.columns.length} columns`
          : `${providerLabel}: Describe ${tableName}`;

    return (
      <IntegrationToolLayout
        provider={providerLabel}
        providerIcon={
          <IntegrationProviderIcon provider={provider} className="h-4 w-4" />
        }
        summary={summary}
        isRunning={state.isRunning}
        isError={state.isError}
        isExpandable={Boolean(output)}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        errorText={state.isError ? state.errorText : undefined}
      >
        {output ? (
          <ScrollShadow className="max-h-72">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                  <Icon icon="solar:list-check-linear" className="h-3 w-3" />
                  Columns
                </div>
                <div className="flex flex-col gap-0.5">
                  {output.columns.map((col) => (
                    <div
                      key={col.name}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-foreground/5"
                    >
                      {col.isPrimaryKey ? (
                        <Icon
                          icon="solar:key-linear"
                          className="h-3 w-3 shrink-0 text-warning"
                        />
                      ) : (
                        <div className="h-3 w-3 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground/70">
                        {col.name}
                      </span>
                      <Chip
                        size="sm"
                        variant="soft"
                        className="h-5 text-[10px] font-mono"
                      >
                        {col.type}
                      </Chip>
                      {col.nullable ? (
                        <span className="text-[10px] text-foreground/30">
                          nullable
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {output.indexes.length > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                    <Icon
                      icon="solar:sort-vertical-linear"
                      className="h-3 w-3"
                    />
                    Indexes
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {output.indexes.map((idx) => (
                      <div
                        key={idx.name}
                        className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/60"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                          {idx.name}
                        </span>
                        <span className="text-[10px] text-foreground/30">
                          (
                          {Array.isArray(idx.columns)
                            ? idx.columns.join(", ")
                            : String(idx.columns ?? "")}
                          )
                        </span>
                        {idx.unique ? (
                          <Chip
                            size="sm"
                            color="success"
                            variant="soft"
                            className="h-5 text-[10px]"
                          >
                            unique
                          </Chip>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {output.foreignKeys.length > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                    <Icon
                      icon="solar:link-minimalistic-linear"
                      className="h-3 w-3"
                    />
                    Foreign Keys
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {output.foreignKeys.map((fk, i) => (
                      <div
                        key={`${fk.column}-${i}`}
                        className="px-2 py-1 text-xs text-foreground/60"
                      >
                        <span className="font-mono text-[11px]">
                          {fk.column}
                        </span>
                        <span className="text-foreground/30"> → </span>
                        <span className="font-mono text-[11px]">
                          {fk.referencesTable}.{fk.referencesColumn}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollShadow>
        ) : null}
      </IntegrationToolLayout>
    );
  });
}
