"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type CodexWebSearchInput = {
  query: string;
};

type WebSearchAction =
  | { type: "search"; query: string; queries?: string[] }
  | { type: "openPage"; url: string | null }
  | { type: "findInPage"; pattern?: string }
  | { type: "other" };

type CodexWebSearchOutput = {
  action: WebSearchAction;
};

function isWebSearchInput(value: unknown): value is CodexWebSearchInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).query === "string";
}

function isWebSearchOutput(value: unknown): value is CodexWebSearchOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.action != null && typeof v.action === "object";
}

function ActionDetails({ action }: { action: WebSearchAction }) {
  switch (action.type) {
    case "search":
      return (
        <div className="flex flex-col gap-1.5 text-[12px]">
          <p className="text-foreground/60">
            Query: <span className="text-foreground/80">{action.query}</span>
          </p>
          {action.queries && action.queries.length > 1 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-foreground/50">Related queries:</p>
              <ul className="ml-3 list-disc text-foreground/60">
                {action.queries
                  .filter((q) => q !== action.query)
                  .map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      );
    case "openPage":
      return action.url ? (
        <div className="text-[12px]">
          <p className="text-foreground/60">
            Opened{" "}
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline decoration-primary/30 hover:decoration-primary"
            >
              {action.url}
            </a>
          </p>
        </div>
      ) : null;
    case "findInPage":
      return action.pattern ? (
        <p className="text-[12px] text-foreground/60">
          Searched page for{" "}
          <span className="font-mono text-foreground/80">{action.pattern}</span>
        </p>
      ) : null;
    case "other":
    default:
      return null;
  }
}

function buildSummary(
  input: CodexWebSearchInput,
  output: CodexWebSearchOutput | null,
  flags: {
    isDenied: boolean;
    isDone: boolean;
    isError: boolean;
    isRunning: boolean;
  },
) {
  if (flags.isDenied) return "Search denied";
  if (flags.isError) return "Search failed";

  if (output?.action.type === "openPage" && output.action.url) {
    const urlLabel = (() => {
      try {
        return new URL(output.action.url).hostname;
      } catch {
        return output.action.url;
      }
    })();
    if (flags.isDone) return `Opened ${urlLabel}`;
    return `Opening ${urlLabel}`;
  }

  if (output?.action.type === "findInPage") {
    if (flags.isDone) return `Found in page`;
    return `Finding in page`;
  }

  const queryLabel = input.query ? `\u201c${input.query}\u201d` : "the web";
  if (flags.isDone) return `Searched for ${queryLabel}`;
  if (flags.isRunning) return `Searching for ${queryLabel}`;
  return `Searching for ${queryLabel}`;
}

export const CodexWebSearchTool = memo(function CodexWebSearchTool({
  part,
}: RendererProps) {
  const isRunning =
    part.state === "approval-responded" ||
    part.state === "input-streaming" ||
    part.state === "input-available";
  const isDenied = part.state === "output-denied";
  const isError = part.state === "output-error" || isDenied;
  const isDone = part.state === "output-available";

  const input =
    "input" in part && isWebSearchInput(part.input) ? part.input : null;
  const output =
    "output" in part && isWebSearchOutput(part.output) ? part.output : null;

  if (!input) return null;

  const hasDetails =
    output?.action &&
    output.action.type !== "other" &&
    (output.action.type !== "openPage" || output.action.url != null);
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = (
    <>
      <Icon
        icon="solar:magnifer-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {buildSummary(input, output, { isDenied, isDone, isError, isRunning })}
    </>
  );

  if (!hasDetails) {
    return (
      <ToolLayout
        summary={summary}
        isRunning={isRunning}
        isError={isError}
        isExpandable={false}
        isExpanded={false}
        onExpandedChange={() => {}}
      />
    );
  }

  return (
    <ToolLayout
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <ActionDetails action={output!.action} />
    </ToolLayout>
  );
});
