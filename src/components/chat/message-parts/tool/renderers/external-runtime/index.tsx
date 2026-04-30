"use client";

import type { ReactNode } from "react";
import { Button, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";
import { memo, useMemo } from "react";

import type { RendererProps } from "../../renderer";
import { getToolName, stringifyJson } from "../../../types";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";

type ExternalEngine = "Cursor" | "OpenCode";
type ExternalToolKind =
  | "agent"
  | "file"
  | "image"
  | "mcp"
  | "permission"
  | "plan"
  | "runtime"
  | "search"
  | "shell"
  | "todo"
  | "user-input"
  | "webfetch"
  | "websearch";

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getStringField(value: unknown, keys: string[]) {
  const record = getRecord(value);
  if (!record) return null;
  for (const key of keys) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return null;
}

function getNumberField(value: unknown, keys: string[]) {
  const record = getRecord(value);
  if (!record) return null;
  for (const key of keys) {
    const field = record[key];
    if (typeof field === "number") return field;
  }
  return null;
}

function getArrayField(value: unknown, key: string) {
  const record = getRecord(value);
  if (!record) return null;
  const field = record[key];
  return Array.isArray(field) ? field : null;
}

function truncate(value: string, length = 72) {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

function formatToolName(toolName: string) {
  return toolName
    .replace(/^(cursor|opencode)_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getApprovalId(part: RendererProps["part"]) {
  if (
    !("approval" in part) ||
    !part.approval ||
    typeof part.approval !== "object" ||
    !("id" in part.approval) ||
    typeof part.approval.id !== "string"
  ) {
    return null;
  }
  return part.approval.id;
}

function isRunningState(state: RendererProps["part"]["state"]) {
  return (
    state === "approval-responded" ||
    state === "input-available" ||
    state === "input-streaming"
  );
}

function isErrorState(state: RendererProps["part"]["state"]) {
  return state === "output-denied" || state === "output-error";
}

function isFinished(state: RendererProps["part"]["state"]) {
  return (
    state === "output-available" ||
    state === "output-denied" ||
    state === "output-error"
  );
}

const MAX_TEXT_LENGTH = 8000;

function extractTextContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = getRecord(value);
  if (!record) return null;
  for (const key of [
    "stdout",
    "stderr",
    "output",
    "content",
    "text",
    "message",
    "result",
    "digest",
    "tail",
  ]) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return null;
}

function parseXmlContent(text: string): string | null {
  const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);
  if (contentMatch?.[1]) return contentMatch[1].trim();
  return null;
}

function parseXmlPath(text: string): string | null {
  const pathMatch = text.match(/<path>([\s\S]*?)<\/path>/);
  if (pathMatch?.[1]) return pathMatch[1].trim();
  return null;
}

function parseXmlType(text: string): string | null {
  const typeMatch = text.match(/<type>([\s\S]*?)<\/type>/);
  if (typeMatch?.[1]) return typeMatch[1].trim();
  return null;
}

function parseXmlEntries(text: string): string[] | null {
  const entriesMatch = text.match(/<entries>([\s\S]*?)<\/entries>/);
  if (entriesMatch?.[1]) {
    const entries = entriesMatch[1]
      .trim()
      .split("\n")
      .map((e) => e.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : null;
  }
  return null;
}

function smartExtractText(value: unknown): string | null {
  const raw = extractTextContent(value);
  if (!raw) return null;

  const xmlContent = parseXmlContent(raw);
  if (xmlContent) return xmlContent;

  return raw;
}

function capText(value: string): string {
  return value.length > MAX_TEXT_LENGTH
    ? `${value.slice(0, MAX_TEXT_LENGTH)}\n\u2026(truncated)`
    : value;
}

function stripLineNumbers(text: string): string {
  return text.replace(/^\s*\d+[:|]\s?/gm, "");
}

function parseLinksFromOutput(
  value: unknown,
): Array<{ title: string; url: string }> {
  const text = extractTextContent(value);
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s"',)\]>]+/g;
  const links: Array<{ title: string; url: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    links.push({ title: getHostname(match[0]), url: match[0] });
  }
  return links;
}

function getSummaryIcon(kind: ExternalToolKind): string | null {
  switch (kind) {
    case "websearch":
      return "solar:magnifer-linear";
    case "webfetch":
      return "solar:global-linear";
    case "agent":
      return "solar:users-group-rounded-linear";
    case "image":
      return "solar:gallery-linear";
    case "mcp":
      return "solar:plug-circle-linear";
    case "todo":
      return "solar:checklist-linear";
    default:
      return null;
  }
}

function getSummary(input: {
  engine: ExternalEngine;
  kind: ExternalToolKind;
  part: RendererProps["part"];
  toolName: string;
}): ReactNode {
  const { engine, kind, part, toolName } = input;
  const rawInput = "input" in part ? part.input : undefined;
  const rawOutput = "output" in part ? part.output : undefined;
  const label = formatToolName(toolName);

  if (kind === "shell") {
    const command = getStringField(rawInput, [
      "command",
      "cmd",
      "fullCommandText",
      "description",
      "intention",
    ]);
    const commandLabel = command ? (
      <span className="font-mono text-[12px]">$ {truncate(command)}</span>
    ) : (
      "command"
    );
    if (part.state === "output-denied") return <>Command denied</>;
    if (part.state === "output-error")
      return <>Command failed {commandLabel}</>;
    if (part.state === "output-available") return <>Ran {commandLabel}</>;
    if (part.state === "approval-requested") return <>Run {commandLabel}</>;
    return <>Running {commandLabel}</>;
  }

  if (kind === "file") {
    const path = getStringField(rawInput, [
      "path",
      "filePath",
      "file_path",
      "target",
    ]);
    const rawText = extractTextContent(rawOutput);
    const xmlPath = rawText ? parseXmlPath(rawText) : null;
    const shownPath = xmlPath ?? path;
    const fileLabel = shownPath ? (
      <span className="font-mono text-[12px]">{truncate(shownPath)}</span>
    ) : (
      "file"
    );
    const isRead = /read|view|open|list_dir|ls/.test(toolName);
    const verb = isRead ? "Read" : "Modified";

    if (part.state === "output-denied") return <>File action denied</>;
    if (part.state === "output-error") return <>Failed to read {fileLabel}</>;
    if (part.state === "output-available")
      return (
        <>
          {verb} {fileLabel}
        </>
      );
    return <>Reading {fileLabel}</>;
  }

  if (kind === "search") {
    const query = getStringField(rawInput, [
      "pattern",
      "query",
      "glob_pattern",
      "glob",
      "path",
      "term",
    ]);
    const queryLabel = query ? (
      <span className="font-mono text-[12px]">{truncate(query)}</span>
    ) : (
      "workspace"
    );
    if (part.state === "output-error") return <>Search failed</>;
    if (part.state === "output-available") return <>Searched {queryLabel}</>;
    return <>Searching {queryLabel}</>;
  }

  if (kind === "websearch") {
    const query = getStringField(rawInput, ["query", "search_term", "q"]);
    const queryLabel = query ? `\u201c${truncate(query, 60)}\u201d` : "the web";
    if (part.state === "output-denied") return <>Search denied</>;
    if (part.state === "output-error") return <>Search failed</>;
    if (part.state === "output-available") {
      const numResults = getNumberField(rawOutput, [
        "numResults",
        "resultCount",
        "result_count",
        "count",
      ]);
      if (numResults != null) {
        return (
          <>
            Searched{" "}
            <span className="text-[12px]">
              {numResults} source{numResults !== 1 ? "s" : ""}
            </span>{" "}
            for {queryLabel}
          </>
        );
      }
      return <>Searched for {queryLabel}</>;
    }
    if (isRunningState(part.state)) return <>Searching for {queryLabel}</>;
    return <>Search for {queryLabel}</>;
  }

  if (kind === "webfetch") {
    const url = getStringField(rawInput, ["url", "href", "target"]);
    const hostname = url ? getHostname(url) : null;
    if (part.state === "output-denied")
      return hostname ? <>Fetch denied {hostname}</> : <>Fetch denied</>;
    if (part.state === "output-error")
      return hostname ? <>Failed to fetch {hostname}</> : <>Fetch failed</>;
    if (part.state === "output-available") {
      return hostname ? (
        <>
          Fetched{" "}
          <a
            href={url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/30 hover:decoration-primary"
          >
            {hostname}
          </a>
        </>
      ) : (
        <>Fetched web content</>
      );
    }
    if (part.state === "approval-requested")
      return hostname ? <>Fetch {hostname}</> : <>Fetch web content</>;
    return hostname ? <>Fetching {hostname}</> : <>Fetching web content</>;
  }

  if (kind === "todo") {
    const items = getArrayField(rawInput, "todos");
    const count = items?.length;
    if (part.state === "output-error") return <>Todo update failed</>;
    if (part.state === "output-available") {
      return count != null ? (
        <>
          Updated{" "}
          <span className="text-[12px]">
            {count} todo{count !== 1 ? "s" : ""}
          </span>
        </>
      ) : (
        <>Updated todos</>
      );
    }
    return <>Updating todos</>;
  }

  if (kind === "agent") {
    const desc = getStringField(rawInput, [
      "description",
      "prompt",
      "task",
      "message",
    ]);
    if (part.state === "output-denied") return <>Agent denied</>;
    if (part.state === "output-error") return <>Agent failed</>;
    if (part.state === "output-available")
      return desc ? (
        <>
          Ran agent{" "}
          <span className="text-foreground/40">{truncate(desc, 60)}</span>
        </>
      ) : (
        <>Ran sub-agent</>
      );
    return desc ? (
      <>
        Running agent{" "}
        <span className="text-foreground/40">{truncate(desc, 60)}</span>
      </>
    ) : (
      <>Running sub-agent</>
    );
  }

  if (kind === "mcp") {
    const mcpToolName = getStringField(rawInput, [
      "toolName",
      "tool_name",
      "name",
    ]);
    const server = getStringField(rawInput, ["server", "serverName"]);
    const mcpLabel = mcpToolName
      ? server
        ? `${mcpToolName} (${server})`
        : mcpToolName
      : "MCP tool";
    if (part.state === "output-denied") return <>MCP call denied</>;
    if (part.state === "output-error") return <>MCP call failed: {mcpLabel}</>;
    if (part.state === "output-available") return <>Called {mcpLabel}</>;
    return <>Calling {mcpLabel}</>;
  }

  if (kind === "image") {
    const desc = getStringField(rawInput, ["description", "prompt", "text"]);
    const descLabel = desc ? truncate(desc, 50) : null;
    if (part.state === "output-error") return <>Image generation failed</>;
    if (part.state === "output-available")
      return descLabel ? (
        <>
          Generated image{" "}
          <span className="text-foreground/40">{descLabel}</span>
        </>
      ) : (
        <>Generated image</>
      );
    return descLabel ? (
      <>
        Generating image <span className="text-foreground/40">{descLabel}</span>
      </>
    ) : (
      <>Generating image</>
    );
  }

  if (kind === "plan") {
    if (part.state === "output-error") return <>Plan update failed</>;
    return <>Updated plan</>;
  }

  if (kind === "user-input") {
    const prompt = getStringField(rawInput, ["prompt", "question", "message"]);
    return (
      <>
        {engine} needs input
        {prompt ? (
          <span className="text-foreground/40">: {truncate(prompt, 90)}</span>
        ) : null}
      </>
    );
  }

  if (kind === "permission") {
    return <>{engine} permission request</>;
  }

  if (part.state === "output-denied") return <>{label} denied</>;
  if (part.state === "output-error") return <>{label} failed</>;
  return (
    <>
      {engine} {label}
    </>
  );
}

function FileReadBody({ output }: { output: unknown }) {
  const raw = extractTextContent(output);
  if (!raw) return null;

  const xmlContent = parseXmlContent(raw);
  const xmlType = parseXmlType(raw);
  const xmlEntries = parseXmlEntries(raw);

  if (xmlType === "directory" && xmlEntries) {
    return (
      <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
        {xmlEntries.join("\n")}
      </ScrollShadow>
    );
  }

  const content = xmlContent ?? raw;
  const cleaned = stripLineNumbers(content);
  const display = capText(cleaned || content);

  return (
    <ScrollShadow className="max-h-[300px] overflow-x-auto">
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
        {display}
      </pre>
    </ScrollShadow>
  );
}

function ShellBody({ input, output }: { input: unknown; output: unknown }) {
  const command = getStringField(input, ["command", "cmd", "fullCommandText"]);
  const text = smartExtractText(output);
  const parts: string[] = [];
  if (command) parts.push(`$ ${command}`);
  if (text?.trim()) parts.push(text.trimEnd());
  else if (output && !text) parts.push("(no output)");

  if (parts.length === 0) return null;

  const allLines = parts.join("\n").split("\n");

  return (
    <ScrollShadow className="max-h-[200px] overflow-x-auto">
      <div className="min-w-0 font-mono text-[11px] leading-[18px]">
        {allLines.map((line, idx) => (
          <div
            key={idx}
            className="whitespace-pre-wrap pr-3"
            style={{ overflowWrap: "anywhere" }}
          >
            <span
              className={
                idx === 0 && command
                  ? "text-foreground/50"
                  : "text-foreground/70"
              }
            >
              {line}
            </span>
          </div>
        ))}
      </div>
    </ScrollShadow>
  );
}

function SearchResultBody({ output }: { output: unknown }) {
  const raw = extractTextContent(output);
  if (!raw?.trim()) return null;

  const display = capText(raw);
  return (
    <ScrollShadow className="max-h-[300px] overflow-x-auto">
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
        {display}
      </pre>
    </ScrollShadow>
  );
}

function WebSearchBody({ output }: { output: unknown }) {
  const links = parseLinksFromOutput(output);
  const text = extractTextContent(output);

  if (links.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        {links.slice(0, 10).map((link, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px]">
            <Icon
              icon="solar:link-minimalistic-2-linear"
              className="mt-0.5 h-3 w-3 shrink-0 text-foreground/30"
            />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 text-primary underline decoration-primary/30 hover:decoration-primary"
            >
              {link.title}
            </a>
          </div>
        ))}
      </div>
    );
  }

  if (text?.trim()) {
    return (
      <ScrollShadow className="max-h-[300px] overflow-x-auto">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
          {capText(text)}
        </pre>
      </ScrollShadow>
    );
  }

  return <FallbackOutputBlock value={output} />;
}

function TodoBody({ input }: { input: unknown }) {
  const items = getArrayField(input, "todos");
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, 20).map((item: unknown, i: number) => {
        const record = getRecord(item);
        const content = getStringField(item, ["content", "text", "title"]);
        const status = getStringField(item, ["status", "state"]);
        if (!content) return null;
        const isDone = status === "completed" || status === "done";
        const isCancelled = status === "cancelled";

        return (
          <div
            key={record?.id ? String(record.id) : i}
            className="flex items-start gap-2 text-[12px]"
          >
            <span className="mt-px shrink-0 text-[10px]">
              {isDone ? "\u2713" : isCancelled ? "\u2715" : "\u2022"}
            </span>
            <span
              className={
                isDone || isCancelled
                  ? "text-foreground/40 line-through"
                  : "text-foreground/70"
              }
            >
              {content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FallbackOutputBlock({ value }: { value: unknown }) {
  const text = extractTextContent(value);
  if (text?.trim()) {
    return (
      <ScrollShadow className="max-h-[300px] overflow-x-auto">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
          {capText(text)}
        </pre>
      </ScrollShadow>
    );
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/50 wrap-break-word">
      {stringifyJson(value)}
    </pre>
  );
}

function buildExternalBody(input: {
  hasInput: boolean;
  hasOutput: boolean;
  kind: ExternalToolKind;
  partInput: unknown;
  partOutput: unknown;
}): ReactNode {
  const { hasInput, hasOutput, kind, partInput, partOutput } = input;

  if (kind === "file") {
    if (hasOutput) return <FileReadBody output={partOutput} />;
    return null;
  }

  if (kind === "shell") {
    return (
      <ShellBody
        input={hasInput ? partInput : undefined}
        output={hasOutput ? partOutput : undefined}
      />
    );
  }

  if (kind === "search") {
    if (hasOutput) return <SearchResultBody output={partOutput} />;
    return null;
  }

  if (kind === "websearch" && hasOutput) {
    return <WebSearchBody output={partOutput} />;
  }

  if (kind === "webfetch" && hasOutput) {
    return <FallbackOutputBlock value={partOutput} />;
  }

  if (kind === "todo" && hasInput) {
    return <TodoBody input={partInput} />;
  }

  if (kind === "agent" || kind === "mcp" || kind === "image") {
    if (hasOutput) return <FallbackOutputBlock value={partOutput} />;
    return null;
  }

  if (kind === "plan" || kind === "permission") {
    if (hasOutput) return <FallbackOutputBlock value={partOutput} />;
    return null;
  }

  if (hasOutput) return <FallbackOutputBlock value={partOutput} />;
  return null;
}

function getFileReadFooter(output: unknown): ReactNode {
  const raw = extractTextContent(output);
  if (!raw) return null;
  const xmlType = parseXmlType(raw);
  const xmlEntries = parseXmlEntries(raw);
  const xmlContent = parseXmlContent(raw);

  if (xmlType === "directory" && xmlEntries) {
    return <span>{xmlEntries.length} entries</span>;
  }
  if (xmlContent) {
    const lineCount = xmlContent.split("\n").length;
    return <span>{lineCount} lines</span>;
  }
  return null;
}

function ExternalRuntimeTool({
  engine,
  kind,
  onApprove,
  onDeny,
  part,
}: RendererProps & { engine: ExternalEngine; kind: ExternalToolKind }) {
  const toolName = getToolName(part);
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const approvalId = getApprovalId(part);
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;

  const isFinishedState = isFinished(part.state);
  const isErrorS = isErrorState(part.state);

  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: !isFinishedState,
    autoExpand: part.state === "approval-requested",
  });

  const body = useMemo(
    () =>
      buildExternalBody({
        hasInput,
        hasOutput,
        kind,
        partInput: hasInput ? part.input : undefined,
        partOutput: hasOutput ? part.output : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasInput, hasOutput, kind, part.input, part.output],
  );

  const summaryIcon = getSummaryIcon(kind);
  const summaryContent = getSummary({ engine, kind, part, toolName });

  const footer = useMemo(() => {
    if (kind === "file" && hasOutput) return getFileReadFooter(part.output);
    if (kind === "webfetch" && hasInput) {
      const url = getStringField(part.input, ["url", "href", "target"]);
      return url ? (
        <span className="truncate text-[10px]" title={url}>
          {url}
        </span>
      ) : null;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, hasInput, hasOutput, part.input, part.output]);

  const isExpandable = body != null || !!partErrorText;

  return (
    <ToolLayout
      summary={
        <>
          {summaryIcon ? (
            <Icon
              icon={summaryIcon}
              className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
            />
          ) : null}
          {summaryContent}
          {showApprovalActions ? (
            <span className="text-foreground/40"> requires approval</span>
          ) : null}
        </>
      }
      isRunning={isRunningState(part.state)}
      isError={isErrorS}
      isExpandable={isExpandable}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={isErrorS ? partErrorText : undefined}
      footer={footer}
      actions={
        showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => approvalId && onApprove?.(approvalId)}
              size="sm"
            >
              Approve
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => approvalId && onDeny?.(approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
    >
      {body}
    </ToolLayout>
  );
}

function makeExternalTool(engine: ExternalEngine, kind: ExternalToolKind) {
  return memo(function ExternalTool(props: RendererProps) {
    return <ExternalRuntimeTool {...props} engine={engine} kind={kind} />;
  });
}

export const CursorAgentTool = makeExternalTool("Cursor", "agent");
export const CursorFileTool = makeExternalTool("Cursor", "file");
export const CursorImageTool = makeExternalTool("Cursor", "image");
export const CursorMcpTool = makeExternalTool("Cursor", "mcp");
export const CursorPermissionTool = makeExternalTool("Cursor", "permission");
export const CursorPlanTool = makeExternalTool("Cursor", "plan");
export const CursorRuntimeTool = makeExternalTool("Cursor", "runtime");
export const CursorSearchTool = makeExternalTool("Cursor", "search");
export const CursorShellTool = makeExternalTool("Cursor", "shell");
export const CursorTodoTool = makeExternalTool("Cursor", "todo");
export const CursorWebFetchTool = makeExternalTool("Cursor", "webfetch");
export const CursorWebSearchTool = makeExternalTool("Cursor", "websearch");

export const OpenCodeAgentTool = makeExternalTool("OpenCode", "agent");
export const OpenCodeFileTool = makeExternalTool("OpenCode", "file");
export const OpenCodeImageTool = makeExternalTool("OpenCode", "image");
export const OpenCodeMcpTool = makeExternalTool("OpenCode", "mcp");
export const OpenCodePermissionTool = makeExternalTool(
  "OpenCode",
  "permission",
);
export const OpenCodePlanTool = makeExternalTool("OpenCode", "plan");
export const OpenCodeRuntimeTool = makeExternalTool("OpenCode", "runtime");
export const OpenCodeSearchTool = makeExternalTool("OpenCode", "search");
export const OpenCodeShellTool = makeExternalTool("OpenCode", "shell");
export const OpenCodeTodoTool = makeExternalTool("OpenCode", "todo");
export const OpenCodeWebFetchTool = makeExternalTool("OpenCode", "webfetch");
export const OpenCodeWebSearchTool = makeExternalTool("OpenCode", "websearch");
