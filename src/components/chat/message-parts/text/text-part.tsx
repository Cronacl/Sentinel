"use client";

import { memo } from "react";

import type { TextPart as TextPartType } from "../types";
import { MarkdownContent } from "./markdown-content";

export const TextPart = memo(function TextPart({
  isStreaming = false,
  part,
}: {
  isStreaming?: boolean;
  part: TextPartType;
}) {
  if (!part.text.trim() && part.state === "streaming") {
    return null;
  }

  return <MarkdownContent isStreaming={isStreaming} text={part.text} />;
});
