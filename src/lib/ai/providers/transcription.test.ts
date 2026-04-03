import { describe, expect, it } from "bun:test";

import {
  deriveVoiceInputAvailability,
  normalizeVoiceInputSettings,
  resolveVoiceInputModelId,
} from "./transcription";

describe("voice transcription availability", () => {
  it("marks voice input available when the selected provider is active", () => {
    const settings = normalizeVoiceInputSettings({
      voiceInputEnabled: true,
      voiceInputProvider: "openai",
    });

    const result = deriveVoiceInputAvailability({
      providerStatuses: { openai: "active" },
      settings,
    });

    expect(result.isAvailable).toBe(true);
    expect(result.resolvedModelId).toBe("whisper-1");
    expect(result.unavailableReason).toBeNull();
  });

  it("stays unavailable when the feature is disabled", () => {
    const settings = normalizeVoiceInputSettings({
      voiceInputEnabled: false,
      voiceInputProvider: "openai",
    });

    const result = deriveVoiceInputAvailability({
      providerStatuses: { openai: "active" },
      settings,
    });

    expect(result.isAvailable).toBe(false);
    expect(result.unavailableReason).toBe("Voice input is turned off.");
  });

  it("rejects providers that are not configured or enabled", () => {
    const settings = normalizeVoiceInputSettings({
      voiceInputEnabled: true,
      voiceInputProvider: "groq",
    });

    const result = deriveVoiceInputAvailability({
      providerStatuses: { groq: "disabled" },
      settings,
    });

    expect(result.isAvailable).toBe(false);
    expect(result.unavailableReason).toContain("Connect and enable Groq");
  });

  it("requires a model override for Azure", () => {
    const settings = normalizeVoiceInputSettings({
      voiceInputEnabled: true,
      voiceInputProvider: "azure",
    });

    expect(resolveVoiceInputModelId(settings)).toBeNull();

    const result = deriveVoiceInputAvailability({
      providerStatuses: { azure: "active" },
      settings,
    });

    expect(result.isAvailable).toBe(false);
    expect(result.unavailableReason).toBe(
      "Enter a transcription deployment or model ID.",
    );
  });
});
