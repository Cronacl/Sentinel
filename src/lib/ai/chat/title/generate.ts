import { generateText } from "ai";

import { lines } from "@/lib/prompt";

import type { ResolvedThreadTitleModel } from "../types";

const TITLE_SYSTEM_PROMPT = lines(
  "Generate a concise chat thread title of 2 to 6 words.",
  "Return only the title text with no quotes, markdown, labels, or trailing punctuation.",
);

function sanitizeGeneratedTitle(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  const withoutQuotes = singleLine.replace(/^["'`]+|["'`]+$/g, "").trim();
  const trimmed = withoutQuotes.replace(/[.?!,:;\-–—]+$/g, "").trim();

  return trimmed.slice(0, 120);
}

/**
 * Generates a concise thread title from the first user message without
 * affecting the main assistant response stream.
 */
export async function generateThreadTitle({
  firstUserText,
  model,
}: {
  firstUserText: string;
  model: ResolvedThreadTitleModel;
}) {
  const result = await generateText({
    model: model.languageModel as Parameters<typeof generateText>[0]["model"],
    prompt: firstUserText,
    system: TITLE_SYSTEM_PROMPT,
    temperature: 0.2,
    ...(model.providerOptions ? { providerOptions: model.providerOptions } : {}),
  });

  const title = sanitizeGeneratedTitle(result.text);
  return title.length > 0 ? title : null;
}
