"use client";

import {
  detectAttachmentType,
  getAttachmentIcon,
  getAttachmentTone,
} from "@/lib/files/chat-attachment-types";
import { AttachmentIcon } from "@/components/chat/attachment-icon";

import type { FilePart as FilePartType } from "./types";

function isImageFile(part: FilePartType) {
  return part.mediaType.startsWith("image/");
}

export function FilePart({
  part,
  variant = "default",
}: {
  part: FilePartType;
  variant?: "default" | "grid";
}) {
  const detectedType = detectAttachmentType(
    part.filename ?? "Attachment",
    part.mediaType,
  );
  const attachmentIcon = getAttachmentIcon(detectedType);
  const attachmentTone = getAttachmentTone(detectedType.displayType);

  if (isImageFile(part)) {
    if (variant === "grid") {
      return (
        <a
          className="group relative block aspect-square w-[9.5rem] overflow-hidden rounded-[1.45rem] bg-black/20 sm:w-[10.5rem]"
          download={part.filename}
          href={part.url}
          rel="noreferrer"
          target="_blank"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={part.filename ?? "Attachment"}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
            src={part.url}
          />
        </a>
      );
    }

    return (
      <a
        className="group block overflow-hidden rounded-2xl border border-border/70 bg-background/70"
        download={part.filename}
        href={part.url}
        rel="noreferrer"
        target="_blank"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={part.filename ?? "Attachment"}
          className="max-h-80 w-full object-cover transition-transform group-hover:scale-[1.01]"
          src={part.url}
        />
        {part.filename ? (
          <div className="border-t border-border/60 px-3 py-2 text-xs text-muted">
            {part.filename}
          </div>
        ) : null}
      </a>
    );
  }

  if (variant === "grid") {
    return (
      <a
        className="flex aspect-square w-[9.5rem] flex-col justify-between rounded-[1.45rem] bg-white/[0.045] p-3.5 text-left transition-colors hover:bg-white/[0.06] sm:w-[10.5rem]"
        download={part.filename}
        href={part.url}
        rel="noreferrer"
        target="_blank"
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${attachmentTone.backgroundClassName} ${attachmentTone.textClassName}`}
        >
          <AttachmentIcon icon={attachmentIcon} size={18} />
        </div>
        <div className="space-y-1">
          <p className="max-h-10 overflow-hidden text-[13px] leading-5 text-foreground/88">
            {part.filename ?? "Attachment"}
          </p>
          <p className="truncate text-[11px] text-foreground/42">
            {detectedType.label}
          </p>
        </div>
      </a>
    );
  }

  return (
    <a
      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-default/35 px-3 py-3 transition-colors hover:bg-default/50"
      download={part.filename}
      href={part.url}
      rel="noreferrer"
      target="_blank"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${attachmentTone.backgroundClassName} ${attachmentTone.textClassName}`}
      >
        <AttachmentIcon icon={attachmentIcon} size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">
          {part.filename ?? "Attachment"}
        </p>
        <p className="truncate text-xs text-muted">{detectedType.label}</p>
      </div>
    </a>
  );
}
