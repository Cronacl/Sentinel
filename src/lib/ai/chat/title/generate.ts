import { generateText } from "ai";

import { lines } from "@/lib/prompt";

import type { ResolvedThreadTitleModel } from "../types";

export const TITLE_SYSTEM_PROMPT = lines(
  "Generate a concise, specific chat thread title of 2 to 6 words.",
  "Base the title only on the first user message that is provided.",
  "Use concrete nouns from the request so the title is easy to scan later.",
  "Prefer the actual feature, bug, file area, product surface, or topic over generic phrasing.",
  "Avoid filler such as Help, Question, Task, Chat, Please, Need to, or Can you.",
  "If the request is about fixing or debugging, name the broken area rather than saying Fix or Debug.",
  "If the request is about building or creating something, name the artifact or feature directly.",
  "If the message is brief, vague, or just a greeting, return a neutral title based on the visible text.",
  "Never ask for more context, never mention that the message is too generic or vague, and never explain your reasoning.",
  "Return only the title text with no quotes, markdown, labels, or trailing punctuation.",
);

export function buildTitlePrompt(firstUserText: string) {
  return lines(
    "First user message:",
    firstUserText,
    "",
    "Generate the best thread title now.",
  );
}

function sanitizeGeneratedTitle(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  const withoutLabel = singleLine
    .replace(/^(title|thread title)\s*:\s*/i, "")
    .trim();
  const withoutQuotes = withoutLabel.replace(/^["'`]+|["'`]+$/g, "").trim();
  const trimmed = withoutQuotes.replace(/[.?!,:;\-–—]+$/g, "").trim();

  return trimmed.slice(0, 120);
}

function isMetaTitleResponse(value: string) {
  return /(?:too generic|too vague|provide more context|need more context|insufficient context|not enough context|more detail(?:s)? needed|cannot determine|can't determine)/i.test(
    value,
  );
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
    prompt: buildTitlePrompt(firstUserText),
    system: TITLE_SYSTEM_PROMPT,
    temperature: 0.2,
    ...(model.providerOptions ? { providerOptions: model.providerOptions } : {}),
  });

  const title = sanitizeGeneratedTitle(result.text);
  if (isMetaTitleResponse(title)) {
    return null;
  }

  return title.length > 0 ? title : null;
}
