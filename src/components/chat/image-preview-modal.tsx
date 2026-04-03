"use client";

import { createPortal } from "react-dom";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";

import { useShortcutAction, useShortcutScope } from "@/lib/shortcuts/provider";

type ImagePreviewModalProps = {
  alt: string;
  onClose: () => void;
  src: string;
};

export function ImagePreviewModal({
  alt,
  onClose,
  src,
}: ImagePreviewModalProps) {
  const previewScope = useShortcutScope({
    kind: "overlay",
  });
  useShortcutAction("overlay.close", onClose, {
    scopeId: previewScope.id,
  });

  return createPortal(
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
          className="relative z-10 flex max-h-[60vh] max-w-[60vw] flex-col items-center gap-3"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 0.95 }}
          onClick={(event) => event.stopPropagation()}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={alt}
              className="max-h-[55vh] max-w-[55vw] object-contain"
              src={src}
            />
          </div>
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
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
