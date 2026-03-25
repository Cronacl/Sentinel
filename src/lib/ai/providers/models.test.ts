import { describe, expect, it } from "bun:test";

import { getModelAttachmentCapabilities } from "./models";

describe("model attachment capabilities", () => {
  it("returns explicit native file support for known multimodal models", () => {
    expect(getModelAttachmentCapabilities("openai", "gpt-5.2")).toEqual({
      supportsImages: true,
      supportsPdf: true,
      supportsTextFiles: true,
    });
  });

  it("defaults unknown models to conservative no-file support", () => {
    expect(
      getModelAttachmentCapabilities("openai", "custom-unknown-model"),
    ).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
  });
});
