"use client";

import {
  Add01Icon,
  AiIdeaIcon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  DashboardSquare01Icon,
  Mic01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, ListBox, Popover, Switch } from "@heroui/react";
import { memo, useMemo, useState, type ReactNode } from "react";

import type { ChatEngine } from "@/server/db/enums";
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
  onTogglePlanMode: () => void;
  planModeAvailable: boolean;
  planMode: boolean;
  selectedEngine: ChatEngine;
  selectedModelKey: string | null;
  showVoiceInput?: boolean;
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
  onTogglePlanMode,
  planModeAvailable,
  planMode,
  selectedEngine,
  selectedModelKey,
  showVoiceInput = false,
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

  return (
    <div className="flex h-8 items-center justify-between px-1.5">
      <div className="flex items-center gap-1">
        <Popover.Root
          isOpen={composerMenuOpen}
          onOpenChange={(open) => {
            setComposerMenuOpen(open);
            if (!open) setEngineSubOpen(false);
          }}
        >
          <Popover.Trigger>
            <Button
              className="h-8 w-8 min-w-0 rounded-2xl border border-border dark:border-border/20 bg-surface dark:bg-background/80 p-0 text-muted transition-colors hover:text-foreground dark:bg-background"
              isDisabled={!hasWorkspace}
              size="sm"
              variant="ghost"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Add01Icon}
                size={18}
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
                <ListBox.Item id="attach-files" textValue="Add photos & files">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Attachment01Icon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span>Add photos & files</span>
                </ListBox.Item>
                <ListBox.Item id="plan-mode" textValue="Plan mode">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={AiIdeaIcon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">Plan mode</span>
                  <div className="pointer-events-none">
                    <Switch
                      size="sm"
                      isDisabled={!planModeAvailable}
                      isSelected={planMode}
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
                  <ListBox.Item id="engine" textValue="Engine">
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
          <div className="ml-1 flex items-center gap-1 border-l border-border/50 pl-2">
            <HugeiconsIcon
              className="text-foreground"
              color="currentColor"
              icon={AiIdeaIcon}
              size={13}
              strokeWidth={1.5}
            />
            <span className="text-[13px] text-foreground">Plan</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
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
            className="flex h-8 w-8 items-center justify-center rounded-full bg-default text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            disabled={voiceInputDisabled}
            onClick={onStartVoiceInput}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Mic01Icon}
              size={16}
              strokeWidth={1.5}
            />
          </button>
        ) : null}

        {isBusy ? (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-default text-muted transition-colors hover:text-foreground"
            onClick={onStop}
            type="button"
          >
            <svg fill="currentColor" height={12} viewBox="0 0 16 16" width={12}>
              <rect height={10} rx={2} width={10} x={3} y={3} />
            </svg>
          </button>
        ) : (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-25"
            disabled={!canSend}
            onClick={onSend}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowUp02Icon}
              size={16}
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>
    </div>
  );
});
