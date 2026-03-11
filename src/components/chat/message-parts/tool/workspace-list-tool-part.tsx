"use client";

import { memo, useEffect, useState } from "react";
import { Button, Disclosure, ScrollShadow, Spinner } from "@heroui/react";

import type { ToolRendererProps } from "./tool-renderer";

type WorkspaceListInput = {
  ignore?: string[];
  path?: string;
};

type WorkspaceListOutput = {
  directoryCount: number;
  entries: Array<{
    depth: number;
    kind: "directory" | "file";
    name: string;
    path: string;
  }>;
  fileCount: number;
  root: string;
  totalEntries: number;
  tree: string;
  truncated: boolean;
};

function isWorkspaceListInput(value: unknown): value is WorkspaceListInput {
  const candidate = value as { ignore?: unknown; path?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.path === undefined || typeof candidate.path === "string") &&
    (candidate.ignore === undefined ||
      (Array.isArray(candidate.ignore) &&
        candidate.ignore.every((item) => typeof item === "string")))
  );
}

function isWorkspaceListOutput(value: unknown): value is WorkspaceListOutput {
  const candidate = value as {
    directoryCount?: unknown;
    entries?: unknown;
    fileCount?: unknown;
    root?: unknown;
    totalEntries?: unknown;
    tree?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.root === "string" &&
    typeof candidate.directoryCount === "number" &&
    typeof candidate.fileCount === "number" &&
    typeof candidate.totalEntries === "number" &&
    typeof candidate.tree === "string" &&
    typeof candidate.truncated === "boolean" &&
    Array.isArray(candidate.entries)
  );
}

function getStatus(part: ToolRendererProps["part"]) {
  switch (part.state) {
    case "output-available":
      return { label: "Ready", tone: "success" as const };
    case "output-error":
      return { label: "Failed", tone: "danger" as const };
    default:
      return { label: "Scanning", tone: "muted" as const };
  }
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

export const WorkspaceListToolPart = memo(function WorkspaceListToolPart({
  part,
}: ToolRendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const listInput = hasInput && isWorkspaceListInput(part.input) ? part.input : null;
  const listOutput =
    hasOutput && isWorkspaceListOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const status = getStatus(part);
  const [isExpanded, setIsExpanded] = useState(part.state !== "output-available");

  useEffect(() => {
    setIsExpanded(part.state !== "output-available");
  }, [part.state, part.toolCallId]);

  const requestedPath = listInput?.path?.trim() || ".";
  const shownRoot = listOutput?.root ?? requestedPath;
  const tree = listOutput?.tree;

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <div className="rounded-2xl border border-border/60 bg-surface/20 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-medium text-foreground">Workspace list</p>
              <div
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${getStatusChipClass(status.tone)}`}
              >
                {status.tone === "muted" ? (
                  <Spinner className="h-3 w-3" size="sm" />
                ) : null}
                <span>{status.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/72">
              {shownRoot}
            </p>
            {listInput?.ignore?.length ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                Ignoring: {listInput.ignore.join(", ")}
              </p>
            ) : null}
          </div>

          {tree || partErrorText ? (
            <Disclosure.Heading>
              <Button
                slot="trigger"
                size="sm"
                variant="tertiary"
                className="h-auto min-w-0 bg-background px-2 py-0.5 text-[10px] text-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </Disclosure.Heading>
          ) : null}
        </div>

        {listOutput ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-foreground/72">
            <span>{listOutput.directoryCount} dirs</span>
            <span>{listOutput.fileCount} files</span>
            <span>{listOutput.totalEntries} shown</span>
            {listOutput.truncated ? <span>truncated</span> : null}
          </div>
        ) : null}

        <Disclosure.Content>
          <Disclosure.Body>
            {tree ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-border/20 bg-surface">
                <div className="border-b border-border/50 px-3.5 py-2 text-[9px] text-foreground">
                  Tree
                </div>

                <div className="px-3.5 py-3">
                  <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-6 text-foreground">
                    {tree}
                  </ScrollShadow>
                </div>
              </div>
            ) : null}

            {partErrorText ? (
              <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
                {partErrorText}
              </div>
            ) : null}
          </Disclosure.Body>
        </Disclosure.Content>
      </div>
    </Disclosure>
  );
});
