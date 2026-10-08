import "server-only";

import { pathToFileURL } from "node:url";

import type { AcpAgentCapabilityFlags } from "@/lib/ai/chat/engines/acp/schema";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { readUploadedMediaUrl } from "@/lib/uploaded-media";

// The user's turn as ACP prompt content blocks (design §2.6): the text
// (with the transcript only when the agent's session does not hold it
// yet), then each attachment — an image block when the agent takes images,
// an embedded resource for text files when it takes embedded context, and
// otherwise a resource_link to the file Sentinel already stored on disk.

export type AcpContentBlock =
  | { text: string; type: "text" }
  | { data: string; mimeType: string; type: "image" }
  | {
      mimeType?: string;
      name: string;
      type: "resource_link";
      uri: string;
    }
  | {
      resource: { mimeType?: string; text: string; uri: string };
      type: "resource";
    };

type FilePart = Extract<ThreadUIMessage["parts"][number], { type: "file" }>;

export type LoadedAttachment = {
  data: Buffer;
  /** On-disk path, when the attachment is a stored upload. */
  path: string | null;
};

export type AttachmentLoader = (
  part: FilePart,
) => Promise<LoadedAttachment | null>;

function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/is.exec(url);
  if (!match) {
    return null;
  }
  const payload = match[4] ?? "";
  return match[3]
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
}

/** Reads an attachment: a data URL, or an upload Sentinel stored. */
export const loadAttachment: AttachmentLoader = async (part) => {
  if (part.url.startsWith("data:")) {
    const data = parseDataUrl(part.url);
    return data ? { data, path: null } : null;
  }
  const uploaded = await readUploadedMediaUrl(part.url).catch(() => null);
  return uploaded
    ? { data: Buffer.from(uploaded.data), path: uploaded.absolutePath }
    : null;
};

const TEXT_MEDIA_TYPE =
  /^(?:text\/|application\/(?:json|xml|x-yaml|yaml|toml|javascript|typescript|x-sh))/i;

function looksTextual(mediaType: string, data: Buffer) {
  return TEXT_MEDIA_TYPE.test(mediaType) && !data.subarray(0, 4096).includes(0);
}

export async function buildAcpPromptBlocks(input: {
  capabilities: Pick<
    AcpAgentCapabilityFlags,
    "embeddedContext" | "imagePrompts"
  >;
  forceImagePrompts?: boolean;
  load?: AttachmentLoader;
  message: ThreadUIMessage | null;
  text: string;
}): Promise<AcpContentBlock[]> {
  const blocks: AcpContentBlock[] = [];
  if (input.text.trim()) {
    blocks.push({ text: input.text, type: "text" });
  }

  const files = (input.message?.parts ?? []).filter(
    (part): part is FilePart => part.type === "file",
  );
  const load = input.load ?? loadAttachment;
  const notes: string[] = [];

  for (const part of files) {
    const name = part.filename ?? part.mediaType;
    const loaded = await load(part);
    if (!loaded) {
      notes.push(`Attachment ${name} could not be read.`);
      continue;
    }
    const uri = loaded.path ? pathToFileURL(loaded.path).toString() : null;

    if (part.mediaType.startsWith("image/")) {
      if (input.capabilities.imagePrompts || input.forceImagePrompts) {
        blocks.push({
          data: loaded.data.toString("base64"),
          mimeType: part.mediaType,
          type: "image",
        });
        continue;
      }
    } else if (
      input.capabilities.embeddedContext &&
      looksTextual(part.mediaType, loaded.data)
    ) {
      blocks.push({
        resource: {
          mimeType: part.mediaType,
          text: loaded.data.toString("utf8"),
          uri: uri ?? `attachment:${encodeURIComponent(name)}`,
        },
        type: "resource",
      });
      continue;
    }

    if (uri) {
      blocks.push({
        mimeType: part.mediaType,
        name,
        type: "resource_link",
        uri,
      });
    } else {
      notes.push(`Attachment ${name} could not be passed to the agent.`);
    }
  }

  if (notes.length > 0) {
    blocks.push({ text: notes.join("\n"), type: "text" });
  }
  return blocks.length > 0 ? blocks : [{ text: " ", type: "text" }];
}
