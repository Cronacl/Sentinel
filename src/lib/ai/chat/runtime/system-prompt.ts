import type { ThreadPromptContext } from "../prompt-context";
import { buildSystemPrompt } from "./system-prompt-builder";

export function getSystemPrompt({
  personalization,
  promptContext,
}: {
  personalization: string;
  promptContext: ThreadPromptContext;
}): string {
  return buildSystemPrompt({
    personalization,
    promptContext,
  });
}
