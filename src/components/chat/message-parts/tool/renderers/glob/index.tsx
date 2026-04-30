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

type GlobToolInput = {
  path?: string;
  pattern: string;
};

type GlobToolOutput = {
  files: string[];
  pattern: string;
  root: string;
  shownFiles: number;
  totalFiles: number;
  truncated: boolean;
};

function isGlobToolInput(value: unknown): value is GlobToolInput {
  const candidate = value as { path?: unknown; pattern?: unknown };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof candidate.pattern === "string" &&
    (candidate.path === undefined || typeof candidate.path === "string")
  );
}

function isGlobToolOutput(value: unknown): value is GlobToolOutput {
  const candidate = value as {
    files?: unknown;
    pattern?: unknown;
    root?: unknown;
    shownFiles?: unknown;
    totalFiles?: unknown;
    truncated?: unknown;
  };

  return (
    !!candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.files) &&
    typeof candidate.pattern === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.shownFiles === "number" &&
    typeof candidate.totalFiles === "number" &&
    typeof candidate.truncated === "boolean"
  );
}

function buildSummary(
  part: RendererProps["part"],
  pattern: string,
  output: GlobToolOutput | null,
): ReactNode {
  if (part.state === "output-error") {
    return (
      <>
        Glob failed for <span className="font-mono text-[12px]">{pattern}</span>
      </>
    );
  }

  if (part.state === "output-available" && output) {
    if (output.files.length === 0) {
      return (
        <>
          No files matched{" "}
          <span className="font-mono text-[12px]">{pattern}</span>
        </>
      );
    }
    return (
      <>
        Found <span className="text-foreground/50">{output.totalFiles}</span>{" "}
        file{output.totalFiles === 1 ? "" : "s"} matching{" "}
        <span className="font-mono text-[12px]">{pattern}</span>
      </>
    );
  }

  return (
    <>
      Searching for <span className="font-mono text-[12px]">{pattern}</span>
    </>
  );
}

function FileEntry({ path }: { path: string }) {
  const language = detectLanguageFromPath(path);
  const iconName = languageToVSCodeIcon[language] ?? null;
  const fileName = path.split("/").pop() ?? path;
  const dirPrefix = path.includes("/")
    ? path.slice(0, path.length - fileName.length)
    : null;

  return (
    <div className="flex items-center gap-1.5 py-px">
      <Icon
        className="h-3 w-3 shrink-0 text-foreground/40"
        icon={iconName ?? "vscode-icons:default-file"}
      />
      <span className="truncate font-mono text-[11px]" title={path}>
        {dirPrefix ? (
          <>
            <span className="text-foreground/25">{dirPrefix}</span>
            <span className="text-foreground/60">{fileName}</span>
          </>
        ) : (
          <span className="text-foreground/60">{fileName}</span>
        )}
      </span>
    </div>
  );
}

function GlobBody({
  output,
  pattern,
}: {
  output: GlobToolOutput | null;
  pattern: string;
}) {
  if (!output) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        Searching for {pattern}
      </p>
    );
  }

  if (output.files.length === 0) {
    return (
      <p className="font-mono text-[11px] text-foreground/50">
        No files matched {pattern}
      </p>
    );
  }

  return (
    <ScrollShadow className="max-h-[280px]">
      <div className="flex flex-col">
        {output.files.map((file) => (
          <FileEntry key={file} path={file} />
        ))}
      </div>
    </ScrollShadow>
  );
}

export const GlobTool = memo(function GlobTool({ part }: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const globInput = hasInput && isGlobToolInput(part.input) ? part.input : null;
  const globOutput =
    hasOutput && isGlobToolOutput(part.output) ? part.output : null;
  const partErrorText = "errorText" in part ? part.errorText : undefined;
  const isFinishedState =
    part.state === "output-error" ||
    (part.state === "output-available" && Boolean(globOutput));
  const isErrorState = part.state === "output-error";
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: !isFinishedState,
  });

  const pattern = globOutput?.pattern ?? globInput?.pattern ?? "";
  const summary = buildSummary(part, pattern, globOutput);

  const footer = globOutput ? (
    <span>
      {globOutput.totalFiles} file{globOutput.totalFiles === 1 ? "" : "s"}
      {globOutput.truncated ? ` · showing ${globOutput.shownFiles}` : ""}
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
      errorText={isErrorState ? partErrorText : undefined}
      footer={footer}
    >
      <GlobBody output={globOutput} pattern={pattern} />
    </ToolLayout>
  );
});
