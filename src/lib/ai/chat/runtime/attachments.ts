import type { streamText } from "ai";

function decodeBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function parseDataUrl(url: URL) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(
    url.href,
  );

  if (!match) {
    throw new Error("Invalid attachment data URL.");
  }

  const [, mediaType, base64] = match;

  if (!base64) {
    throw new Error("Invalid attachment data URL.");
  }

  return {
    data: decodeBase64(base64),
    mediaType: mediaType || undefined,
  };
}

export function createAttachmentDownloadHandler(): NonNullable<
  Parameters<typeof streamText>[0]["experimental_download"]
> {
  return async (requestedDownloads) =>
    Promise.all(
      requestedDownloads.map(async ({ isUrlSupportedByModel, url }) => {
        if (url.protocol === "data:") {
          return parseDataUrl(url);
        }

        return isUrlSupportedByModel ? null : null;
      }),
    );
}
