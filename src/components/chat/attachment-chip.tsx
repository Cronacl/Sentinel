"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  getAttachmentIcon,
  getAttachmentTone,
} from "@/lib/files/chat-attachment-types";

import { AttachmentIcon } from "./attachment-icon";
import { isImageAttachment, type ComposerAttachment } from "./chat-attachments";

type AttachmentChipProps = {
  attachment: ComposerAttachment;
  onPreview: () => void;
  onRemove: () => void;
};

export function AttachmentChip({
  attachment,
  onPreview,
  onRemove,
}: AttachmentChipProps) {
  const isImage = isImageAttachment(attachment);
  const attachmentIcon = getAttachmentIcon(attachment.fileType);
  const attachmentTone = getAttachmentTone(attachment.fileType.displayType);

  return (
    <div
      role="button"
      onClick={isImage && attachment.previewUrl ? onPreview : undefined}
      className="group relative flex max-w-[200px] cursor-pointer items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-xs transition-colors hover:bg-surface"
    >
      <div className="flex shrink-0 items-center justify-center">
        {isImage && attachment.previewUrl ? (
          <div className="h-6 w-6 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="h-full w-full object-cover"
              src={attachment.previewUrl}
            />
          </div>
        ) : (
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full ${attachmentTone.backgroundClassName} ${attachmentTone.textClassName}`}
          >
            <AttachmentIcon icon={attachmentIcon} size={12} strokeWidth={1.9} />
          </div>
        )}
      </div>
      {!isImage ? (
        <span className="rounded-full bg-default px-1.5 py-0.5 text-[10px] text-muted">
          {attachment.fileType.label}
        </span>
      ) : null}
      <span className="min-w-0 truncate text-muted">{attachment.name}</span>
      <button
        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-surface text-foreground group-hover:flex"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={Cancel01Icon}
          size={10}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}
