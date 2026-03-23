"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName, getToolStateLabel } from "../../../../types";
import { IntegrationToolLayout } from "./integration-tool-layout";
import { getIntegrationToolInteractionState } from "./state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

function getProviderFromToolName(toolName: string) {
  if (toolName.startsWith("gmail_"))
    return { provider: "gmail", label: "Gmail" };
  if (toolName.startsWith("gcal_"))
    return { provider: "google_calendar", label: "Calendar" };
  if (toolName.startsWith("gdrive_"))
    return { provider: "google_drive", label: "Drive" };
  if (toolName.startsWith("gh_"))
    return { provider: "github", label: "GitHub" };
  if (toolName.startsWith("linear_"))
    return { provider: "linear", label: "Linear" };
  if (toolName.startsWith("notion_"))
    return { provider: "notion", label: "Notion" };
  if (toolName.startsWith("slack_"))
    return { provider: "slack", label: "Slack" };
  if (toolName.startsWith("airtable_"))
    return { provider: "airtable", label: "Airtable" };
  if (toolName.startsWith("pg_"))
    return { provider: "postgresql", label: "PostgreSQL" };
  if (toolName.startsWith("mysql_"))
    return { provider: "mysql", label: "MySQL" };
  if (toolName.startsWith("mongo_"))
    return { provider: "mongodb", label: "MongoDB" };
  if (toolName.startsWith("yfinance_"))
    return { provider: "yahoo_finance", label: "Yahoo Finance" };
  if (toolName.startsWith("arxiv_"))
    return { provider: "arxiv", label: "arXiv" };
  if (toolName.startsWith("pubmed_"))
    return { provider: "pubmed", label: "PubMed" };
  return { provider: "unknown", label: "Integration" };
}

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(
      /^(gmail_|gcal_|gdrive_|gh_|linear_|notion_|slack_|airtable_|pg_|mysql_|mongo_|yfinance_|arxiv_|pubmed_)/,
      "",
    )
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    if (value.every((v) => typeof v === "string" || typeof v === "number"))
      return value.join(", ");
    return `${value.length} item${value.length !== 1 ? "s" : ""}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "—";
    return entries
      .map(
        ([k, v]) =>
          `${humanizeKey(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
      )
      .join(", ");
  }
  return String(value);
}

function isSimpleObject(obj: unknown): obj is Record<string, unknown> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    !Array.isArray(obj) &&
    Object.values(obj as Record<string, unknown>).every(
      (v) =>
        v === null ||
        v === undefined ||
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean" ||
        (Array.isArray(v) &&
          v.every((i) => typeof i === "string" || typeof i === "number")),
    )
  );
}

function KeyValuePairs({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 text-xs">
          <span className="shrink-0 text-foreground/40 min-w-[72px]">
            {humanizeKey(key)}
          </span>
          <span className="text-foreground/70 break-all">
            {renderValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const IntegrationGenericTool = memo(function IntegrationGenericTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const { provider, label } = getProviderFromToolName(toolName);
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    setIsExpanded(state.needsApproval || state.isRunning);
  }, [part.toolCallId, state.isRunning, state.needsApproval]);

  const input = state.hasInput && "input" in part ? part.input : null;
  const output = state.hasOutput && "output" in part ? part.output : null;
  const summary = state.needsApproval
    ? `${label}: ${humanizeToolName(toolName)} — awaiting approval`
    : state.isDenied
      ? `${label}: ${humanizeToolName(toolName)} — denied`
      : state.isRunning
        ? `${label}: ${humanizeToolName(toolName)}…`
        : state.hasOutput
          ? `${label}: ${humanizeToolName(toolName)} — done`
          : state.isError
            ? `${label}: ${humanizeToolName(toolName)} — failed`
            : `${label}: ${humanizeToolName(toolName)} — ${getToolStateLabel(part.state)}`;

  const inputIsSimple = isSimpleObject(input);
  const outputIsSimple = isSimpleObject(output);

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
      errorText={state.isError ? state.errorText : undefined}
      provider={label}
      providerIcon={
        <IntegrationProviderIcon provider={provider} className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(input || output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-3">
        {input ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-right-linear" className="h-3 w-3" />
              <span>Input</span>
            </div>
            {inputIsSimple ? (
              <KeyValuePairs data={input as Record<string, unknown>} />
            ) : (
              <div className="space-y-1">
                {Object.entries(input as Record<string, unknown>).map(
                  ([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 text-foreground/40 min-w-[72px]">
                        {humanizeKey(key)}
                      </span>
                      <span className="text-foreground/70 break-all">
                        {renderValue(value)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ) : null}
        {output ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-foreground/50">
              <Icon icon="solar:arrow-left-linear" className="h-3 w-3" />
              <span>Output</span>
            </div>
            {outputIsSimple ? (
              <KeyValuePairs data={output as Record<string, unknown>} />
            ) : (
              <div className="space-y-1">
                {Object.entries(output as Record<string, unknown>).map(
                  ([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 text-foreground/40 min-w-[72px]">
                        {humanizeKey(key)}
                      </span>
                      <span className="text-foreground/70 break-all">
                        {renderValue(value)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </IntegrationToolLayout>
  );
});
