"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type Label = {
  id: string;
  name: string;
  type: string;
};

type ListLabelsOutput = {
  labels: Label[];
};

function humanizeSystemLabel(name: string): string {
  return name
    .replace(/^CATEGORY_/, "")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export const GmailListLabelsTool = memo(function GmailListLabelsTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as ListLabelsOutput) : null;

  const userLabels = output?.labels?.filter((l) => l.type === "user") ?? [];
  const systemLabels = output?.labels?.filter((l) => l.type !== "user") ?? [];

  const summary = isRunning
    ? "Loading Gmail labels…"
    : hasOutput && output
      ? `${output.labels.length} label${output.labels.length !== 1 ? "s" : ""} found`
      : isError
        ? "Failed to load labels"
        : "Loading Gmail labels…";

  return (
    <IntegrationToolLayout
      provider="Gmail"
      providerIcon={
        <IntegrationProviderIcon provider="gmail" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(output?.labels?.length)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {output?.labels?.length ? (
        <div className="space-y-3">
          {userLabels.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                <Icon icon="solar:tag-linear" className="h-3 w-3" />
                <span>Custom Labels</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {userLabels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {systemLabels.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                <Icon icon="solar:inbox-linear" className="h-3 w-3" />
                <span>System Labels</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {systemLabels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 px-2.5 py-0.5 text-[11px] text-foreground/50"
                  >
                    {humanizeSystemLabel(label.name)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
