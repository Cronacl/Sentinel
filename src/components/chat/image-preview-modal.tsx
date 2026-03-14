"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import type { ComposerAttachment } from "./chat-attachments";

type ImagePreviewModalProps = {
  attachment: ComposerAttachment;
  onClose: () => void;
};

export function ImagePreviewModal({
  attachment,
  onClose,
}: ImagePreviewModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onClick={onClose}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0 bg-overlay/90" />
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex max-h-[85vh] max-w-[85vw] flex-col items-center gap-3"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 0.95 }}
          onClick={(event) => event.stopPropagation()}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={attachment.name}
              className="max-h-[80vh] max-w-[80vw] object-contain"
              src={attachment.previewUrl}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-overlay-foreground/70">
              {attachment.name}
            </span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-default text-foreground transition-colors hover:bg-default-hover"
              onClick={onClose}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Cancel01Icon}
                size={16}
                strokeWidth={2}
              />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
