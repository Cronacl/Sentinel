"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, ListBox, Popover, ScrollShadow, Spinner } from "@heroui/react";

import { ProviderIcon } from "@/components/icons/provider-icon";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  getReasoningEffortLabel,
  type ChatComposerModel,
} from "./chat-composer-helpers";

type ModelSelectorProps = {
  availableModels: ChatComposerModel[];
  isLoading: boolean;
  onSelectModel: (modelKey: string) => void;
  onSelectReasoningEffort: (effort: ReasoningEffort) => void;
  selectedModel: ChatComposerModel | null;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  supportedReasoningEfforts: ReasoningEffort[];
};

export function ModelSelector({
  availableModels,
  isLoading,
  onSelectModel,
  onSelectReasoningEffort,
  selectedModel,
  selectedModelKey,
  selectedReasoningEffort,
  supportedReasoningEfforts,
}: ModelSelectorProps) {
  const supportsReasoning = supportedReasoningEfforts.length > 0;

  return (
    <>
      <Popover.Root>
        <Popover.Trigger>
          <Button
            className="h-8 gap-1 rounded-xl border border-border/50 bg-background px-2.5 text-[13px] text-muted shadow-none hover:bg-default hover:text-foreground disabled:opacity-30"
            isDisabled={availableModels.length === 0 || isLoading}
            size="sm"
            variant="ghost"
          >
            {isLoading ? (
              <Spinner color="current" size="sm" />
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {selectedModel?.provider ? (
                  <ProviderIcon
                    className="size-3"
                    provider={selectedModel.provider}
                  />
                ) : selectedModel?.engine === "codex" ? (
                  <ProviderIcon className="size-3" provider="openai" />
                ) : null}
                <span className="max-w-[160px] truncate">
                  {selectedModel?.displayName ?? "No model"}
                </span>
              </span>
            )}
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowDown01Icon}
              size={10}
              strokeWidth={1.5}
            />
          </Button>
        </Popover.Trigger>
        <Popover.Content
          className="w-56 border border-border/20 bg-overlay p-0 shadow-overlay/5"
          placement="top"
        >
          <Popover.Dialog className="p-1">
            <ScrollShadow className="max-h-[240px]">
              <ListBox
                aria-label="Model"
                selectedKeys={selectedModelKey ? [selectedModelKey] : []}
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key != null) onSelectModel(String(key));
                }}
              >
                {availableModels.map((model) => (
                  <ListBox.Item
                    key={model.modelId}
                    id={model.modelId}
                    textValue={model.displayName}
                  >
                    {model.provider ? (
                      <ProviderIcon
                        className="size-4"
                        provider={model.provider}
                      />
                    ) : model.engine === "codex" ? (
                      <ProviderIcon className="size-4" provider="openai" />
                    ) : (
                      <span className="w-4 text-center text-[10px] font-medium uppercase text-foreground/60">
                        {model.engine.slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate text-[13px]">
                      {model.displayName}
                    </span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ScrollShadow>
          </Popover.Dialog>
        </Popover.Content>
      </Popover.Root>

      {supportsReasoning ? (
        <Popover.Root>
          <Popover.Trigger>
            <Button
              className="h-8 gap-1 rounded-xl border border-border/50 bg-background px-2.5 text-[13px] text-muted shadow-none hover:bg-default hover:text-foreground"
              size="sm"
              variant="ghost"
            >
              <span>
                {selectedReasoningEffort
                  ? getReasoningEffortLabel(selectedReasoningEffort)
                  : "Medium"}
              </span>
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowDown01Icon}
                size={10}
                strokeWidth={1.5}
              />
            </Button>
          </Popover.Trigger>
          <Popover.Content
            className="w-28 border border-border/20 bg-overlay p-0 shadow-overlay/5"
            placement="top"
          >
            <Popover.Dialog className="p-1">
              <ListBox
                aria-label="Reasoning effort"
                selectedKeys={
                  selectedReasoningEffort ? [selectedReasoningEffort] : []
                }
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key != null)
                    onSelectReasoningEffort(String(key) as ReasoningEffort);
                }}
              >
                {supportedReasoningEfforts.map((effort) => (
                  <ListBox.Item
                    key={effort}
                    id={effort}
                    textValue={getReasoningEffortLabel(effort)}
                  >
                    {getReasoningEffortLabel(effort)}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Popover.Dialog>
          </Popover.Content>
        </Popover.Root>
      ) : null}
    </>
  );
}
