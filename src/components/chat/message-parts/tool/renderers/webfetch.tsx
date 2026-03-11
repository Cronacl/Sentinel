"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { RendererProps } from "../renderer";

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

function getStatusChipClass(tone: "danger" | "muted" | "success") {
  switch (tone) {
    case "success":
      return "border-success/5 bg-success/10 text-success";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger-soft-foreground";
    default:
      return "border-border/60 bg-background/70 text-muted";
  }
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncatePreview(value: string, length = 220) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}...`;
}

function getStatus(
  part: RendererProps["part"],
  output: WebFetchToolOutput | null,
) {
  if (part.state === "approval-responded") {
    return { label: "Running", tone: "muted" as const };
  }

  if (part.state === "approval-requested") {
    return { label: "Needs approval", tone: "muted" as const };
  }

  if (part.state === "output-denied") {
    return { label: "Denied", tone: "danger" as const };
  }

  if (part.state === "output-error") {
    return { label: "Failed", tone: "danger" as const };
  }

  if (part.state === "output-available" && output) {
    if (output.failureCount > 0 && output.successCount === 0) {
      return { label: "Failed", tone: "danger" as const };
    }

    if (output.failureCount > 0) {
      return { label: "Partial", tone: "muted" as const };
    }

    return { label: "Success", tone: "success" as const };
  }

  return { label: "Running", tone: "muted" as const };
}

function buildPreview({
  errorText,
  input,
  output,
  state,
}: {
  errorText?: string;
  input: WebFetchToolInput;
  output: WebFetchToolOutput | null;
  state: RendererProps["part"]["state"];
}) {
  if (state === "output-denied") {
    return "Execution denied.";
  }

  if (errorText && !output) {
    return errorText;
  }

  if (output?.isBatch) {
    return `${output.successCount}/${output.requestedCount} URLs fetched successfully${output.failureCount ? `, ${output.failureCount} failed` : ""}.`;
  }

  const firstSuccess = output?.results.find(isSuccessResult);
  if (firstSuccess?.isImage) {
    return "Fetched image preview available.";
  }

  if (firstSuccess?.content?.trim()) {
    return truncatePreview(firstSuccess.content.replace(/\s+/g, " ").trim());
  }

  const target = input.url ?? input.urls?.[0] ?? "remote content";
  return `Fetching ${target}`;
}

function buildSingleResultBody(result: WebFetchSuccessResult): ReactNode {
  if (result.isImage && result.imageDataUrl) {
    return (
      <div className="space-y-3">
        <a
          className="group block overflow-hidden rounded-2xl border border-border/70 bg-background/70"
          href={result.url}
          rel="noreferrer"
          target="_blank"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={result.title ?? "Fetched image"}
            className="max-h-[18rem] w-full object-cover transition-transform group-hover:scale-[1.01]"
            src={result.imageDataUrl}
          />
        </a>
        <p className="text-[11px] text-muted">
          Open the image source in a new tab for the original response.
        </p>
      </div>
    );
  }

  return (
    <ScrollShadow
      className={`max-h-[220px] overflow-x-auto whitespace-pre-wrap break-words ${
        result.format === "html"
          ? "font-mono text-[11px] text-foreground"
          : "text-[12px] text-foreground"
      }`}
    >
      {result.content ?? ""}
    </ScrollShadow>
  );
}

function buildBatchResultCard(
  result: WebFetchSuccessResult | WebFetchErrorResult,
) {
  if (result.status === "error") {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-3">
        <p className="truncate text-xs font-medium text-danger-soft-foreground">
          {getHostname(result.url)}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-danger-soft-foreground/80">
          {result.url}
        </p>
        <p className="mt-2 text-[11px] text-danger-soft-foreground">
          {result.error}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {result.title ?? getHostname(result.url)}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-foreground/72">
            {result.url}
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-foreground/72">
          HTTP {result.statusCode}
        </span>
      </div>

      <div className="mt-2 text-[10px] text-foreground/72">
        {result.contentType} · {formatBytes(result.sizeBytes)}
        {result.truncated ? " · truncated" : ""}
      </div>

      {result.isImage && result.imageDataUrl ? (
        <a
          className="group mt-3 block overflow-hidden rounded-xl border border-border/60"
          href={result.url}
          rel="noreferrer"
          target="_blank"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={result.title ?? "Fetched image"}
            className="max-h-44 w-full object-cover transition-transform group-hover:scale-[1.01]"
            src={result.imageDataUrl}
          />
        </a>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[11px] text-foreground">
          {truncatePreview(
            result.content?.replace(/\s+/g, " ").trim() ?? "",
            320,
          ) || "(no content)"}
        </p>
      )}
    </div>
  );
}

function buildBody({
  errorText,
  input,
  output,
  state,
}: {
  errorText?: string;
  input: WebFetchToolInput;
  output: WebFetchToolOutput | null;
  state: RendererProps["part"]["state"];
}): ReactNode {
  if (state === "output-denied") {
    return "Execution denied.";
  }

  if (errorText && !output) {
    return errorText;
  }

  if (!output) {
    return `Fetching ${input.url ?? input.urls?.join(", ") ?? "remote content"}`;
  }

  if (output.isBatch) {
    return (
      <div className="space-y-3">
        {output.results.map((result) => (
          <div key={`${result.status}:${result.url}`}>
            {buildBatchResultCard(result)}
          </div>
        ))}
      </div>
    );
  }

  const firstSuccess = output.results.find(isSuccessResult);
  if (firstSuccess) {
    return buildSingleResultBody(firstSuccess);
  }

  const firstError = output.results.find(isErrorResult);
  return firstError?.error ?? "No output.";
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
  const [isExpanded, setIsExpanded] = useState(
    part.state === "approval-requested" || isRunningState,
  );

  useEffect(() => {
    setIsExpanded(part.state === "approval-requested" || isRunningState);
  }, [isRunningState, part.state, part.toolCallId]);

  if (!input) {
    return null;
  }

  const status = getStatus(part, output);
  const firstSuccess = output?.results.find(isSuccessResult) ?? null;
  const resolvedUrl =
    firstSuccess?.url ?? input.url ?? input.urls?.[0] ?? "remote content";
  const title = output?.isBatch
    ? `${output.requestedCount} URLs`
    : (firstSuccess?.title ?? getHostname(resolvedUrl));
  const preview = buildPreview({
    errorText: partErrorText,
    input,
    output,
    state: part.state,
  });
  const body = buildBody({
    errorText: partErrorText,
    input,
    output,
    state: part.state,
  });
  const metadata = output
    ? output.isBatch
      ? `${output.successCount} success · ${output.failureCount} failed`
      : firstSuccess
        ? `HTTP ${firstSuccess.statusCode} · ${firstSuccess.contentType} · ${formatBytes(firstSuccess.sizeBytes)}${firstSuccess.truncated ? " · truncated" : ""}`
        : null
    : input.timeout
      ? `${input.timeout}s timeout`
      : null;

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">
                Web fetch
              </p>
              <div
                className={`rounded-full flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.label === "Running" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span className="truncate">{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-foreground/84">
              {title}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/72">
              {input.url ??
                (input.urls?.length
                  ? `${input.urls.length} URLs`
                  : "remote content")}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">
              {part.state === "approval-requested"
                ? input.urls?.length
                  ? `Fetch ${input.urls.length} URLs as ${input.format ?? "markdown"}${input.timeout ? ` with a ${input.timeout}s timeout per URL` : ""}.`
                  : `Fetch ${input.format ?? "markdown"} from ${getHostname(input.url ?? "")}${input.timeout ? ` with a ${input.timeout}s timeout` : ""}.`
                : preview}
            </p>
          </div>

          {isFinishedState ? (
            <Disclosure.Heading>
              <Button
                slot="trigger"
                size="sm"
                variant="tertiary"
                className="h-auto min-w-0 px-2 py-0.5 bg-background text-[10px] text-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/20 bg-surface">
              <div className="border-b border-border/50 px-3.5 py-2 text-[9px] text-foreground">
                Web fetch
              </div>

              <div className="px-3.5 py-3">
                {metadata ? (
                  <div className="mb-3 text-[10px] text-foreground/72">
                    {metadata}
                  </div>
                ) : null}

                {body}
              </div>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>

        {showApprovalActions ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onPress={() => {
                if (approvalId) {
                  onApprove?.(approvalId);
                }
              }}
              type="button"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                if (approvalId) {
                  onDeny?.(approvalId);
                }
              }}
              type="button"
            >
              Deny
            </Button>
          </div>
        ) : null}

        {partErrorText && part.state !== "output-error" ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
            {partErrorText}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
});
