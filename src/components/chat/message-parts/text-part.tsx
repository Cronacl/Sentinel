"use client";

import type { TextPart as TextPartType } from "./types";
import { MarkdownContent } from "./markdown-content";

export function TextPart({ part }: { part: TextPartType }) {
  if (!part.text.trim() && part.state === "streaming") {
    return null;
  }

  return <MarkdownContent text={part.text} />;
}
