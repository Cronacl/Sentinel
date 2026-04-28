import type { FileUIPart } from "ai";
import { readFile } from "node:fs/promises";

import { buildActiveThreadMessages } from "@/lib/ai/messages/branches";
import { loadThreadMessages } from "@/lib/ai/chat/persistence";
import { readUploadedMediaUrl } from "@/lib/uploaded-media";

export type ReferenceImage = {
  data: Uint8Array;
  mediaType: string;
};

export const NULLISH_OPTIONAL_INPUT_VALUES = new Set([
  "n/a",
  "na",
  "no image",
  "no reference",
  "none",
  "null",
  "undefined",
]);

export function normalizeOptionalInputString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return NULLISH_OPTIONAL_INPUT_VALUES.has(trimmed.toLowerCase())
    ? undefined
    : trimmed;
}

export function preprocessOptionalInputString(value: unknown) {
  return typeof value === "string"
    ? normalizeOptionalInputString(value)
    : value;
}

function decodeDataUrl(url: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(url);
  if (!match?.[2]) {
    throw new Error("Invalid reference image data URL.");
  }

  return {
    data: Uint8Array.from(Buffer.from(match[2], "base64")),
    mediaType: match[1] || "image/png",
  };
}

function getReferenceImageParts(
  parts: readonly unknown[],
  filename: string,
): FileUIPart[] {
  return parts.filter(
    (part): part is FileUIPart =>
      typeof part === "object" &&
      part != null &&
      "type" in part &&
      part.type === "file" &&
      (("filename" in part ? part.filename : undefined) ?? "Attachment") ===
        filename,
  );
}

function getImageFileParts(parts: readonly unknown[]): FileUIPart[] {
  return parts.filter(
    (part): part is FileUIPart =>
      typeof part === "object" &&
      part != null &&
      "type" in part &&
      part.type === "file" &&
      "mediaType" in part &&
      typeof part.mediaType === "string" &&
      part.mediaType.startsWith("image/"),
  );
}

export async function resolveReferenceImage({
  attachmentIndex,
  filename,
  messageId,
  sourceMessageId,
  threadId,
}: {
  attachmentIndex?: number;
  filename?: string;
  messageId?: string;
  sourceMessageId?: string | null;
  threadId: string;
}): Promise<ReferenceImage | null> {
  const normalizedFilename = normalizeOptionalInputString(filename);
  if (!normalizedFilename) {
    return null;
  }

  const targetMessageId =
    normalizeOptionalInputString(messageId) || sourceMessageId || null;
  if (!targetMessageId) {
    throw new Error(
      "A source message is required to resolve the reference image attachment.",
    );
  }

  const transcript = buildActiveThreadMessages(
    await loadThreadMessages(threadId),
  );
  const message = transcript.find(
    (candidate) => candidate.id === targetMessageId,
  );

  if (!message) {
    throw new Error(
      `Message "${targetMessageId}" was not found in this thread.`,
    );
  }

  const imageParts = getImageFileParts(message.parts);
  if (imageParts.length === 0) {
    throw new Error(
      `Message "${targetMessageId}" does not contain any image attachments.`,
    );
  }

  const matchingParts = getReferenceImageParts(
    message.parts,
    normalizedFilename,
  );
  if (matchingParts.length === 0) {
    throw new Error(
      `Reference image attachment "${normalizedFilename}" was not found on message "${targetMessageId}".`,
    );
  }

  const selectedIndex = attachmentIndex != null ? attachmentIndex - 1 : 0;
  if (matchingParts.length > 1 && attachmentIndex == null) {
    throw new Error(
      `Reference image "${normalizedFilename}" appears multiple times on message "${targetMessageId}". Provide referenceImageAttachmentIndex to disambiguate.`,
    );
  }

  const selected = matchingParts[selectedIndex];
  if (!selected) {
    throw new Error(
      `referenceImageAttachmentIndex ${attachmentIndex} is out of range for "${normalizedFilename}".`,
    );
  }

  if (!selected.mediaType?.startsWith("image/")) {
    throw new Error(`Attachment "${normalizedFilename}" is not an image.`);
  }

  if (selected.url.startsWith("data:")) {
    return decodeDataUrl(selected.url);
  }

  const uploadedMedia = await readUploadedMediaUrl(selected.url);
  if (uploadedMedia) {
    return {
      data: Uint8Array.from(uploadedMedia.data),
      mediaType: selected.mediaType,
    };
  }

  if (/^https?:\/\//i.test(selected.url)) {
    throw new Error(
      `Attachment "${normalizedFilename}" is not stored locally, so it cannot be used as a reference image yet.`,
    );
  }

  return {
    data: Uint8Array.from(await readFile(selected.url)),
    mediaType: selected.mediaType,
  };
}
