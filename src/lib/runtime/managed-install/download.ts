import "server-only";

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, rm } from "node:fs/promises";

// Streaming HTTPS download for managed tool installs: the body is written
// to a fresh file while it is hashed (SHA-256) and counted, so a download
// larger than its cap stops at the cap and a pinned hash or size that does
// not match leaves nothing behind.

export class DownloadError extends Error {
  constructor(
    message: string,
    readonly code:
      | "checksum_mismatch"
      | "download_failed"
      | "size_mismatch"
      | "too_large"
      | "insecure_url",
  ) {
    super(message);
  }
}

export type DownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export type DownloadOptions = {
  destination: string;
  /** Exact size when the release pins it. */
  expectedBytes?: number | null;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  maxBytes: number;
  now?: () => number;
  onProgress?: (progress: DownloadProgress) => void;
  /** Minimum time between progress callbacks (default 250 ms). */
  progressIntervalMs?: number;
  /** Lowercase hex SHA-256 the download must match, when known. */
  sha256?: string | null;
  signal?: AbortSignal;
  url: string;
};

export type DownloadResult = {
  bytes: number;
  /** The download's own SHA-256 (hex). */
  sha256: string;
  /** True when it matched a pinned hash. */
  verified: boolean;
};

function assertHttps(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DownloadError(`Invalid download URL: ${url}`, "insecure_url");
  }
  if (parsed.protocol !== "https:") {
    throw new DownloadError(
      "Managed installs only download over HTTPS.",
      "insecure_url",
    );
  }
}

export async function downloadFile(
  options: DownloadOptions,
): Promise<DownloadResult> {
  assertHttps(options.url);
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => Date.now());
  const interval = options.progressIntervalMs ?? 250;
  const expectedHash = options.sha256?.trim().toLowerCase() || null;

  const response = await doFetch(options.url, {
    redirect: "follow",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (response.url) {
    assertHttps(response.url);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new DownloadError(
      `The download failed (${response.status}).`,
      "download_failed",
    );
  }

  // content-length is the encoded size when the server compresses.
  const encoding = response.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();
  const declared = Number(response.headers.get("content-length"));
  const identity = !encoding || encoding === "identity";
  const totalBytes =
    options.expectedBytes ??
    (identity && Number.isFinite(declared) && declared > 0 ? declared : null);
  if (identity && Number.isFinite(declared) && declared > options.maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new DownloadError(
      "The download is larger than allowed.",
      "too_large",
    );
  }

  const hash = createHash("sha256");
  const file = await open(
    options.destination,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    0o600,
  );
  const reader = response.body.getReader();
  let downloadedBytes = 0;
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  let completed = false;

  try {
    options.onProgress?.({ downloadedBytes: 0, totalBytes });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      downloadedBytes += value.byteLength;
      if (downloadedBytes > options.maxBytes) {
        throw new DownloadError(
          "The download is larger than allowed.",
          "too_large",
        );
      }
      if (
        options.expectedBytes != null &&
        downloadedBytes > options.expectedBytes
      ) {
        throw new DownloadError(
          "The download is larger than its pinned size.",
          "size_mismatch",
        );
      }
      hash.update(value);
      await file.write(value);

      const time = now();
      if (time - lastProgressAt >= interval) {
        lastProgressAt = time;
        options.onProgress?.({ downloadedBytes, totalBytes });
      }
    }

    if (
      options.expectedBytes != null &&
      downloadedBytes !== options.expectedBytes
    ) {
      throw new DownloadError(
        "The download does not match its pinned size.",
        "size_mismatch",
      );
    }
    const digest = hash.digest("hex");
    if (expectedHash && digest !== expectedHash) {
      throw new DownloadError(
        "The download failed its SHA-256 check. Nothing was installed.",
        "checksum_mismatch",
      );
    }
    options.onProgress?.({ downloadedBytes, totalBytes });
    completed = true;
    return { bytes: downloadedBytes, sha256: digest, verified: !!expectedHash };
  } finally {
    await reader.cancel().catch(() => undefined);
    await file.close().catch(() => undefined);
    if (!completed) {
      await rm(options.destination, { force: true }).catch(() => undefined);
    }
  }
}
