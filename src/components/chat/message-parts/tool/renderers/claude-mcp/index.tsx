"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  ClaudeJsonBlock,
  ClaudeTextBlock,
  renderClaudeJson,
} from "../claude-content";
import {
  extractTextFromContent,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type ClaudeMcpResource = {
  description?: string;
  mimeType?: string;
  name: string;
  server: string;
  uri: string;
};

type ClaudeReadMcpResourceOutput = {
  contents: Array<{
    mimeType?: string;
    text?: string;
    uri: string;
  }>;
};

function isListMcpResourcesOutput(
  value: unknown,
): value is ClaudeMcpResource[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).uri === "string" &&
        typeof (item as Record<string, unknown>).server === "string",
    )
  );
}

function isReadMcpResourceOutput(
  value: unknown,
): value is ClaudeReadMcpResourceOutput {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as Record<string, unknown>).contents)
  );
}

function getMcpLabel(toolName: string) {
  switch (toolName) {
    case "claude_listmcpresources":
      return "MCP resources";
    case "claude_readmcpresource":
      return "MCP resource";
    case "claude_subscribemcpresource":
      return "MCP resource";
    case "claude_subscribepolling":
      return "polling feed";
    case "claude_unsubscribemcpresource":
      return "MCP resource";
    case "claude_unsubscribepolling":
      return "polling feed";
    default:
      return "MCP resource";
  }
}

function getMcpAction(toolName: string) {
  switch (toolName) {
    case "claude_listmcpresources":
      return {
        completed: "Listed",
        denied: "MCP resource listing denied",
        pending: "List",
        running: "Listing",
      };
    case "claude_readmcpresource":
      return {
        completed: "Read",
        denied: "MCP resource read denied",
        pending: "Read",
        running: "Reading",
      };
    case "claude_subscribemcpresource":
    case "claude_subscribepolling":
      return {
        completed: "Subscribed to",
        denied: "Subscription denied",
        pending: "Subscribe to",
        running: "Subscribing to",
      };
    case "claude_unsubscribemcpresource":
    case "claude_unsubscribepolling":
      return {
        completed: "Unsubscribed from",
        denied: "Unsubscribe denied",
        pending: "Unsubscribe from",
        running: "Unsubscribing from",
      };
    default:
      return {
        completed: "Loaded",
        denied: "MCP request denied",
        pending: "Load",
        running: "Loading",
      };
  }
}

function buildSummary(
  part: RendererProps["part"],
  toolName: string,
  input: Record<string, unknown> | null,
  resources: ClaudeMcpResource[] | null,
): ReactNode {
  const label = getMcpLabel(toolName);
  const action = getMcpAction(toolName);
  const uri =
    input && typeof input.uri === "string"
      ? input.uri
      : input && typeof input.server === "string"
        ? input.server
        : null;

  if (part.state === "output-denied") {
    return <>{action.denied}</>;
  }

  if (part.state === "output-error") {
    return <>Failed {label}</>;
  }

  if (part.state === "approval-requested") {
    return (
      <>
        {action.pending} {label}
      </>
    );
  }

  if (part.state === "output-available" && resources) {
    return (
      <>
        {action.completed}{" "}
        <span className="font-mono text-[12px]">
          {resources.length} resource{resources.length !== 1 ? "s" : ""}
        </span>
      </>
    );
  }

  if (part.state === "output-available") {
    return (
      <>
        {action.completed} {label}
      </>
    );
  }

  if (
    part.state === "approval-responded" ||
    part.state === "input-available" ||
    part.state === "input-streaming"
  ) {
    return (
      <>
        {action.running} {label}
      </>
    );
  }

  return uri ? (
    <>
      {label}: <span className="font-mono text-[12px]">{uri}</span>
    </>
  ) : (
    label
  );
}

function ResourceList({ resources }: { resources: ClaudeMcpResource[] }) {
  return (
    <div className="flex flex-col gap-1">
      {resources.map((resource) => (
        <div
          key={`${resource.server}:${resource.uri}`}
          className="rounded-lg border border-border/40 bg-background/40 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-foreground/80">
              {resource.name}
            </span>
            <span className="shrink-0 text-[10px] text-foreground/40">
              {resource.server}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-foreground/40">
            {resource.uri}
          </p>
          {resource.description ? (
            <p className="mt-1 text-[11px] text-foreground/60">
              {resource.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const ClaudeMcpResourceTool = memo(function ClaudeMcpResourceTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  if (part.type !== "dynamic-tool") {
    return null;
  }

  const input = unwrapClaudeInput<Record<string, unknown>>(part.input);
  const output = part.output;
  const resources = isListMcpResourcesOutput(output) ? output : null;
  const readOutput = isReadMcpResourceOutput(output) ? output : null;
  const outputText =
    readOutput?.contents
      .map((item) => item.text)
      .filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
      .join("\n\n") || extractTextFromContent(output);
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });
  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested" || isRunning,
  );

  return (
    <ToolLayout
      actions={actions}
      isError={isError}
      isExpandable={
        Boolean(input) || Boolean(resources?.length) || Boolean(output)
      }
      isExpanded={isExpanded}
      isRunning={isRunning}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon="solar:database-linear"
          />
          {buildSummary(part, part.toolName, input, resources)}
        </>
      }
    >
      <div className="space-y-3">
        {input ? <ClaudeJsonBlock label="Input" value={input} /> : null}
        {resources?.length ? <ResourceList resources={resources} /> : null}
        {!resources?.length && output !== undefined ? (
          outputText ? (
            <ClaudeTextBlock label="Output" text={outputText} />
          ) : (
            <ClaudeTextBlock label="Output" text={renderClaudeJson(output)} />
          )
        ) : null}
      </div>
    </ToolLayout>
  );
});
