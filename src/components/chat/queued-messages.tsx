"use client";

import {
  Delete02Icon,
  MessageMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";

import type { QueuedFollowUpSummary } from "./chat-composer/types";
import { Button } from "@heroui/react";

type QueuedMessagesProps = {
  messages: QueuedFollowUpSummary[];
  onRemove: (id: string) => void;
  onSteer: (id: string) => void;
};

export function QueuedMessages({
  messages,
  onRemove,
  onSteer,
}: QueuedMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 px-1 pb-1.5">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
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

            <Button
              onClick={() => onSteer(message.id)}
              size="sm"
              variant="tertiary"
              className="h-6"
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
              onClick={() => onRemove(message.id)}
              type="button"
              size="sm"
              variant="danger-soft"
              className="h-6 w-6 min-w-6 min-h-6"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Delete02Icon}
                size={10}
                strokeWidth={1.5}
              />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
