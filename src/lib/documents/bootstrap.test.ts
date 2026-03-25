import { describe, expect, it } from "bun:test";

import { normalizeTranscriptDocumentsForModel, __internal } from "./bootstrap";

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

  it("passes through native text files only for models with text-file support", async () => {
    const passthrough = await normalizeTranscriptDocumentsForModel({
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

    expect(passthrough[0]?.parts[0]?.type).toBe("file");

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
});
