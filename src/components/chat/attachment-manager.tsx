"use client";

import type { ChangeEvent, RefObject } from "react";

import { CHAT_ATTACHMENT_ACCEPT } from "@/lib/files/chat-attachment-types";

import { AttachmentChip } from "./attachment-chip";
import type { ComposerAttachment } from "./chat-attachments";
import { ImagePreviewModal } from "./image-preview-modal";

type AttachmentManagerProps = {
  attachmentError: string;
  attachments: ComposerAttachment[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPreviewClose: () => void;
  onPreviewOpen: (attachment: ComposerAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  previewAttachment: ComposerAttachment | null;
};

export function AttachmentManager({
  attachmentError,
  attachments,
  fileInputRef,
  onFileInputChange,
  onPreviewClose,
  onPreviewOpen,
  onRemoveAttachment,
  previewAttachment,
}: AttachmentManagerProps) {
  return (
    <>
      <input
        accept={CHAT_ATTACHMENT_ACCEPT}
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={onFileInputChange}
        type="file"
      />

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
          {attachments.map((attachment) => (
            <AttachmentChip
              attachment={attachment}
              key={attachment.id}
              onPreview={() => onPreviewOpen(attachment)}
              onRemove={() => onRemoveAttachment(attachment.id)}
            />
          ))}
        </div>
      ) : null}

      {attachmentError ? (
        <div className="px-3 pb-1">
          <p className="text-danger-soft-foreground text-xs">
            {attachmentError}
          </p>
        </div>
      ) : null}

      {previewAttachment?.previewUrl ? (
        <ImagePreviewModal
          alt={previewAttachment.name}
          onClose={onPreviewClose}
          src={previewAttachment.previewUrl}
        />
      ) : null}
    </>
  );
}
