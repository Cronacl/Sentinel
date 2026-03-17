"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type DatabaseOutput = {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: string | null;
  propertyNames: string[];
};

type PageEntry = {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  properties: Record<string, string>;
};

type ListOutput = { databases: DatabaseOutput[] };
type QueryOutput = { entries: PageEntry[]; hasMore: boolean };

function NotionIcon({ icon, fallback }: { icon: string | null; fallback: string }) {
  if (!icon) return <span>{fallback}</span>;
  if (icon.startsWith("http")) {
    return <img src={icon} alt="" className="h-4 w-4 object-contain" />;
  }
  return <span>{icon}</span>;
}

export const NotionDatabaseTool = memo(function NotionDatabaseTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "notion_list_databases";

  const output =
    state.hasOutput && "output" in part ? (part.output as ListOutput | QueryOutput) : null;

  const [isExpanded, setIsExpanded] = useState(false);

  let items: (DatabaseOutput | PageEntry)[] = [];
  if (output && "databases" in output) items = output.databases;
  if (output && "entries" in output) items = output.entries;

  const summary = state.isRunning
    ? isList
      ? "Listing databases\u2026"
      : "Querying database\u2026"
    : state.isError
      ? "Failed"
      : isList
        ? `Listed ${items.length} database${items.length !== 1 ? "s" : ""}`
        : `${items.length} entr${items.length !== 1 ? "ies" : "y"}${output && "hasMore" in output && output.hasMore ? " (more available)" : ""}`;

  return (
    <IntegrationToolLayout
      provider="Notion"
      providerIcon={
        <IntegrationProviderIcon provider="notion" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={items.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-0.5 p-1">
        {items.map((item) => {
          const isDb = "propertyNames" in item;
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                <NotionIcon icon={item.icon} fallback={isDb ? "\u{1F5C3}" : "\u{1F4C4}"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-foreground">
                  {item.title}
                </p>
                {isDb ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                    <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                      <Icon icon="solar:database-linear" className="h-3 w-3" />
                      {(item as DatabaseOutput).propertyNames.length} properties
                    </span>
                    {(item as DatabaseOutput).description ? (
                      <span className="text-foreground/35">
                        {(item as DatabaseOutput).description.length > 60
                          ? `${(item as DatabaseOutput).description.slice(0, 60)}\u2026`
                          : (item as DatabaseOutput).description}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries((item as PageEntry).properties)
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
                )}
              </div>
            </a>
          );
        })}
      </div>
    </IntegrationToolLayout>
  );
});
