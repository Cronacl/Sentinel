"use client";

import { memo, useEffect, useState } from "react";
import { Chip, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../../renderer";
import type { ToolPart } from "../../../../../types";
import { getToolName } from "../../../../../types";
import { IntegrationToolLayout } from "../../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { getIntegrationToolInteractionState } from "../../shared/state";

type ListItem = {
  name: string;
  [key: string]: unknown;
};

type ListOutput = {
  databases?: ListItem[];
  schemas?: ListItem[];
  tables?: ListItem[];
  collections?: ListItem[];
};

function resolveListItems(output: ListOutput): ListItem[] {
  return (
    output.databases ?? output.schemas ?? output.tables ?? output.collections ?? []
  );
}

function resolveListLabel(toolName: string): string {
  if (toolName.includes("database")) return "databases";
  if (toolName.includes("schema")) return "schemas";
  if (toolName.includes("table")) return "tables";
  if (toolName.includes("collection")) return "collections";
  return "items";
}

function resolveItemIcon(toolName: string): string {
  if (toolName.includes("database")) return "solar:database-linear";
  if (toolName.includes("schema")) return "solar:layers-linear";
  if (toolName.includes("table")) return "solar:document-text-linear";
  if (toolName.includes("collection"))
    return "solar:documents-minimalistic-linear";
  return "solar:list-linear";
}

export function createDbListTool(
  provider: string,
  providerLabel: string,
) {
  return memo(function DbListTool({ part, onApprove, onDeny }: RendererProps) {
    const toolName = getToolName(part as ToolPart);
    const state = getIntegrationToolInteractionState(part as ToolPart, {
      onApprove,
      onDeny,
    });
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
      if (state.hasOutput) setIsExpanded(true);
    }, [state.hasOutput]);

    const output =
      state.hasOutput && "output" in part ? (part.output as ListOutput) : null;
    const items = output ? resolveListItems(output) : [];
    const listLabel = resolveListLabel(toolName);
    const itemIcon = resolveItemIcon(toolName);

    const summary = state.isRunning
      ? `${providerLabel}: Listing ${listLabel}...`
      : state.isError
        ? `${providerLabel}: Failed to list ${listLabel}`
        : output
          ? `${providerLabel}: ${items.length} ${listLabel}`
          : `${providerLabel}: List ${listLabel}`;

    return (
      <IntegrationToolLayout
        provider={providerLabel}
        providerIcon={
          <IntegrationProviderIcon provider={provider} className="h-4 w-4" />
        }
        summary={summary}
        isRunning={state.isRunning}
        isError={state.isError}
        isExpandable={items.length > 0}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        errorText={state.isError ? state.errorText : undefined}
      >
        {items.length > 0 ? (
          <ScrollShadow className="max-h-48">
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/70 hover:bg-foreground/5"
                >
                  <Icon
                    icon={itemIcon}
                    className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.name}
                  </span>
                  {"rowEstimate" in item &&
                  typeof item.rowEstimate === "number" ? (
                    <Chip size="sm" variant="soft" className="h-5 text-[10px]">
                      ~{item.rowEstimate.toLocaleString()} rows
                    </Chip>
                  ) : null}
                  {"sizeOnDisk" in item &&
                  typeof item.sizeOnDisk === "number" ? (
                    <Chip size="sm" variant="soft" className="h-5 text-[10px]">
                      {(item.sizeOnDisk / 1024 / 1024).toFixed(1)} MB
                    </Chip>
                  ) : null}
                  {"schema" in item && typeof item.schema === "string" ? (
                    <span className="text-[10px] text-foreground/30">
                      {item.schema}
                    </span>
                  ) : null}
                  {"type" in item && typeof item.type === "string" ? (
                    <span className="text-[10px] text-foreground/30">
                      {item.type}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollShadow>
        ) : null}
      </IntegrationToolLayout>
    );
  });
}
