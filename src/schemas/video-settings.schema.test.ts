import { describe, expect, it } from "bun:test";

import {
  videoGenerationProviderFormSchema,
  videoGenerationSettingsFormSchema,
} from "./video-settings.schema";

describe("video settings schemas", () => {
  it("accepts nullable default providers", () => {
    expect(
      videoGenerationSettingsFormSchema.parse({ defaultProvider: null }),
    ).toEqual({ defaultProvider: null });
  });

  it("normalizes provider model input", () => {
    expect(
      videoGenerationProviderFormSchema.parse({
        isCustom: true,
        isEnabled: true,
        modelId: " custom-video-model ",
        provider: "vercel",
      }),
    ).toEqual({
      isCustom: true,
      isEnabled: true,
      modelId: "custom-video-model",
      provider: "vercel",
    });
  });
});
