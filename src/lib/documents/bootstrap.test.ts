import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { normalizeTranscriptDocumentsForModel, __internal } from "./bootstrap";
import { buildUploadedMediaUrl } from "@/lib/uploaded-media-url";
import { writeUploadedMediaArtifact } from "@/lib/uploaded-media";

function toDataUrl(value: Buffer, mediaType: string) {
  return `data:${mediaType};base64,${value.toString("base64")}`;
}

describe("document bootstrap normalization", () => {
  it("always normalizes csv attachments", async () => {
    const messages = await normalizeTranscriptDocumentsForModel({
      messages: [
        {
          id: "message-1",
          metadata: {},
          parts: [
            {
              filename: "table.csv",
              mediaType: "text/csv",
              type: "file",
              url: toDataUrl(Buffer.from("name,value\nalpha,1\n"), "text/csv"),
            },
          ],
          role: "user",
        },
      ],
      providerId: "openai",
      responseModelId: "gpt-5.2",
    });

    expect(messages[0]?.parts[0]?.type).toBe("text");
    expect(
      messages[0]?.parts[0] && "text" in messages[0].parts[0]
        ? messages[0].parts[0].text
        : "",
    ).toContain("Attached document: table.csv");
  });

  it("normalizes csv attachments by media type even when the filename is missing", async () => {
    const messages = await normalizeTranscriptDocumentsForModel({
      messages: [
        {
          id: "message-1",
          metadata: {},
          parts: [
            {
              mediaType: "text/csv",
              type: "file",
              url: toDataUrl(Buffer.from("name,value\nalpha,1\n"), "text/csv"),
            },
          ],
          role: "user",
        },
      ],
      providerId: "openai",
      responseModelId: "gpt-5.2",
    });

    expect(messages[0]?.parts[0]?.type).toBe("text");
    expect(
      messages[0]?.parts[0] && "text" in messages[0].parts[0]
        ? messages[0].parts[0].text
        : "",
    ).toContain("Attached document: attachment");
  });

  it("normalizes text files instead of passing them through as raw file parts", async () => {
    const normalizedKnownModel = await normalizeTranscriptDocumentsForModel({
      messages: [
        {
          id: "message-1",
          metadata: {},
          parts: [
            {
              filename: "notes.txt",
              mediaType: "text/plain",
              type: "file",
              url: toDataUrl(Buffer.from("hello"), "text/plain"),
            },
          ],
          role: "user",
        },
      ],
      providerId: "openai",
      responseModelId: "gpt-5.2",
    });

    expect(normalizedKnownModel[0]?.parts[0]?.type).toBe("text");
    expect(
      normalizedKnownModel[0]?.parts[0] &&
        "text" in normalizedKnownModel[0].parts[0]
        ? normalizedKnownModel[0].parts[0].text
        : "",
    ).toContain("Attached document: notes.txt");

    const normalized = await normalizeTranscriptDocumentsForModel({
      messages: [
        {
          id: "message-2",
          metadata: {},
          parts: [
            {
              filename: "notes.txt",
              mediaType: "text/plain",
              type: "file",
              url: toDataUrl(Buffer.from("hello"), "text/plain"),
            },
          ],
          role: "user",
        },
      ],
      providerId: "openai",
      responseModelId: "custom-model-with-unknown-file-support",
    });

    expect(normalized[0]?.parts[0]?.type).toBe("text");
  });

  it("normalizes json attachments for google providers that reject application/json file parts", async () => {
    const messages = await normalizeTranscriptDocumentsForModel({
      messages: [
        {
          id: "message-3",
          metadata: {},
          parts: [
            {
              filename: "payload.json",
              mediaType: "application/json",
              type: "file",
              url: toDataUrl(Buffer.from('{"ok":true}'), "application/json"),
            },
          ],
          role: "user",
        },
      ],
      providerId: "google_vertex",
      responseModelId: "gemini-2.5-pro",
    });

    expect(messages[0]?.parts[0]?.type).toBe("text");
    expect(
      messages[0]?.parts[0] && "text" in messages[0].parts[0]
        ? messages[0].parts[0].text
        : "",
    ).toContain("Attached document: payload.json");
  });

  it("uses capability-aware pdf passthrough rules", () => {
    expect(
      __internal.shouldPassthroughFile({
        capabilities: {
          supportsImages: true,
          supportsPdf: true,
          supportsTextFiles: true,
        },
        filename: "report.pdf",
        mediaType: "application/pdf",
        providerId: "openai",
      }),
    ).toBe(true);

    expect(
      __internal.shouldPassthroughFile({
        capabilities: {
          supportsImages: false,
          supportsPdf: false,
          supportsTextFiles: false,
        },
        filename: "report.pdf",
        mediaType: "application/pdf",
        providerId: "openai",
      }),
    ).toBe(false);
  });

  it("materializes persisted uploaded images before model passthrough", async () => {
    const previousMediaPath = process.env.SENTINEL_MEDIA_PATH;
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "sentinel-media-"));

    try {
      process.env.SENTINEL_MEDIA_PATH = mediaRoot;
      const artifact = await writeUploadedMediaArtifact({
        data: Buffer.from("image-bytes"),
        filename: "screenshot.png",
        messageId: "message-4",
        threadId: "thread-1",
        userId: "user-1",
      });

      const messages = await normalizeTranscriptDocumentsForModel({
        messages: [
          {
            id: "message-4",
            metadata: {},
            parts: [
              {
                filename: "screenshot.png",
                mediaType: "image/png",
                type: "file",
                url: buildUploadedMediaUrl(artifact.artifactPath),
              },
            ],
            role: "user",
          },
        ],
        providerId: "google",
        responseModelId: "gemini-2.5-pro",
      });

      const part = messages[0]?.parts[0];
      expect(part?.type).toBe("file");
      expect(part && "url" in part ? part.url : "").toBe(
        toDataUrl(Buffer.from("image-bytes"), "image/png"),
      );
    } finally {
      if (previousMediaPath === undefined) {
        delete process.env.SENTINEL_MEDIA_PATH;
      } else {
        process.env.SENTINEL_MEDIA_PATH = previousMediaPath;
      }
      await rm(mediaRoot, { force: true, recursive: true });
    }
  });

  it("never passes through markdown and other text-based attachments", () => {
    expect(
      __internal.shouldPassthroughFile({
        capabilities: {
          supportsImages: true,
          supportsPdf: true,
          supportsTextFiles: true,
        },
        filename: "README.md",
        mediaType: "text/markdown",
        providerId: "openai",
      }),
    ).toBe(false);

    expect(
      __internal.shouldPassthroughFile({
        capabilities: {
          supportsImages: true,
          supportsPdf: true,
          supportsTextFiles: true,
        },
        filename: "payload.json",
        mediaType: "application/json",
        providerId: "openai",
      }),
    ).toBe(false);
  });
});
