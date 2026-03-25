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

const DEFAULT_BOOTSTRAP_DOCUMENT_MAX_CHARS = 20_000;

function shouldPassthroughFile(input: {
  capabilities: ModelAttachmentCapabilities;
  filename: string;
  mediaType: string;
  providerId: Parameters<typeof getModelAttachmentCapabilities>[0];
}) {
  const extension = getLowercaseExtension(input.filename);

  if (FORCE_NORMALIZED_DOCUMENT_EXTENSIONS.has(extension)) {
    return false;
  }

  if (
    (input.providerId === "google" || input.providerId === "google_vertex") &&
    (extension === "json" || input.mediaType === "application/json")
  ) {
    return false;
  }

  if (input.mediaType.startsWith("image/")) {
    return input.capabilities.supportsImages;
  }

  if (extension === "pdf" || input.mediaType === "application/pdf") {
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

  if (textExtensions.has(extension) || input.mediaType.startsWith("text/")) {
    return input.capabilities.supportsTextFiles;
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
            return part;
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
