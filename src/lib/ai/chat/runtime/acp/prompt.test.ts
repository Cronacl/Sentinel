import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/uploaded-media", () => ({
  readUploadedMediaUrl: async () => null,
}));

const { buildAcpPromptBlocks } = await import("./prompt");

// Attachments as ACP content under a descriptor's attachment policy
// (Antigravity: audio, PDFs as links, byte limits).

function file(filename: string, mediaType: string) {
  return {
    filename,
    mediaType,
    type: "file" as const,
    url: `upload://${filename}`,
  };
}

const stored: Record<string, Buffer> = {
  "big.png": Buffer.alloc(32),
  "clip.mp3": Buffer.from("ID3audio"),
  "doc.pdf": Buffer.from("%PDF-1.7"),
  "notes.md": Buffer.from("# notes"),
  "small.png": Buffer.from("png"),
};

const load = async (part: { filename?: string }) => ({
  data: stored[part.filename!]!,
  path: `/uploads/${part.filename}`,
});

describe("buildAcpPromptBlocks with an attachment policy", () => {
  it("sends audio, links PDFs and links files over their limits", async () => {
    const paths: string[] = [];
    const blocks = await buildAcpPromptBlocks({
      capabilities: {
        audioPrompts: true,
        embeddedContext: true,
        imagePrompts: true,
      },
      load: load as never,
      message: {
        id: "m",
        parts: [
          { text: "look", type: "text" },
          file("small.png", "image/png"),
          file("big.png", "image/png"),
          file("clip.mp3", "audio/mpeg"),
          file("doc.pdf", "application/pdf"),
          file("notes.md", "text/markdown"),
        ],
        role: "user",
      } as never,
      onAttachmentPath: (path) => paths.push(path),
      policy: {
        audio: true,
        imageMimeTypes: ["image/png"],
        maxImageBytes: 16,
        pdfAsLink: true,
      },
      text: "look",
    });

    expect(blocks.map((block) => block.type)).toEqual([
      "text",
      "image",
      "resource_link",
      "audio",
      "resource_link",
      "resource",
    ]);
    expect(paths).toHaveLength(5);
  });

  it("keeps the old behaviour without a policy (no audio blocks)", async () => {
    const blocks = await buildAcpPromptBlocks({
      capabilities: {
        audioPrompts: true,
        embeddedContext: true,
        imagePrompts: true,
      },
      load: load as never,
      message: {
        id: "m",
        parts: [file("clip.mp3", "audio/mpeg"), file("big.png", "image/png")],
        role: "user",
      } as never,
      text: "",
    });
    expect(blocks.map((block) => block.type)).toEqual([
      "resource_link",
      "image",
    ]);
  });
});
