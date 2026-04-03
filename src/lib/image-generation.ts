import type { AIProvider } from "@/server/db/enums";

export const IMAGE_GENERATION_MODE_VALUES = ["single", "multi_model"] as const;
export type ImageGenerationMode = (typeof IMAGE_GENERATION_MODE_VALUES)[number];

export const DEFAULT_IMAGE_GENERATION_COUNT = 1;
export const MAX_IMAGE_GENERATION_IMAGES_PER_TARGET = 4;
export const MAX_IMAGE_GENERATION_TARGETS = 6;
export const MAX_IMAGE_GENERATION_TOTAL_IMAGES = 8;

export type ImageGenerationSettings = {
  defaultProvider: AIProvider | null;
};

export function normalizeImageGenerationSettings(
  value:
    | Partial<ImageGenerationSettings>
    | {
        defaultProvider?: AIProvider | null;
      }
    | null
    | undefined,
): ImageGenerationSettings {
  return {
    defaultProvider: value?.defaultProvider ?? null,
  };
}
