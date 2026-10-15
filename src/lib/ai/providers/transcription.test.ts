import { describe, expect, it } from "bun:test";

import {
  deriveVoiceInputAvailability,
  normalizeVoiceInputSettings,
  resolveVoiceInputModelId,
  TRANSCRIPTION_PROVIDER_CATALOG,
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
    expect(result.resolvedModelId).toBe("gpt-transcribe");
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

describe("transcription model catalog", () => {
  it("defaults OpenAI to gpt-transcribe and keeps explicit older choices", () => {
    expect(TRANSCRIPTION_PROVIDER_CATALOG.openai.defaultModelId).toBe(
      "gpt-transcribe",
    );
    expect(
      TRANSCRIPTION_PROVIDER_CATALOG.openai.modelOptions.map(
        (option) => option.id,
      ),
    ).toContain("whisper-1");
    expect(
      resolveVoiceInputModelId(
        normalizeVoiceInputSettings({
          voiceInputEnabled: true,
          voiceInputModelId: "whisper-1",
          voiceInputProvider: "openai",
        }),
      ),
    ).toBe("whisper-1");
    expect(TRANSCRIPTION_PROVIDER_CATALOG.groq.defaultModelId).toBe(
      "whisper-large-v3-turbo",
    );
  });
});
