"use client";

import { memo, useState } from "react";
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
  parentType: string;
  archived: boolean;
  properties: Record<string, string>;
  createdTime: string;
  lastEditedTime: string;
};

type DatabaseOutput = {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  archived: boolean;
  propertyNames: string[];
  createdTime: string;
};

type SearchOutput = {
  results: (PageOutput | DatabaseOutput)[];
  totalCount: number;
};

function isDatabase(item: PageOutput | DatabaseOutput): item is DatabaseOutput {
  return "propertyNames" in item;
}

function NotionIcon({ icon, fallback }: { icon: string | null; fallback: string }) {
  if (!icon) return <span>{fallback}</span>;
  if (icon.startsWith("http")) {
    return <img src={icon} alt="" className="h-4 w-4 object-contain" />;
  }
  return <span>{icon}</span>;
}

function formatSummaryIcon(icon: string | null): string {
  if (!icon) return "\u{1F4C4}";
  if (icon.startsWith("http")) return "\u{1F4C4}";
  return icon;
}

export const NotionPageDetailTool = memo(function NotionPageDetailTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isSearch = toolName === "notion_search";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as PageOutput | SearchOutput)
      : null;

  const items: (PageOutput | DatabaseOutput)[] = output
    ? "results" in output
      ? output.results
      : [output as PageOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : items.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isSearch
      ? "Searching Notion\u2026"
      : "Fetching page\u2026"
    : state.isError
      ? "Failed to fetch"
      : isSearch
        ? `Found ${totalCount} result${totalCount !== 1 ? "s" : ""}`
        : items.length > 0
          ? `${formatSummaryIcon(items[0]!.icon)} ${items[0]!.title}`
          : "Page details";

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
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              <NotionIcon icon={item.icon} fallback={isDatabase(item) ? "\u{1F5C3}" : "\u{1F4C4}"} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-foreground">
                {item.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                {isDatabase(item) ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                      <Icon icon="solar:database-linear" className="h-3 w-3" />
                      Database
                    </span>
                    <span className="inline-flex items-center rounded bg-foreground/4 px-1.5 py-0.5">
                      {item.propertyNames.length} properties
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                      <Icon icon="solar:document-text-linear" className="h-3 w-3" />
                      Page
                    </span>
                    {item.parentType ? (
                      <span className="inline-flex items-center rounded bg-foreground/4 px-1.5 py-0.5">
                        in {item.parentType}
                      </span>
                    ) : null}
                  </>
                )}
                {item.archived ? (
                  <span className="inline-flex items-center rounded bg-warning/10 px-1.5 py-0.5 text-warning">Archived</span>
                ) : null}
              </div>
              {!isDatabase(item) && Object.keys(item.properties).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(item.properties)
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
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
