import { z } from "zod";

import {
  TRANSCRIPTION_PROVIDER_IDS,
  type VoiceInputSettings,
} from "@/lib/ai/providers/transcription";

const transcriptionProviderSchema = z.enum(TRANSCRIPTION_PROVIDER_IDS);

export const DEFAULT_VOICE_INPUT_SETTINGS: VoiceInputSettings = {
  voiceInputEnabled: false,
  voiceInputModelId: null,
  voiceInputProvider: null,
};

export const voiceSettingsFormSchema = z
  .object({
    voiceInputEnabled: z.boolean(),
    voiceInputModelId: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value : null))
      .nullable(),
    voiceInputProvider: transcriptionProviderSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.voiceInputEnabled) {
      return;
    }

    if (!value.voiceInputProvider) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a provider to enable voice input.",
        path: ["voiceInputProvider"],
      });
    }

    if (value.voiceInputProvider === "azure" && !value.voiceInputModelId) {
      ctx.addIssue({
        code: "custom",
        message:
          "Azure OpenAI requires a transcription deployment or model ID.",
        path: ["voiceInputModelId"],
      });
    }
  });

export type VoiceSettingsFormValues = z.infer<typeof voiceSettingsFormSchema>;
