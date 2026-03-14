"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";

import { ProviderIcon } from "@/components/icons/provider-icon";
import { getCompositeModelId } from "@/lib/ai/providers/model-selection";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  getReasoningEffortLabel,
  type ChatComposerModel,
} from "./chat-composer-helpers";

type ModelSelectorProps = {
  availableModels: ChatComposerModel[];
  isLoading: boolean;
  modelMenuOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement | null>;
  onModelMenuOpenChange: (open: boolean) => void;
  onReasoningMenuOpenChange: (open: boolean) => void;
  onSelectModel: (modelKey: string) => void;
  onSelectReasoningEffort: (effort: ReasoningEffort) => void;
  reasoningLabel: string | null;
  reasoningMenuOpen: boolean;
  reasoningMenuRef: RefObject<HTMLDivElement | null>;
  selectedModel: ChatComposerModel | null;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  supportedReasoningEfforts: ReasoningEffort[];
};

export function ModelSelector({
  availableModels,
  isLoading,
  modelMenuOpen,
  modelMenuRef,
  onModelMenuOpenChange,
  onReasoningMenuOpenChange,
  onSelectModel,
  onSelectReasoningEffort,
  reasoningLabel,
  reasoningMenuOpen,
  reasoningMenuRef,
  selectedModel,
  selectedModelKey,
  selectedReasoningEffort,
  supportedReasoningEfforts,
}: ModelSelectorProps) {
  const supportsReasoning = supportedReasoningEfforts.length > 0;

  return (
    <>
      <div className="relative ml-1" ref={modelMenuRef}>
        <button
          className="flex h-8 cursor-pointer items-center gap-1 rounded-xl border border-border/50 bg-background px-2 text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground disabled:opacity-30 dark:border-border/80"
          disabled={availableModels.length === 0 || isLoading}
          onClick={() => onModelMenuOpenChange(!modelMenuOpen)}
          type="button"
        >
          {isLoading ? (
            <Spinner color="current" size="sm" />
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              {selectedModel ? (
                <ProviderIcon
                  className="h-3 w-3"
                  provider={selectedModel.provider}
                />
              ) : null}
              <span className="max-w-[160px] truncate">
                {selectedModel?.displayName ?? "No model"}
              </span>
            </span>
          )}
          <HugeiconsIcon
            className={`transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
            color="currentColor"
            icon={ArrowDown01Icon}
            size={11}
            strokeWidth={1.5}
          />
        </button>

        <AnimatePresence>
          {modelMenuOpen ? (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute bottom-10 left-0 z-30 max-h-[280px] w-48 overflow-y-auto rounded-2xl border border-border bg-overlay p-1 shadow-overlay"
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{
                duration: 0.15,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {availableModels.map((model) => {
                const modelKey = getCompositeModelId(
                  model.provider,
                  model.modelId,
                );
                const isSelected = selectedModelKey === modelKey;

                return (
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-default text-foreground"
                        : "text-muted hover:bg-default hover:text-foreground"
                    }`}
                    key={modelKey}
                    onClick={() => onSelectModel(modelKey)}
                    type="button"
                  >
                    <ProviderIcon
                      className="h-4 w-4"
                      provider={model.provider}
                    />
                    <span className="truncate text-[13px]">
                      {model.displayName}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {supportsReasoning ? (
        <div className="relative" ref={reasoningMenuRef}>
          <button
            className="flex h-8 cursor-pointer items-center gap-1 rounded-xl border border-border/50 bg-background px-2 text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground dark:border-border/80"
            onClick={() => onReasoningMenuOpenChange(!reasoningMenuOpen)}
            type="button"
          >
            <span>{reasoningLabel ?? "Medium"}</span>
            <HugeiconsIcon
              className={`transition-transform ${reasoningMenuOpen ? "rotate-180" : ""}`}
              color="currentColor"
              icon={ArrowDown01Icon}
              size={11}
              strokeWidth={1.5}
            />
          </button>

          <AnimatePresence>
            {reasoningMenuOpen ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute bottom-10 -left-5 z-30 w-24 overflow-hidden rounded-2xl border border-border bg-overlay p-1 shadow-overlay"
                exit={{ opacity: 0, scale: 0.97, y: 6 }}
                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{
                  duration: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {supportedReasoningEfforts.map((effort) => {
                  const isSelected = selectedReasoningEffort === effort;

                  return (
                    <button
                      className={`flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-default text-foreground"
                          : "text-muted hover:bg-default hover:text-foreground"
                      }`}
                      key={effort}
                      onClick={() => onSelectReasoningEffort(effort)}
                      type="button"
                    >
                      {getReasoningEffortLabel(effort)}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </>
  );
}
