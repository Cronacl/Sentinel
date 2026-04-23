"use client";

import { useCallback, useRef, useState } from "react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";

import type { QueuedFollowUpSummary } from "./chat-composer/types";
import { Button } from "@heroui/react";

type QueuedMessagesProps = {
  messages: QueuedFollowUpSummary[];
  onRemove: (id: string) => Promise<void> | void;
  onSteer: (id: string) => Promise<void> | void;
};

export function QueuedMessages({
  messages,
  onRemove,
  onSteer,
}: QueuedMessagesProps) {
  const [pendingActions, setPendingActions] = useState<
    Record<string, "removing" | "steering" | undefined>
  >({});
  const pendingActionsRef = useRef(pendingActions);
  const runMessageAction = useCallback(
    async (id: string, action: "removing" | "steering") => {
      if (pendingActionsRef.current[id]) {
        return;
      }

      pendingActionsRef.current = {
        ...pendingActionsRef.current,
        [id]: action,
      };
      setPendingActions(pendingActionsRef.current);
      try {
        if (action === "steering") {
          await onSteer(id);
        } else {
          await onRemove(id);
        }
      } catch {
        setPendingActions((current) => {
          const next = { ...current };
          delete next[id];
          pendingActionsRef.current = next;
          return next;
        });
      }
    },
    [onRemove, onSteer],
  );

  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 px-1 pb-1.5">
      <AnimatePresence initial={false}>
        {messages.map((message) => {
          const pendingAction = pendingActions[message.id];
          const isProcessing = message.status === "processing";
          const isDisabled = Boolean(pendingAction) || isProcessing;
          const statusLabel = pendingAction
            ? pendingAction === "steering"
              ? "Steering..."
              : "Removing..."
            : isProcessing
              ? "Starting..."
              : null;

          return (
            <motion.div
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-xl bg-background/50 border border-border/20 px-2.5 py-1.5"
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0 }}
              key={message.id}
              layout
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                {message.text}
              </span>
              {statusLabel ? (
                <span className="shrink-0 text-[11px] font-medium text-muted">
                  {statusLabel}
                </span>
              ) : null}

              <Button
                className="h-6"
                isDisabled={isDisabled}
                onClick={() => {
                  void runMessageAction(message.id, "steering");
                }}
                size="sm"
                variant="tertiary"
              >
                <svg
                  className="shrink-0"
                  fill="none"
                  height={9}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  width={9}
                >
                  <polyline points="9 10 4 15 9 20" />
                  <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                </svg>
                Steer
              </Button>

              <Button
                className="h-6 w-6 min-w-6 min-h-6"
                isDisabled={isDisabled}
                onClick={() => {
                  void runMessageAction(message.id, "removing");
                }}
                size="sm"
                type="button"
                variant="danger-soft"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Delete02Icon}
                  size={10}
                  strokeWidth={1.5}
                />
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
