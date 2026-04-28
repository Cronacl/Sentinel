import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileUIPart } from "ai";

import { inferAttachmentMimeType } from "@/lib/files/chat-attachment-types";
import { buildUploadedMediaUrl } from "@/lib/uploaded-media-url";
import { getSentinelMediaRoot } from "@/lib/runtime/local-state";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

function decodeBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(value);

  if (!match?.[2]) {
    throw new Error("Invalid uploaded media data URL.");
  }

  return {
    data: decodeBase64(match[2]),
    mediaType: match[1] || undefined,
  };
}

function toSafePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function getUploadedMediaRoot() {
  return path.join(getSentinelMediaRoot(), "uploads");
}

export function resolveUploadedMediaArtifactPath({
  artifactPath,
  userId,
}: {
  artifactPath: string;
  userId?: string;
}) {
  const uploadedMediaRoot = getUploadedMediaRoot();
  const normalizedArtifactPath = artifactPath
    .split("/")
    .filter(Boolean)
    .join(path.sep);
  const absolutePath = path.resolve(uploadedMediaRoot, normalizedArtifactPath);
  const rootWithSep = `${path.resolve(uploadedMediaRoot)}${path.sep}`;

  if (
    absolutePath !== path.resolve(uploadedMediaRoot) &&
    !absolutePath.startsWith(rootWithSep)
  ) {
    throw new Error("Invalid uploaded media artifact path.");
  }

  const pathSegments = path
    .relative(uploadedMediaRoot, absolutePath)
    .split(path.sep);
  const ownerSegment = pathSegments[0];
  if (userId && ownerSegment !== userId) {
    throw new Error("Uploaded media artifact is not accessible.");
  }

  return {
    absolutePath,
    relativePath: pathSegments.join("/"),
  };
}

export async function writeUploadedMediaArtifact({
  data,
  filename,
  messageId,
  threadId,
  userId,
}: {
  data: Uint8Array;
  filename: string;
  messageId: string;
  threadId: string;
  userId: string;
}) {
  const safeFilename = toSafePathSegment(filename || "attachment.bin");
  const relativePath = [
    userId,
    threadId,
    messageId,
    crypto.randomUUID(),
    safeFilename,
  ].join("/");
  const absolutePath = path.join(
    getUploadedMediaRoot(),
    ...relativePath.split("/"),
  );

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);

  return {
    absolutePath,
    artifactPath: relativePath,
  };
}

export async function readUploadedMediaArtifact({
  artifactPath,
  userId,
}: {
  artifactPath: string;
  userId: string;
}) {
  const resolved = resolveUploadedMediaArtifactPath({ artifactPath, userId });
  const data = await readFile(resolved.absolutePath);

  return {
    ...resolved,
    data,
  };
}

export async function readUploadedMediaUrl(url: string) {
  const marker = "/api/uploaded-media/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const artifactPath = url
    .slice(markerIndex + marker.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  const resolved = resolveUploadedMediaArtifactPath({ artifactPath });
  const data = await readFile(resolved.absolutePath);

  return {
    ...resolved,
    data,
  };
}

export async function materializeUploadedMediaUrlAsDataUrl({
  mediaType,
  url,
}: {
  mediaType?: string | null;
  url: string;
}) {
  const uploadedMedia = await readUploadedMediaUrl(url);
  if (!uploadedMedia) {
    return null;
  }

  const filename = uploadedMedia.relativePath.split("/").pop() ?? "";
  const resolvedMediaType =
    mediaType ??
    inferAttachmentMimeType(filename) ??
    "application/octet-stream";

  return `data:${resolvedMediaType};base64,${Buffer.from(
    uploadedMedia.data,
  ).toString("base64")}`;
}

function isPersistedUploadedMediaUrl(url: string) {
  return url.includes("/api/uploaded-media/");
}

export async function persistUploadedMediaParts({
  message,
  threadId,
  userId,
}: {
  message: ThreadUIMessage;
  threadId: string;
  userId: string;
}): Promise<ThreadUIMessage> {
  const parts = await Promise.all(
    message.parts.map(async (part) => {
      if (part.type !== "file" || !part.url.startsWith("data:")) {
        return part;
      }

      const parsed = parseDataUrl(part.url);
      const filename = part.filename ?? "attachment.bin";
      const artifact = await writeUploadedMediaArtifact({
        data: parsed.data,
        filename,
        messageId: message.id,
        threadId,
        userId,
      });

      return {
        ...part,
        mediaType:
          part.mediaType ??
          parsed.mediaType ??
          inferAttachmentMimeType(filename),
        providerMetadata: {
          ...(part.providerMetadata ?? {}),
          sentinel: {
            artifactPath: artifact.artifactPath,
            absolutePath: artifact.absolutePath,
            kind: "uploaded-media",
          },
        },
        url: buildUploadedMediaUrl(artifact.artifactPath),
      } satisfies FileUIPart;
    }),
  );

  return {
    ...message,
    parts,
  };
}

export function isUploadedMediaFilePart(part: FileUIPart) {
  return isPersistedUploadedMediaUrl(part.url);
}
