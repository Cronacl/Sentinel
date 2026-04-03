import { describe, expect, it } from "bun:test";

import {
  imageGenerationProviderFormSchema,
  imageGenerationSettingsFormSchema,
} from "./image-settings.schema";

describe("image settings schemas", () => {
  it("accepts nullable default providers", () => {
    expect(
      imageGenerationSettingsFormSchema.parse({ defaultProvider: null }),
    ).toEqual({ defaultProvider: null });
  });

  it("normalizes provider model input", () => {
    expect(
      imageGenerationProviderFormSchema.parse({
        isCustom: true,
        isEnabled: true,
        modelId: " custom-model ",
        provider: "openrouter",
      }),
    ).toEqual({
      isCustom: true,
      isEnabled: true,
      modelId: "custom-model",
      provider: "openrouter",
    });
  });
});
