"use client";

import {
  Add01Icon,
  AiIdeaIcon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  BrowserIcon,
  Cancel01Icon,
  ComputerIcon,
  DashboardSquare01Icon,
  Mic02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, ListBox, Popover, Switch } from "@heroui/react";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import type { ChatEngine } from "@/server/db/enums";
import type { SentinelComposerToolTag } from "@/lib/ai/chat/tools/selection/tags";
import {
  isUnstableChatEngine,
  UNSTABLE_CHAT_ENGINE_LABEL,
} from "@/components/chat/chat-composer-helpers";

import { ContextWindowIndicator } from "./chat-composer/context-window-indicator";

const NO_DISABLED_KEYS: string[] = [];
const PLAN_MODE_DISABLED_KEYS = ["plan-mode"];

type ComposerToolbarProps = {
  canSend: boolean;
  contextWindowIndicator?: {
    compactionEnabled: boolean;
    compactionWindowPercent: number;
    contextWindow: number;
    contextWindowMode: "fixed" | "model" | "provider";
    inputTokens: number;
    modelContextWindow?: number | null;
    usedPercent: number;
  } | null;
  engineOptions: Array<{
    engine: ChatEngine;
    error: string | null;
    isAvailable: boolean;
    label: string;
  }>;
  hasWorkspace: boolean;
  isBusy: boolean;
  isLocked: boolean;
  modelSelector: ReactNode;
  onPickFiles: () => void;
  onSelectEngine: (engine: ChatEngine) => void;
  onSend: () => void;
  onStop?: () => void;
  onStartVoiceInput?: () => void;
  onToggleToolTag: (tag: SentinelComposerToolTag) => void;
  onTogglePlanMode: () => void;
  planModeAvailable: boolean;
  planMode: boolean;
  selectedEngine: ChatEngine;
  selectedModelKey: string | null;
  showVoiceInput?: boolean;
  toolTags: SentinelComposerToolTag[];
  voiceInputDisabled?: boolean;
  showEngineSelector: boolean;
};

export const ComposerToolbar = memo(function ComposerToolbar({
  canSend,
  contextWindowIndicator,
  engineOptions,
  hasWorkspace,
  isBusy,
  isLocked,
  modelSelector,
  onPickFiles,
  onSelectEngine,
  onSend,
  onStop,
  onStartVoiceInput,
  onToggleToolTag,
  onTogglePlanMode,
  planModeAvailable,
  planMode,
  selectedEngine,
  selectedModelKey,
  showVoiceInput = false,
  toolTags,
  voiceInputDisabled = false,
  showEngineSelector,
}: ComposerToolbarProps) {
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [engineSubOpen, setEngineSubOpen] = useState(false);
  const disabledComposerActionKeys = planModeAvailable
    ? NO_DISABLED_KEYS
    : PLAN_MODE_DISABLED_KEYS;
  const disabledEngineKeys = useMemo(
    () =>
      engineOptions
        .filter((engine) => !engine.isAvailable && engine.engine !== "sentinel")
        .map((engine) => engine.engine),
    [engineOptions],
  );
  const selectedEngineKeys = useMemo(() => [selectedEngine], [selectedEngine]);
  const showSentinelToolTags = selectedEngine === "sentinel" && !planMode;
  const isToolTagSelected = useCallback(
    (tag: SentinelComposerToolTag) => toolTags.includes(tag),
    [toolTags],
  );

  return (
    <div className="flex h-7 items-center justify-between px-1">
      <div className="flex items-center gap-0.5">
        <Popover.Root
          isOpen={composerMenuOpen}
          onOpenChange={(open) => {
            setComposerMenuOpen(open);
            if (!open) setEngineSubOpen(false);
          }}
        >
          <Popover.Trigger>
            <Button
              className="flex h-[24px] w-[24px] min-w-0 items-center justify-center rounded-full p-0 text-muted transition-colors duration-150 ease-out hover:text-foreground"
              isDisabled={!hasWorkspace}
              size="sm"
              variant="ghost"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Add01Icon}
                size={16}
                strokeWidth={1.5}
              />
            </Button>
          </Popover.Trigger>

          <Popover.Content className="w-52" placement="top start">
            <Popover.Dialog className="p-1">
              <ListBox
                aria-label="Composer actions"
                disabledKeys={disabledComposerActionKeys}
                selectionMode="none"
                onAction={(key) => {
                  if (key === "attach-files") {
                    setComposerMenuOpen(false);
                    onPickFiles();
                  } else if (key === "plan-mode") {
                    setComposerMenuOpen(false);
                    onTogglePlanMode();
                  } else if (key === "engine") {
                    setEngineSubOpen((prev) => !prev);
                  }
                }}
              >
                <ListBox.Item
                  className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
                  id="attach-files"
                  textValue="Add photos & files"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Attachment01Icon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span>Add photos & files</span>
                </ListBox.Item>
                <ListBox.Item
                  className={`min-h-8 rounded-xl px-2 py-1.5 text-[13px] ${
                    planMode ? "text-[#3F8DD8]" : ""
                  }`}
                  id="plan-mode"
                  textValue="Plan mode"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={AiIdeaIcon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">Plan</span>
                  <div className="pointer-events-none">
                    <Switch
                      isDisabled={!planModeAvailable}
                      isSelected={planMode}
                      size="sm"
                    >
                      <Switch.Control>
                        <Switch.Thumb>
                          <Switch.Icon />
                        </Switch.Thumb>
                      </Switch.Control>
                    </Switch>
                  </div>
                </ListBox.Item>
                {showEngineSelector ? (
                  <ListBox.Item
                    className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
                    id="engine"
                    textValue="Engine"
                  >
                    <HugeiconsIcon
                      color="currentColor"
                      icon={DashboardSquare01Icon}
                      size={15}
                      strokeWidth={1.5}
                    />
                    <span className="flex-1">Engine</span>
                    <span className="flex items-center gap-1.5 text-[12px] capitalize text-foreground/60">
                      <span>{selectedEngine}</span>
                    </span>
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ArrowRight01Icon}
                      size={12}
                      strokeWidth={1.5}
                    />
                  </ListBox.Item>
                ) : null}
              </ListBox>

              {showEngineSelector && engineSubOpen ? (
                <div className="mt-1 border-t border-separator pt-1">
                  <ListBox
                    aria-label="Engine"
                    disabledKeys={disabledEngineKeys}
                    selectedKeys={selectedEngineKeys}
                    selectionMode="single"
                    onSelectionChange={(keys) => {
                      const key = [...keys][0];
                      if (key != null) {
                        onSelectEngine(String(key) as ChatEngine);
                        setEngineSubOpen(false);
                        setComposerMenuOpen(false);
                      }
                    }}
                  >
                    {engineOptions.map((engine) => (
                      <ListBox.Item
                        className="min-h-8 rounded-xl px-2 py-1.5 text-[13px]"
                        key={engine.engine}
                        id={engine.engine}
                        textValue={engine.label}
                      >
                        <span className="capitalize">{engine.label}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {isUnstableChatEngine(engine.engine) ? (
                            <span className="text-[10px] text-warning">
                              {UNSTABLE_CHAT_ENGINE_LABEL}
                            </span>
                          ) : null}
                          {!engine.isAvailable &&
                          engine.engine !== "sentinel" ? (
                            <span className="text-[10px] text-warning">
                              Unavailable
                            </span>
                          ) : null}
                        </span>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </div>
              ) : null}
            </Popover.Dialog>
          </Popover.Content>
        </Popover.Root>

        {modelSelector}

        {planMode ? (
          <div className="ml-1 inline-flex h-[24px] items-center gap-1.5 rounded-full bg-blue-500/10 py-0.5 pl-1.5 pr-2.5 text-[#3F8DD8] dark:bg-blue-500/10">
            <button
              aria-label="Exit plan mode"
              className="flex size-3 shrink-0 items-center justify-center rounded-full bg-[#3F8DD8] text-white dark:text-black transition-opacity duration-150 ease-out hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              onClick={onTogglePlanMode}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Cancel01Icon}
                size={8}
                strokeWidth={2}
              />
            </button>
            <span className="text-[12px] font-medium leading-none">Plan</span>
          </div>
        ) : null}

        {showSentinelToolTags ? (
          <div className="ml-1 flex items-center gap-1">
            {[
              {
                icon: BrowserIcon,
                label: "Browser",
                tag: "browser" as const,
              },
              {
                icon: ComputerIcon,
                label: "Computer",
                tag: "computer" as const,
              },
            ].map((item) => {
              const selected = isToolTagSelected(item.tag);

              return (
                <button
                  aria-label={`${selected ? "Disable" : "Enable"} ${item.label} Use tools`}
                  aria-pressed={selected}
                  className={`inline-flex h-[24px] items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-none transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                    selected
                      ? "border-[#3F8DD8]/40 bg-blue-500/10 text-[#3F8DD8]"
                      : "border-separator bg-transparent text-muted hover:bg-default/40 hover:text-foreground"
                  }`}
                  disabled={isLocked}
                  key={item.tag}
                  onClick={() => onToggleToolTag(item.tag)}
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={item.icon}
                    size={13}
                    strokeWidth={1.6}
                  />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {contextWindowIndicator ? (
          <ContextWindowIndicator
            compactionEnabled={contextWindowIndicator.compactionEnabled}
            compactionWindowPercent={
              contextWindowIndicator.compactionWindowPercent
            }
            contextWindow={contextWindowIndicator.contextWindow}
            contextWindowMode={contextWindowIndicator.contextWindowMode}
            inputTokens={contextWindowIndicator.inputTokens}
            isDisabled={isLocked || !selectedModelKey}
            usedPercent={contextWindowIndicator.usedPercent}
          />
        ) : null}

        {showVoiceInput ? (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-default/50 text-muted transition-colors duration-150 ease-out hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            disabled={voiceInputDisabled}
            onClick={onStartVoiceInput}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Mic02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </button>
        ) : null}

        {isBusy ? (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-default text-muted transition-colors duration-150 ease-out hover:text-foreground"
            onClick={onStop}
            type="button"
          >
            <svg fill="currentColor" height={11} viewBox="0 0 16 16" width={11}>
              <rect height={10} rx={2} width={10} x={3} y={3} />
            </svg>
          </button>
        ) : (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity duration-150 ease-out hover:opacity-[.85] disabled:cursor-not-allowed disabled:opacity-25"
            disabled={!canSend}
            onClick={onSend}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowUp02Icon}
              size={15}
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>
    </div>
  );
});
