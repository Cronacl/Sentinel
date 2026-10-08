"use client";

import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { stringifyJson } from "../../../types";
import {
  getApprovalButtons,
  getExternalToolContent,
  getExternalToolMeta,
  type ExternalToolContent,
  type ExternalToolMeta,
} from "../../external-tool-meta";
import { buildPreviewUnifiedDiff, DiffView } from "../shared/diff-view";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";

// One renderer family for every external agent's tool calls (Cursor and the
// other ACP agents), chosen by the call's kind (read, edit, execute, …) from
// callProviderMetadata.sentinel rather than by guessing from the tool name.
// The agent's label comes from the instance ("Work Cursor"). Approvals show
// the agent's own options. Parts persisted before this metadata existed keep
// the name-based Cursor renderers (registry.ts).

const MAX_TEXT_LENGTH = 8_000;

const KIND_ICONS: Record<string, string> = {
  auth_link: "solar:login-2-linear",
  compaction: "solar:archive-minimalistic-linear",
  delete: "solar:trash-bin-minimalistic-linear",
  edit: "solar:pen-new-square-linear",
  execute: "solar:command-linear",
  fetch: "solar:global-linear",
  move: "solar:transfer-horizontal-linear",
  notice: "solar:info-circle-linear",
  other: "solar:widget-linear",
  read: "solar:document-text-linear",
  search: "solar:magnifer-linear",
  subagent: "solar:users-group-rounded-linear",
  switch_mode: "solar:refresh-linear",
  think: "solar:lightbulb-minimalistic-linear",
};

const KIND_NOUNS: Record<string, string> = {
  auth_link: "Sign-in",
  compaction: "Context compaction",
  delete: "Delete",
  edit: "Edit",
  execute: "Command",
  fetch: "Fetch",
  move: "Move",
  notice: "Notice",
  other: "Tool",
  read: "Read",
  search: "Search",
  subagent: "Subagent",
  switch_mode: "Mode switch",
  think: "Thinking",
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown, keys: string[]) {
  const source = record(value);
  for (const key of keys) {
    const field = source?.[key];
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }
  return null;
}

function truncate(value: string, length = 80) {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function capText(value: string) {
  return value.length > MAX_TEXT_LENGTH
    ? `${value.slice(0, MAX_TEXT_LENGTH)}\n…(truncated)`
    : value;
}

function isRunning(state: RendererProps["part"]["state"]) {
  return (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-responded"
  );
}

function isFailed(state: RendererProps["part"]["state"]) {
  return state === "output-error" || state === "output-denied";
}

function getApprovalId(part: RendererProps["part"]) {
  const approval = "approval" in part ? record(part.approval) : null;
  return typeof approval?.id === "string" ? approval.id : null;
}

function summaryText(
  part: RendererProps["part"],
  meta: ExternalToolMeta,
): ReactNode {
  const input = "input" in part ? part.input : undefined;
  if (meta.kind === "execute") {
    const command =
      readString(input, ["command", "cmd", "commandLine"]) ?? meta.title;
    return command ? (
      <span className="font-mono text-[12px]">$ {truncate(command)}</span>
    ) : (
      "Command"
    );
  }
  if (meta.kind === "notice") {
    const output = "output" in part ? part.output : undefined;
    return readString(output, ["title"]) ?? meta.title ?? "Notice";
  }
  const location = meta.locations[0];
  const title =
    meta.title ??
    (location ? `${KIND_NOUNS[meta.kind] ?? "Tool"} ${location.path}` : null) ??
    meta.rawName;
  return title ? truncate(title, 120) : (KIND_NOUNS[meta.kind] ?? "Tool");
}

function stateSuffix(part: RendererProps["part"]) {
  switch (part.state) {
    case "approval-requested":
      return " requires approval";
    case "output-denied":
      return " (denied)";
    case "output-error":
      return " (failed)";
    default:
      return "";
  }
}

function Locations({ meta }: { meta: ExternalToolMeta }) {
  if (meta.locations.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {meta.locations.slice(0, 12).map((location, index) => (
        <span
          className="max-w-full truncate rounded-md border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/60"
          key={`${location.path}:${location.line ?? ""}:${index}`}
          title={location.path}
        >
          {location.path.split("/").pop()}
          {location.line != null ? `:${location.line}` : ""}
        </span>
      ))}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <ScrollShadow className="max-h-[300px] overflow-x-auto">
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
        {capText(text)}
      </pre>
    </ScrollShadow>
  );
}

function Body({
  content,
  meta,
  part,
}: {
  content: ExternalToolContent;
  meta: ExternalToolMeta;
  part: RendererProps["part"];
}) {
  const output = "output" in part ? record(part.output) : null;
  const input = "input" in part ? part.input : undefined;
  const blocks: ReactNode[] = [];

  if (meta.kind === "auth_link") {
    const url = readString(input, ["url"]);
    const message = readString(input, ["message"]);
    if (url) {
      blocks.push(
        <div className="flex flex-col gap-1 text-[12px]" key="link">
          {message ? <p className="text-foreground/70">{message}</p> : null}
          <a
            className="break-all text-primary underline decoration-primary/30 hover:decoration-primary"
            href={url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {url}
          </a>
        </div>,
      );
    }
  }

  if (meta.kind === "notice") {
    const description = readString(output, ["description"]);
    if (description) blocks.push(<TextBlock key="notice" text={description} />);
  }

  for (const [index, diff] of (content.diffs ?? []).entries()) {
    blocks.push(
      <DiffView
        diff={buildPreviewUnifiedDiff({
          after: diff.newText,
          before: diff.oldText ?? "",
          path: diff.path,
        })}
        key={`diff-${diff.path}-${index}`}
        path={diff.path}
      />,
    );
  }

  for (const terminal of content.terminals ?? []) {
    if (terminal.output) {
      blocks.push(
        <TextBlock
          key={`term-${terminal.terminalId}`}
          text={terminal.output}
        />,
      );
    }
  }

  if (content.text) {
    blocks.push(<TextBlock key="text" text={content.text} />);
  }

  for (const [index, image] of (content.images ?? []).entries()) {
    blocks.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="max-h-64 rounded-md border border-border/30"
        key={`img-${index}`}
        src={image.url}
      />,
    );
  }

  if (blocks.length === 0 && content.rawOutput !== undefined) {
    blocks.push(
      <pre
        className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/50"
        key="raw"
      >
        {capText(stringifyJson(content.rawOutput))}
      </pre>,
    );
  }

  const hasLocations = meta.locations.length > 0;
  if (blocks.length === 0 && !hasLocations) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <Locations meta={meta} />
      {blocks}
    </div>
  );
}

function ApprovalActions({
  meta,
  onApprove,
  onApproveWithDecision,
  onDeny,
  part,
}: RendererProps & { meta: ExternalToolMeta }) {
  const approvalId = getApprovalId(part);
  if (part.state !== "approval-requested" || !approvalId) {
    return null;
  }
  const buttons = getApprovalButtons(meta.permissionOptions);

  if (buttons.length > 0 && onApproveWithDecision) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((button) => (
          <Button
            className="h-7 min-w-0 px-3 text-[11px]"
            key={button.optionId}
            onPress={() => onApproveWithDecision(approvalId, button.decision)}
            size="sm"
            variant={button.decision === "decline" ? "ghost" : "primary"}
          >
            {button.label}
          </Button>
        ))}
      </div>
    );
  }

  if (!onApprove || !onDeny) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        className="h-7 min-w-0 px-3 text-[11px]"
        onPress={() => onApprove(approvalId)}
        size="sm"
      >
        Approve
      </Button>
      <Button
        className="h-7 min-w-0 px-3 text-[11px]"
        onPress={() => onDeny(approvalId)}
        size="sm"
        variant="ghost"
      >
        Deny
      </Button>
    </div>
  );
}

export const ExternalAgentTool = memo(function ExternalAgentTool(
  props: RendererProps,
) {
  const { part } = props;
  const meta = useMemo(() => getExternalToolMeta(part), [part]);
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    autoExpand: part.state === "approval-requested",
    defaultExpanded: false,
    toolCallId: part.toolCallId,
  });

  if (!meta) {
    return null;
  }
  const content = getExternalToolContent(part, meta);
  const errorText =
    "errorText" in part && typeof part.errorText === "string"
      ? part.errorText
      : part.state === "output-denied" && "approval" in part
        ? (readString(part.approval, ["reason"]) ?? undefined)
        : undefined;
  const body = <Body content={content} meta={meta} part={part} />;
  const hasBody =
    Boolean(content.diffs?.length) ||
    Boolean(content.text) ||
    Boolean(content.terminals?.some((terminal) => terminal.output)) ||
    Boolean(content.images?.length) ||
    content.rawOutput !== undefined ||
    meta.locations.length > 0 ||
    meta.kind === "auth_link" ||
    meta.kind === "notice";

  return (
    <ToolLayout
      actions={
        part.state === "approval-requested" && getApprovalId(part) ? (
          <ApprovalActions {...props} meta={meta} />
        ) : undefined
      }
      errorText={isFailed(part.state) ? errorText : undefined}
      isError={isFailed(part.state)}
      isExpandable={hasBody || Boolean(errorText)}
      isExpanded={isExpanded || part.state === "approval-requested"}
      isRunning={isRunning(part.state)}
      onExpandedChange={setIsExpanded}
      summary={
        <>
          <Icon
            className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            icon={KIND_ICONS[meta.kind] ?? KIND_ICONS.other!}
          />
          <span className="text-foreground/50">{meta.agentLabel} </span>
          {summaryText(part, meta)}
          <span className="text-foreground/40">{stateSuffix(part)}</span>
        </>
      }
    >
      {hasBody ? body : null}
    </ToolLayout>
  );
});
