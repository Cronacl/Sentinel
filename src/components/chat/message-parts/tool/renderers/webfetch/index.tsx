"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button, ScrollShadow } from "@heroui/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { MarkdownContent } from "../../../text/markdown-content";

type WebFetchToolInput = {
  format?: "text" | "markdown" | "html";
  timeout?: number;
  url?: string;
  urls?: string[];
};

type WebFetchSuccessResult = {
  content: string | null;
  contentType: string;
  format: "text" | "markdown" | "html";
  imageDataUrl: string | null;
  isImage: boolean;
  sizeBytes: number;
  status: "success";
  statusCode: number;
  title: string | null;
  truncated: boolean;
  url: string;
};

type WebFetchErrorResult = {
  error: string;
  status: "error";
  url: string;
};

type WebFetchToolOutput = {
  failureCount: number;
  isBatch: boolean;
  requestedCount: number;
  results: Array<WebFetchSuccessResult | WebFetchErrorResult>;
  successCount: number;
};

function isWebFetchInput(value: unknown): value is WebFetchToolInput {
  const candidate = value as {
    format?: unknown;
    timeout?: unknown;
    url?: unknown;
    urls?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.url === undefined || typeof candidate.url === "string") &&
    (candidate.urls === undefined ||
      (Array.isArray(candidate.urls) &&
        candidate.urls.every((item) => typeof item === "string"))) &&
    (candidate.format === undefined ||
      candidate.format === "text" ||
      candidate.format === "markdown" ||
      candidate.format === "html") &&
    (candidate.timeout === undefined || typeof candidate.timeout === "number")
  );
}

function isSuccessResult(value: unknown): value is WebFetchSuccessResult {
  const candidate = value as {
    content?: unknown;
    contentType?: unknown;
    format?: unknown;
    imageDataUrl?: unknown;
    isImage?: unknown;
    sizeBytes?: unknown;
    status?: unknown;
    statusCode?: unknown;
    title?: unknown;
    truncated?: unknown;
    url?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    candidate.status === "success" &&
    (candidate.content === null || typeof candidate.content === "string") &&
    typeof candidate.contentType === "string" &&
    (candidate.format === "text" ||
      candidate.format === "markdown" ||
      candidate.format === "html") &&
    (candidate.imageDataUrl === null ||
      typeof candidate.imageDataUrl === "string") &&
    typeof candidate.isImage === "boolean" &&
    typeof candidate.sizeBytes === "number" &&
    typeof candidate.statusCode === "number" &&
    (candidate.title === null || typeof candidate.title === "string") &&
    typeof candidate.truncated === "boolean" &&
    typeof candidate.url === "string"
  );
}

function isErrorResult(value: unknown): value is WebFetchErrorResult {
  const candidate = value as {
    error?: unknown;
    status?: unknown;
    url?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    candidate.status === "error" &&
    typeof candidate.error === "string" &&
    typeof candidate.url === "string"
  );
}

function isWebFetchOutput(value: unknown): value is WebFetchToolOutput {
  const candidate = value as {
    failureCount?: unknown;
    isBatch?: unknown;
    requestedCount?: unknown;
    results?: unknown;
    successCount?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.failureCount === "number" &&
    typeof candidate.isBatch === "boolean" &&
    typeof candidate.requestedCount === "number" &&
    Array.isArray(candidate.results) &&
    candidate.results.every(
      (item) => isSuccessResult(item) || isErrorResult(item),
    ) &&
    typeof candidate.successCount === "number"
  );
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncatePreview(value: string, length = 220) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}...`;
}

function buildSummary(
  part: RendererProps["part"],
  input: WebFetchToolInput,
  output: WebFetchToolOutput | null,
): ReactNode {
  if (part.state === "output-denied") {
    return <>Fetch denied</>;
  }

  if (part.state === "output-error") {
    return <>Fetch failed</>;
  }

  if (part.state === "output-available" && output) {
    if (output.isBatch) {
      return (
        <>
          Fetched{" "}
          <span className="text-foreground/50">{output.successCount}</span>/
          {output.requestedCount} URLs
          {output.failureCount > 0 ? (
            <span className="ml-1 text-[11px] text-danger/60">
              {output.failureCount} failed
            </span>
          ) : null}
        </>
      );
    }
    const firstSuccess = output.results.find(isSuccessResult);
    const hostname = firstSuccess
      ? (firstSuccess.title ?? getHostname(firstSuccess.url))
      : getHostname(input.url ?? "");
    return (
      <>
        Fetched <span className="text-[12px]">{hostname}</span>
        {firstSuccess ? (
          <span className="ml-1.5 text-[11px] text-foreground/40">
            {formatBytes(firstSuccess.sizeBytes)}
          </span>
        ) : null}
      </>
    );
  }

  if (part.state === "approval-requested") {
    const target =
      input.url ??
      (input.urls?.length ? `${input.urls.length} URLs` : "remote content");
    return (
      <>
        Fetch{" "}
        <span className="text-[12px]">
          {typeof target === "string" && target.startsWith("http")
            ? getHostname(target)
            : target}
        </span>
      </>
    );
  }

  const target = input.url
    ? getHostname(input.url)
    : input.urls?.length
      ? `${input.urls.length} URLs`
      : "remote content";
  return (
    <>
      Fetching <span className="text-[12px]">{target}</span>
    </>
  );
}

function buildSingleResultBody(result: WebFetchSuccessResult): ReactNode {
  if (result.isImage && result.imageDataUrl) {
    return (
      <a
        className="group block overflow-hidden rounded-lg border border-border/40"
        href={result.url}
        rel="noreferrer"
        target="_blank"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={result.title ?? "Fetched image"}
          className="max-h-[14rem] w-full object-cover"
          src={result.imageDataUrl}
        />
      </a>
    );
  }

  const content = result.content ?? "";

  if (result.format === "markdown" && content.trim()) {
    return (
      <ScrollShadow className="max-h-[300px]">
        <MarkdownContent text={content} />
      </ScrollShadow>
    );
  }

  return (
    <ScrollShadow
      className={`max-h-[220px] overflow-x-auto whitespace-pre-wrap wrap-break-word ${
        result.format === "html"
          ? "font-mono text-[11px] text-foreground/70"
          : "text-[12px] text-foreground/70"
      }`}
    >
      {content}
    </ScrollShadow>
  );
}

function buildBatchResultCard(
  result: WebFetchSuccessResult | WebFetchErrorResult,
) {
  if (result.status === "error") {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger-soft px-2.5 py-2">
        <p className="truncate text-[11px] font-medium text-danger-soft-foreground">
          {getHostname(result.url)}
        </p>
        <p className="mt-0.5 text-[10px] text-danger-soft-foreground/70">
          {result.error}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-foreground/80">
          {result.title ?? getHostname(result.url)}
        </p>
        <span className="shrink-0 text-[10px] text-foreground/40">
          {result.statusCode}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-foreground/40">
        {result.contentType} · {formatBytes(result.sizeBytes)}
        {result.truncated ? " · truncated" : ""}
      </p>
      {result.isImage && result.imageDataUrl ? (
        <a
          className="mt-2 block overflow-hidden rounded-lg border border-border/40"
          href={result.url}
          rel="noreferrer"
          target="_blank"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={result.title ?? "Fetched image"}
            className="max-h-36 w-full object-cover"
            src={result.imageDataUrl}
          />
        </a>
      ) : (
        <p className="mt-1.5 line-clamp-3 text-[11px] text-foreground/60">
          {truncatePreview(
            result.content?.replace(/\s+/g, " ").trim() ?? "",
            240,
          ) || "(no content)"}
        </p>
      )}
    </div>
  );
}

function buildBody(
  input: WebFetchToolInput,
  output: WebFetchToolOutput | null,
  state: RendererProps["part"]["state"],
  errorText?: string,
): ReactNode {
  if (state === "output-denied") {
    return <p className="text-[11px] text-muted">Execution denied.</p>;
  }

  if (errorText && !output) {
    return (
      <p className="text-[11px] text-danger-soft-foreground">{errorText}</p>
    );
  }

  if (!output) {
    return (
      <p className="text-[11px] text-foreground/50">
        Fetching {input.url ?? input.urls?.join(", ") ?? "remote content"}
      </p>
    );
  }

  if (output.isBatch) {
    return (
      <div className="space-y-2">
        {output.results.map((result) => (
          <div key={`${result.status}:${result.url}`}>
            {buildBatchResultCard(result)}
          </div>
        ))}
      </div>
    );
  }

  const firstSuccess = output.results.find(isSuccessResult);
  if (firstSuccess) return buildSingleResultBody(firstSuccess);

  const firstError = output.results.find(isErrorResult);
  return (
    <p className="text-[11px] text-danger-soft-foreground">
      {firstError?.error ?? "No output."}
    </p>
  );
}

export const WebFetchTool = memo(function WebFetchTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const approval = "approval" in part ? part.approval : undefined;
  const approvalId = approval?.id;
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const input = hasInput && isWebFetchInput(part.input) ? part.input : null;
  const output =
    hasOutput && isWebFetchOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const showApprovalActions =
    part.state === "approval-requested" && approvalId && onApprove && onDeny;
  const isRunningState = part.state === "approval-responded";
  const isFinishedState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(output));
  const isErrorState =
    part.state === "output-denied" ||
    part.state === "output-error" ||
    (output && output.failureCount > 0 && output.successCount === 0);
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  if (!input) return null;

  const summary = buildSummary(part, input, output);
  const body = buildBody(input, output, part.state, partErrorText);

  const firstSuccess = output?.results.find(isSuccessResult) ?? null;
  const footer = output ? (
    output.isBatch ? (
      <span>
        {output.successCount} success · {output.failureCount} failed
      </span>
    ) : firstSuccess ? (
      <span>
        {firstSuccess.statusCode} · {firstSuccess.contentType} ·{" "}
        {formatBytes(firstSuccess.sizeBytes)}
        {firstSuccess.truncated ? " · truncated" : ""}
      </span>
    ) : null
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={
        isRunningState ||
        (!isFinishedState && part.state !== "approval-requested")
      }
      isError={Boolean(isErrorState)}
      isExpandable={isFinishedState}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
      actions={
        <>
          {part.state === "approval-requested" ? (
            <p className="mb-1.5 line-clamp-1 text-[11px] text-muted">
              {input.urls?.length
                ? `Fetch ${input.urls.length} URLs as ${input.format ?? "markdown"}`
                : `Fetch ${input.format ?? "markdown"} from ${getHostname(input.url ?? "")}`}
            </p>
          ) : null}
          {showApprovalActions ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-7 min-w-0 px-3 text-[11px]"
                onPress={() => approvalId && onApprove?.(approvalId)}
                type="button"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 min-w-0 px-3 text-[11px]"
                onPress={() => approvalId && onDeny?.(approvalId)}
                type="button"
              >
                Deny
              </Button>
            </div>
          ) : null}
        </>
      }
    >
      {body}
    </ToolLayout>
  );
});
