import { describe, expect, it } from "bun:test";

import {
  DEFAULT_VOICE_INPUT_SETTINGS,
  voiceSettingsFormSchema,
} from "./voice-settings.schema";

describe("voiceSettingsFormSchema", () => {
  it("accepts the default voice settings", () => {
    const parsed = voiceSettingsFormSchema.safeParse(
      DEFAULT_VOICE_INPUT_SETTINGS,
    );

    expect(parsed.success).toBe(true);
  });

  it("requires a provider when voice input is enabled", () => {
    const parsed = voiceSettingsFormSchema.safeParse({
      voiceInputEnabled: true,
      voiceInputModelId: null,
      voiceInputProvider: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("requires a model override for Azure", () => {
    const parsed = voiceSettingsFormSchema.safeParse({
      voiceInputEnabled: true,
      voiceInputModelId: null,
      voiceInputProvider: "azure",
    });

    expect(parsed.success).toBe(false);
  });
});
