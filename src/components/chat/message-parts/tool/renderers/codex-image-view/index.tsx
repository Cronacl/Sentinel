"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";

type CodexImageViewInput = {
  path: string;
};

type CodexImageViewOutput = {
  path: string;
};

function isImageViewInput(value: unknown): value is CodexImageViewInput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).path === "string";
}

function isImageViewOutput(value: unknown): value is CodexImageViewOutput {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).path === "string";
}

function getFileName(path: string) {
  return path.split("/").pop() ?? path;
}

const PREVIEWABLE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
]);

function canPreview(path: string) {
  const ext = path.toLowerCase().slice(path.lastIndexOf("."));
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

export const CodexImageViewTool = memo(function CodexImageViewTool({
  part,
}: RendererProps) {
  const input =
    "input" in part && isImageViewInput(part.input) ? part.input : null;
  const output =
    "output" in part && isImageViewOutput(part.output) ? part.output : null;
  const [isExpanded, setIsExpanded] = useState(false);

  if (!input) return null;

  const imagePath = output?.path ?? input.path;
  const name = getFileName(imagePath);
  const showPreview = canPreview(imagePath);

  const summary = (
    <>
      <Icon
        icon="solar:gallery-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      Viewed <span className="font-mono text-[12px]">{name}</span>
    </>
  );

  if (!showPreview) {
    return (
      <ToolLayout
        summary={summary}
        isExpandable={false}
        isExpanded={false}
        onExpandedChange={() => {}}
      />
    );
  }

  return (
    <ToolLayout
      summary={summary}
      isExpandable
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="flex justify-center rounded-md bg-foreground/[0.02] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          className="max-h-[400px] max-w-full rounded object-contain"
          src={`/api/workspace-file?path=${encodeURIComponent(imagePath)}`}
        />
      </div>
      <p className="mt-1 text-center text-[10px] text-foreground/40">
        {imagePath}
      </p>
    </ToolLayout>
  );
});
