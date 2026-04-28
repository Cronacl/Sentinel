import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import {
  getModelAttachmentCapabilities,
  type ModelAttachmentCapabilities,
} from "@/lib/ai/providers/models";

import {
  FORCE_NORMALIZED_DOCUMENT_EXTENSIONS,
  getLowercaseExtension,
} from "./formats";
import { loadInlineAttachmentDocument } from "./loader";
import { materializeUploadedMediaUrlAsDataUrl } from "@/lib/uploaded-media";

const DEFAULT_BOOTSTRAP_DOCUMENT_MAX_CHARS = 20_000;
const FORCE_NORMALIZED_DOCUMENT_MEDIA_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/csv",
]);

function shouldPassthroughFile(input: {
  capabilities: ModelAttachmentCapabilities;
  filename: string;
  mediaType: string;
  providerId: Parameters<typeof getModelAttachmentCapabilities>[0];
}) {
  const extension = getLowercaseExtension(input.filename);
  const normalizedMediaType = input.mediaType.trim().toLowerCase();

  if (
    FORCE_NORMALIZED_DOCUMENT_EXTENSIONS.has(extension) ||
    FORCE_NORMALIZED_DOCUMENT_MEDIA_TYPES.has(normalizedMediaType)
  ) {
    return false;
  }

  if (
    (input.providerId === "google" || input.providerId === "google_vertex") &&
    (extension === "json" || normalizedMediaType === "application/json")
  ) {
    return false;
  }

  if (normalizedMediaType.startsWith("image/")) {
    return input.capabilities.supportsImages;
  }

  if (extension === "pdf" || normalizedMediaType === "application/pdf") {
    return input.capabilities.supportsPdf;
  }

  const textExtensions = new Set([
    "txt",
    "md",
    "json",
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "css",
    "html",
    "xml",
    "yaml",
    "yml",
    "toml",
    "sql",
    "sh",
  ]);

  if (
    textExtensions.has(extension) ||
    normalizedMediaType === "application/json" ||
    normalizedMediaType.startsWith("text/")
  ) {
    return false;
  }

  return false;
}

export async function normalizeTranscriptDocumentsForModel(input: {
  maxCharsPerDocument?: number;
  messages: ThreadUIMessage[];
  providerId: Parameters<typeof getModelAttachmentCapabilities>[0];
  responseModelId: string;
}) {
  const capabilities = getModelAttachmentCapabilities(
    input.providerId,
    input.responseModelId,
  );
  const maxChars =
    input.maxCharsPerDocument ?? DEFAULT_BOOTSTRAP_DOCUMENT_MAX_CHARS;

  return await Promise.all(
    input.messages.map(async (message) => {
      const nextParts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }

          if (
            shouldPassthroughFile({
              capabilities,
              filename: part.filename ?? "attachment",
              mediaType: part.mediaType,
              providerId: input.providerId,
            })
          ) {
            const materializedUrl = await materializeUploadedMediaUrlAsDataUrl({
              mediaType: part.mediaType,
              url: part.url,
            });

            return materializedUrl ? { ...part, url: materializedUrl } : part;
          }

          const loaded = await loadInlineAttachmentDocument({
            filename: part.filename ?? "attachment",
            maxChars,
            mediaType: part.mediaType,
            sourceKind: "message_attachment",
            url: part.url,
          });

          return {
            text: [
              `Attached document: ${loaded.filename}`,
              `Source: ${loaded.sourceKind}`,
              `Format: ${loaded.format}`,
              `Media type: ${loaded.mediaType}`,
              ...(loaded.sheetNames?.length
                ? [`Sheets: ${loaded.sheetNames.join(", ")}`]
                : []),
              ...(loaded.slideCount !== undefined
                ? [`Slides: ${loaded.slideCount}`]
                : []),
              ...(loaded.warnings.length > 0
                ? [`Warnings: ${loaded.warnings.join(" | ")}`]
                : []),
              "",
              loaded.content,
            ].join("\n"),
            type: "text" as const,
          };
        }),
      );

      return {
        ...message,
        parts: nextParts,
      } satisfies ThreadUIMessage;
    }),
  );
}

export const __internal = {
  DEFAULT_BOOTSTRAP_DOCUMENT_MAX_CHARS,
  shouldPassthroughFile,
};
