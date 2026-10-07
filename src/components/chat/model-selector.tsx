"use client";

import { type ReactNode, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  ListBox,
  Popover,
  ScrollShadow,
  Skeleton,
} from "@heroui/react";

import { EngineIcon } from "@/components/engines/descriptors";
import { ProviderIcon } from "@/components/icons/provider-icon";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  getReasoningEffortLabel,
  shouldHideOpenCodeAgentSelector,
  shouldHideOpenCodeTraitSelector,
  type ChatComposerModel,
} from "./chat-composer-helpers";

function ModelIcon({
  children,
  sizeClass,
}: {
  children: ReactNode;
  sizeClass: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${sizeClass}`}
    >
      {children}
    </span>
  );
}

type ModelSelectorProps = {
  availableModels: ChatComposerModel[];
  isLoading?: boolean;
  onSelectModel: (modelKey: string) => void;
  onSelectOpenCodeAgent: (agent: string | null) => void;
  onSelectOpenCodeVariant: (variant: string | null) => void;
  onSelectReasoningEffort: (effort: ReasoningEffort) => void;
  selectedOpenCodeAgent: string | null;
  selectedOpenCodeVariant: string | null;
  selectedModel: ChatComposerModel | null;
  selectedModelKey: string | null;
  selectedReasoningEffort: ReasoningEffort | null;
  supportedReasoningEfforts: ReasoningEffort[];
};

export function ModelSelector({
  availableModels,
  isLoading = false,
  onSelectModel,
  onSelectOpenCodeAgent,
  onSelectOpenCodeVariant,
  onSelectReasoningEffort,
  selectedOpenCodeAgent,
  selectedOpenCodeVariant,
  selectedModel,
  selectedModelKey,
  selectedReasoningEffort,
  supportedReasoningEfforts,
}: ModelSelectorProps) {
  const hasModels = availableModels.length > 0;
  const showLoadingState = isLoading && !hasModels;
  const supportsReasoning = supportedReasoningEfforts.length > 0;
  const openCodeTraits =
    selectedModel?.engine === "opencode" ? selectedModel.openCode : undefined;
  const openCodeAgentOptions = openCodeTraits?.agentOptions ?? [];
  const openCodeVariantOptions = openCodeTraits?.variantOptions ?? [];
  const showOpenCodeAgentSelector =
    openCodeAgentOptions.length > 0 &&
    !shouldHideOpenCodeAgentSelector(openCodeAgentOptions);
  const showOpenCodeVariantSelector =
    openCodeVariantOptions.length > 0 &&
    !shouldHideOpenCodeTraitSelector(openCodeVariantOptions);
  const [modelOpen, setModelOpen] = useState(false);
  const [openCodeAgentOpen, setOpenCodeAgentOpen] = useState(false);
  const [openCodeVariantOpen, setOpenCodeVariantOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Popover.Root isOpen={modelOpen} onOpenChange={setModelOpen}>
        <Popover.Trigger>
          <Button
            className="h-[24px] max-w-full justify-start gap-1 rounded-full px-1.5 text-muted transition-colors duration-150 ease-out hover:text-foreground disabled:opacity-30"
            isDisabled={!hasModels && !showLoadingState}
            size="sm"
            variant="ghost"
          >
            {showLoadingState ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Skeleton className="h-3.5 w-24 rounded-md" />
              </span>
            ) : (
              <span className="flex min-w-0 items-center">
                <span className="max-w-[148px] truncate text-[11px]">
                  {selectedModel?.displayName ?? selectedModelKey ?? "Model"}
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
        <Popover.Content className="w-56 rounded-[20px]" placement="top">
          <Popover.Dialog className="p-1">
            <ScrollShadow className="max-h-[240px]">
              {showLoadingState ? (
                <div className="space-y-2 p-1">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      className="flex items-center gap-2 rounded-xl px-2 py-2"
                      key={index}
                    >
                      <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                      <Skeleton className="h-4 flex-1 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : (
                <ListBox
                  aria-label="Model"
                  selectedKeys={selectedModelKey ? [selectedModelKey] : []}
                  selectionMode="single"
                  onSelectionChange={(keys) => {
                    const key = [...keys][0];
                    if (key != null) {
                      onSelectModel(String(key));
                      setModelOpen(false);
                    }
                  }}
                >
                  {availableModels.map((model) => (
                    <ModelSelectorItem key={model.modelId} model={model} />
                  ))}
                </ListBox>
              )}
            </ScrollShadow>
          </Popover.Dialog>
        </Popover.Content>
      </Popover.Root>

      {showOpenCodeAgentSelector ? (
        <OpenCodeTraitSelector
          ariaLabel="OpenCode agent"
          isOpen={openCodeAgentOpen}
          label="Agent"
          onOpenChange={setOpenCodeAgentOpen}
          onSelect={onSelectOpenCodeAgent}
          options={openCodeAgentOptions}
          placement="top"
          selectedValue={selectedOpenCodeAgent}
        />
      ) : null}

      {showOpenCodeVariantSelector ? (
        <OpenCodeTraitSelector
          ariaLabel="OpenCode variant"
          isOpen={openCodeVariantOpen}
          label="Mode"
          onOpenChange={setOpenCodeVariantOpen}
          onSelect={onSelectOpenCodeVariant}
          options={openCodeVariantOptions}
          placement="top"
          selectedValue={selectedOpenCodeVariant}
        />
      ) : null}

      {supportsReasoning ? (
        <Popover.Root isOpen={reasoningOpen} onOpenChange={setReasoningOpen}>
          <Popover.Trigger>
            <Button
              className="h-[24px] max-w-full justify-start gap-1 rounded-full px-1.5 text-muted transition-colors duration-150 ease-out hover:text-foreground"
              size="sm"
              variant="ghost"
            >
              <span className="truncate text-[11px]">
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
          <Popover.Content className="w-36 rounded-[20px]" placement="top">
            <Popover.Dialog className="p-1">
              <ListBox
                aria-label="Reasoning effort"
                selectedKeys={
                  selectedReasoningEffort ? [selectedReasoningEffort] : []
                }
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key != null) {
                    onSelectReasoningEffort(String(key) as ReasoningEffort);
                    setReasoningOpen(false);
                  }
                }}
              >
                {supportedReasoningEfforts.map((effort) => (
                  <ListBox.Item
                    className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
                    key={effort}
                    id={effort}
                    textValue={getReasoningEffortLabel(effort)}
                  >
                    <span className="whitespace-nowrap">
                      {getReasoningEffortLabel(effort)}
                    </span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Popover.Dialog>
          </Popover.Content>
        </Popover.Root>
      ) : null}
    </div>
  );
}

function OpenCodeTraitSelector({
  ariaLabel,
  isOpen,
  label,
  onOpenChange,
  onSelect,
  options,
  placement,
  selectedValue,
}: {
  ariaLabel: string;
  isOpen: boolean;
  label: string;
  onOpenChange: (isOpen: boolean) => void;
  onSelect: (value: string | null) => void;
  options: NonNullable<ChatComposerModel["openCode"]>["agentOptions"];
  placement: "top";
  selectedValue: string | null;
}) {
  const selectedOption =
    options.find((option) => option.value === selectedValue) ??
    options.find((option) => option.isDefault) ??
    options[0] ??
    null;

  return (
    <Popover.Root isOpen={isOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger>
        <Button
          className="h-[24px] max-w-full justify-start gap-1 rounded-full px-1.5 text-muted transition-colors duration-150 ease-out hover:text-foreground"
          size="sm"
          variant="ghost"
        >
          <span className="truncate text-[11px]">
            {label}: {selectedOption?.label ?? "Default"}
          </span>
          <HugeiconsIcon
            color="currentColor"
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={1.5}
          />
        </Button>
      </Popover.Trigger>
      <Popover.Content className="w-40 rounded-[20px]" placement={placement}>
        <Popover.Dialog className="p-1">
          <ListBox
            aria-label={ariaLabel}
            selectedKeys={selectedOption ? [selectedOption.value] : []}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              if (key != null) {
                onSelect(String(key));
                onOpenChange(false);
              }
            }}
          >
            {options.map((option) => (
              <ListBox.Item
                className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
                id={option.value}
                key={option.value}
                textValue={option.label}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  );
}

function ModelSelectorItem({ model }: { model: ChatComposerModel }) {
  return (
    <ListBox.Item
      className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
      id={model.modelId}
      key={model.modelId}
      textValue={model.displayName}
    >
      {model.provider ? (
        <ModelIcon sizeClass="h-[15px] w-[15px]">
          <ProviderIcon
            className="h-[15px] w-[15px] shrink-0"
            provider={model.provider}
          />
        </ModelIcon>
      ) : (
        <ModelIcon sizeClass="h-[15px] w-[15px]">
          <EngineIcon
            className="h-[15px] w-[15px] shrink-0"
            driver={model.engine}
          />
        </ModelIcon>
      )}
      <span className="truncate text-[13px]">{model.displayName}</span>
      <ListBox.ItemIndicator />
    </ListBox.Item>
  );
}
