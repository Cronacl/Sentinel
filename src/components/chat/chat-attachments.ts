"use client";

import type { FileUIPart } from "ai";

import {
  detectAttachmentType,
  inferAttachmentMimeType,
  type AttachmentDetectionResult,
} from "@/lib/files/chat-attachment-types";

export type ComposerAttachment = {
  file?: File;
  fileType: AttachmentDetectionResult;
  filePart?: FileUIPart;
  id: string;
  mimeType?: string;
  name: string;
  previewUrl?: string;
  size?: number;
};

export function isImageAttachment(
  attachment: Pick<ComposerAttachment, "fileType">,
) {
  return attachment.fileType.isImagePreviewable;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read attachment."));
    };

    reader.readAsDataURL(file);
  });
}

function dataUrlHasPayload(value: string) {
  const [, payload = ""] = value.split(",", 2);
  return payload.trim().length > 0;
}

export function createBrowserAttachments(files: File[]) {
  const accepted: ComposerAttachment[] = [];
  const rejected: File[] = [];

  for (const file of files) {
    const fileType = detectAttachmentType(file.name, file.type || undefined);

    if (!fileType.isSupportedInChat) {
      rejected.push(file);
      continue;
    }

    accepted.push({
      file,
      fileType,
      id: crypto.randomUUID(),
      mimeType: file.type || undefined,
      name: file.name,
      previewUrl: fileType.isImagePreviewable
        ? URL.createObjectURL(file)
        : undefined,
      size: file.size,
    });
  }

  return { accepted, rejected };
}

export function createComposerAttachmentFromFilePart(part: FileUIPart): ComposerAttachment {
  return {
    filePart: part,
    fileType: detectAttachmentType(
      part.filename ?? "Attachment",
      part.mediaType ?? undefined,
    ),
    id: crypto.randomUUID(),
    mimeType: part.mediaType,
    name: part.filename ?? "Attachment",
    previewUrl: part.mediaType?.startsWith("image/") ? part.url : undefined,
  };
}

export async function convertComposerAttachmentsToFileParts(
  attachments: ComposerAttachment[],
): Promise<FileUIPart[]> {
  const fileParts = await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.filePart) {
        return attachment.filePart;
      }

      if (!attachment.file) {
        return null;
      }

      const url = await fileToDataUrl(attachment.file);
      if (!dataUrlHasPayload(url)) {
        return null;
      }

      return {
        filename: attachment.name,
        mediaType:
          attachment.fileType.mediaType ??
          attachment.mimeType ??
          inferAttachmentMimeType(attachment.name),
        type: "file" as const,
        url,
      };
    }),
  );

  return fileParts.filter((part) => part !== null);
}
