import { getExactContextWindowUsage } from "@/lib/ai/chat/context/context-window";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { ChatEngine } from "@/server/db/enums";

// Codex compacts its own context; Sentinel's compaction threshold does not
// apply, so the ring turns amber at a fixed share of the window instead.
export const CODEX_CONTEXT_WARNING_PERCENT = 80;

export type ComposerContextWindowIndicator = {
  compactionEnabled: boolean;
  compactionNote?: string;
  compactionWindowPercent: number;
  contextWindow: number;
  contextWindowMode: "fixed" | "model" | "provider";
  inputTokens: number;
  modelContextWindow?: number | null;
  usedPercent: number;
};

type ContextCompactionSettings = {
  contextCompactionEnabled?: boolean;
  contextCompactionFixedWindowSize?: number | null;
  contextCompactionUseFixedWindow?: boolean;
  contextCompactionWindowPercent?: number;
};

/**
 * Builds the composer's context-window indicator.
 *
 * - Sentinel: model window (or the fixed compaction window from settings).
 * - Codex: the window Codex reports in `thread/tokenUsage/updated`, stored on
 *   the latest completed assistant message. Codex models carry no window in
 *   Sentinel's catalog, so without a reported window nothing is shown rather
 *   than a guessed default. Sentinel's compaction settings do not apply.
 * - Other engines: none.
 */
export function resolveComposerContextWindowIndicator(input: {
  engine: ChatEngine;
  generalSettings?: ContextCompactionSettings | null;
  hasSelectedModel: boolean;
  messages: ThreadUIMessage[];
  modelContextWindow?: number | null;
}): ComposerContextWindowIndicator | null {
  if (!input.hasSelectedModel) {
    return null;
  }

  if (input.engine === "sentinel") {
    const usage = getExactContextWindowUsage({
      contextWindow: input.modelContextWindow,
      fixedWindowSize: input.generalSettings?.contextCompactionFixedWindowSize,
      messages: input.messages,
      useFixedWindow: input.generalSettings?.contextCompactionUseFixedWindow,
    });
    if (!usage) {
      return null;
    }

    return {
      compactionEnabled:
        input.generalSettings?.contextCompactionEnabled ?? false,
      compactionWindowPercent:
        input.generalSettings?.contextCompactionWindowPercent ?? 70,
      contextWindow: usage.contextWindow,
      contextWindowMode: usage.source,
      inputTokens: usage.inputTokens,
      modelContextWindow: input.modelContextWindow,
      usedPercent: usage.usedPercent,
    };
  }

  if (input.engine === "codex") {
    const usage = getExactContextWindowUsage({
      contextWindow: input.modelContextWindow,
      messages: input.messages,
      useFixedWindow: false,
    });
    if (
      !usage ||
      (usage.source !== "provider" &&
        !(input.modelContextWindow && input.modelContextWindow > 0))
    ) {
      return null;
    }

    return {
      compactionEnabled: true,
      compactionNote: "Codex compacts its own context when the window fills.",
      compactionWindowPercent: CODEX_CONTEXT_WARNING_PERCENT,
      contextWindow: usage.contextWindow,
      contextWindowMode: usage.source,
      inputTokens: usage.inputTokens,
      modelContextWindow: input.modelContextWindow,
      usedPercent: usage.usedPercent,
    };
  }

  return null;
}
