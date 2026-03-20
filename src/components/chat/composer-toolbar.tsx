"use client";

import {
  Add01Icon,
  AiIdeaIcon,
  ArrowUp02Icon,
  Attachment01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Switch } from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, RefObject } from "react";

import { ContextWindowIndicator } from "./chat-composer/context-window-indicator";

type ComposerToolbarProps = {
  composerMenuOpen: boolean;
  composerMenuRef: RefObject<HTMLDivElement | null>;
  contextWindowIndicator?: {
    compactionEnabled: boolean;
    compactionWindowPercent: number;
    contextWindow: number;
    contextWindowMode: "fixed" | "model";
    inputTokens: number;
    usedPercent: number;
  } | null;
  hasWorkspace: boolean;
  isBusy: boolean;
  isLocked: boolean;
  modelSelector: ReactNode;
  onComposerMenuOpenChange: (open: boolean) => void;
  onPickFiles: () => void;
  onSend: () => void;
  onStop?: () => void;
  onTogglePlanMode: () => void;
  planMode: boolean;
  selectedModelKey: string | null;
};

export function ComposerToolbar({
  composerMenuOpen,
  composerMenuRef,
  contextWindowIndicator,
  hasWorkspace,
  isBusy,
  isLocked,
  modelSelector,
  onComposerMenuOpenChange,
  onPickFiles,
  onSend,
  onStop,
  onTogglePlanMode,
  planMode,
  selectedModelKey,
}: ComposerToolbarProps) {
  return (
    <div className="flex h-10 items-center justify-between px-1.5">
      <div className="flex items-center gap-2">
        <div className="relative" ref={composerMenuRef}>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-border/50 bg-surface text-muted transition-colors hover:text-foreground disabled:opacity-30 dark:bg-background"
            disabled={!hasWorkspace}
            onClick={() => onComposerMenuOpenChange(!composerMenuOpen)}
            type="button"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Add01Icon}
              size={18}
              strokeWidth={1.5}
            />
          </button>

          <AnimatePresence>
            {composerMenuOpen ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute bottom-10 left-0 z-30 w-48 rounded-xl border border-border bg-overlay p-1 shadow-overlay"
                exit={{ opacity: 0, scale: 0.97, y: 6 }}
                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{
                  duration: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1 text-left text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground"
                  onClick={() => {
                    onComposerMenuOpenChange(false);
                    onPickFiles();
                  }}
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Attachment01Icon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span>Add photos & files</span>
                </button>

                <div className="mx-2 my-0.5 h-px bg-separator" />

                <button
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left text-[13px] text-muted transition-colors hover:bg-default hover:text-foreground"
                  onClick={onTogglePlanMode}
                  type="button"
                >
                  <span className="flex items-center gap-2.5">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={AiIdeaIcon}
                      size={15}
                      strokeWidth={1.5}
                    />
                    <span>Plan mode</span>
                  </span>

                  <Switch
                    size="sm"
                    isSelected={planMode}
                    // @ts-expect-error - onValueChange is not a valid prop for SwitchRootProps
                    onValueChange={onTogglePlanMode as any}
                  >
                    <Switch.Control>
                      <Switch.Thumb>
                        <Switch.Icon />
                      </Switch.Thumb>
                    </Switch.Control>
                  </Switch>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

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
            disabled={isLocked || !selectedModelKey}
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
}
