"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout, useToolExpansionState } from "../shared/tool-layout";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";

type ListToolInput = {
  ignore?: string[];
  path?: string;
};

type ListToolEntry = {
  depth: number;
  kind: "directory" | "file";
  name: string;
  path: string;
};

type ListToolOutput = {
  directoryCount: number;
  entries: ListToolEntry[];
  fileCount: number;
  root: string;
  totalEntries: number;
  tree: string;
  truncated: boolean;
};

function isListToolInput(value: unknown): value is ListToolInput {
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

function isListToolOutput(value: unknown): value is ListToolOutput {
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

function buildSummary(
  part: RendererProps["part"],
  shownRoot: string,
  output: ListToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Failed to list{" "}
        <span className="font-mono text-[12px]">{shownRoot}</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    return (
      <>
        Listed <span className="font-mono text-[12px]">{shownRoot}</span>
        <span className="ml-1.5 text-[11px] text-foreground/40">
          {output.directoryCount} dir{output.directoryCount === 1 ? "" : "s"},{" "}
          {output.fileCount} file{output.fileCount === 1 ? "" : "s"}
        </span>
      </>
    );
  }

  return (
    <>
      Listing <span className="font-mono text-[12px]">{shownRoot}</span>
    </>
  );
}

const DIR_ICON = "vscode-icons:default-folder";

function TreeEntry({ entry }: { entry: ListToolEntry }) {
  const isDir = entry.kind === "directory";
  let iconName: string;

  if (isDir) {
    iconName = DIR_ICON;
  } else {
    const lang = detectLanguageFromPath(entry.name);
    iconName = languageToVSCodeIcon[lang] ?? "vscode-icons:default-file";
  }

  return (
    <div
      className="flex items-center gap-1.5 py-px"
      style={{ paddingLeft: `${entry.depth * 16}px` }}
    >
      <Icon className="h-3 w-3 shrink-0" icon={iconName} />
      <span
        className={`truncate font-mono text-[11px] ${isDir ? "text-foreground/60 font-medium" : "text-foreground/50"}`}
        title={entry.path}
      >
        {entry.name}
      </span>
    </div>
  );
}

function ListBody({
  errorText,
  output,
  requestedPath,
}: {
  errorText?: string;
  output: ListToolOutput | null;
  requestedPath: string;
}) {
  if (!output) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        {errorText ?? `Listing ${requestedPath}`}
      </p>
    );
  }

  if (output.entries.length === 0) {
    return (
      <ScrollShadow className="max-h-[220px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/70">
        {output.tree.trim() || "(empty directory)"}
      </ScrollShadow>
    );
  }

  return (
    <ScrollShadow className="max-h-[280px]">
      <div className="flex flex-col">
        {output.entries.map((entry) => (
          <TreeEntry key={entry.path} entry={entry} />
        ))}
      </div>
    </ScrollShadow>
  );
}

export const ListTool = memo(function ListTool({ part }: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const listInput = hasInput && isListToolInput(part.input) ? part.input : null;
  const listOutput =
    hasOutput && isListToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(listOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: !isFinishedState,
  });

  const requestedPath = listInput?.path?.trim() || ".";
  const shownRoot = listOutput?.root ?? requestedPath;
  const summary = buildSummary(part, shownRoot, listOutput);

  const footer = listOutput ? (
    <span>
      {listOutput.directoryCount} dir
      {listOutput.directoryCount === 1 ? "" : "s"} · {listOutput.fileCount} file
      {listOutput.fileCount === 1 ? "" : "s"} · {listOutput.totalEntries} shown
      {listOutput.truncated ? " · truncated" : ""}
    </span>
  ) : null;

  return (
    <ToolLayout
      summary={summary}
      isRunning={!isFinishedState}
      isError={isErrorState}
      isExpandable={true}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={
        partErrorText && part.state !== "output-error"
          ? partErrorText
          : undefined
      }
      footer={footer}
    >
      <ListBody
        errorText={partErrorText}
        output={listOutput}
        requestedPath={requestedPath}
      />
    </ToolLayout>
  );
});
