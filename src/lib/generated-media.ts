import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSentinelMediaRoot } from "@/lib/runtime/local-state";

const MEDIA_EXTENSION_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/x-ms-wmv": "wmv",
};

function toSafePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getMediaExtension(mediaType: string) {
  return MEDIA_EXTENSION_BY_TYPE[mediaType] ?? "bin";
}

export function getGeneratedMediaRoot() {
  return path.join(getSentinelMediaRoot(), "generated");
}

export function resolveGeneratedMediaArtifactPath({
  artifactPath,
  userId,
}: {
  artifactPath: string;
  userId?: string;
}) {
  const generatedMediaRoot = getGeneratedMediaRoot();
  const normalizedArtifactPath = artifactPath
    .split("/")
    .filter(Boolean)
    .join(path.sep);
  const absolutePath = path.resolve(generatedMediaRoot, normalizedArtifactPath);
  const rootWithSep = `${path.resolve(generatedMediaRoot)}${path.sep}`;

  if (
    absolutePath !== path.resolve(generatedMediaRoot) &&
    !absolutePath.startsWith(rootWithSep)
  ) {
    throw new Error("Invalid generated media artifact path.");
  }

  const pathSegments = path
    .relative(generatedMediaRoot, absolutePath)
    .split(path.sep);
  const ownerSegment = pathSegments[0];
  if (userId && ownerSegment !== userId) {
    throw new Error("Generated media artifact is not accessible.");
  }

  return {
    absolutePath,
    relativePath: pathSegments.join("/"),
  };
}

export async function cleanupGeneratedMediaArtifacts() {
  await mkdir(getGeneratedMediaRoot(), { recursive: true });
}

export async function writeGeneratedMediaArtifact({
  data,
  mediaType,
  targetId,
  threadId,
  userId,
}: {
  data: Uint8Array;
  mediaType: string;
  targetId: string;
  threadId: string;
  userId: string;
}) {
  const fileName = `${toSafePathSegment(targetId)}.${getMediaExtension(mediaType)}`;
  const relativePath = [userId, threadId, crypto.randomUUID(), fileName].join(
    "/",
  );
  const absolutePath = path.join(
    getGeneratedMediaRoot(),
    ...relativePath.split("/"),
  );

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);

  return {
    absolutePath,
    artifactPath: relativePath,
  };
}

export async function readGeneratedMediaArtifact({
  artifactPath,
  userId,
}: {
  artifactPath: string;
  userId: string;
}) {
  const resolved = resolveGeneratedMediaArtifactPath({ artifactPath, userId });
  const data = await readFile(resolved.absolutePath);

  return {
    ...resolved,
    data,
  };
}
