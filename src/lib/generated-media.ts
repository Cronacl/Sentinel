import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GENERATED_MEDIA_TTL_MS } from "@/lib/video-generation";

const GENERATED_MEDIA_ROOT = path.join(os.tmpdir(), "sentinel-generated-media");

const MEDIA_EXTENSION_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/x-ms-wmv": "wmv",
};

let cleanupPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

function toSafePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getMediaExtension(mediaType: string) {
  return MEDIA_EXTENSION_BY_TYPE[mediaType] ?? "bin";
}

export function getGeneratedMediaRoot() {
  return GENERATED_MEDIA_ROOT;
}

export function resolveGeneratedMediaArtifactPath({
  artifactPath,
  userId,
}: {
  artifactPath: string;
  userId?: string;
}) {
  const normalizedArtifactPath = artifactPath
    .split("/")
    .filter(Boolean)
    .join(path.sep);
  const absolutePath = path.resolve(
    GENERATED_MEDIA_ROOT,
    normalizedArtifactPath,
  );
  const rootWithSep = `${path.resolve(GENERATED_MEDIA_ROOT)}${path.sep}`;

  if (
    absolutePath !== path.resolve(GENERATED_MEDIA_ROOT) &&
    !absolutePath.startsWith(rootWithSep)
  ) {
    throw new Error("Invalid generated media artifact path.");
  }

  const pathSegments = path
    .relative(GENERATED_MEDIA_ROOT, absolutePath)
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

async function cleanupDirectory(directory: string, now: number) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await cleanupDirectory(entryPath, now);

        try {
          const remaining = await readdir(entryPath);
          if (remaining.length === 0) {
            await rm(entryPath, { force: true, recursive: true });
          }
        } catch {
          // ignore cleanup races
        }
        return;
      }

      try {
        const fileStat = await stat(entryPath);
        if (now - fileStat.mtimeMs > GENERATED_MEDIA_TTL_MS) {
          await rm(entryPath, { force: true });
        }
      } catch {
        // ignore cleanup races
      }
    }),
  );
}

export async function cleanupGeneratedMediaArtifacts() {
  const now = Date.now();
  if (cleanupPromise && now - lastCleanupAt < 60_000) {
    return await cleanupPromise;
  }

  lastCleanupAt = now;
  cleanupPromise = (async () => {
    try {
      await cleanupDirectory(GENERATED_MEDIA_ROOT, now);
    } finally {
      cleanupPromise = null;
    }
  })();

  return await cleanupPromise;
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
    GENERATED_MEDIA_ROOT,
    ...relativePath.split("/"),
  );

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);
  void cleanupGeneratedMediaArtifacts();

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
