import type { AIProvider } from "@/server/db/enums";

export const VIDEO_GENERATION_MODE_VALUES = ["single", "multi_model"] as const;
export type VideoGenerationMode = (typeof VIDEO_GENERATION_MODE_VALUES)[number];

export const DEFAULT_VIDEO_GENERATION_COUNT = 1;
export const MAX_VIDEO_GENERATION_VIDEOS_PER_TARGET = 2;
export const MAX_VIDEO_GENERATION_TARGETS = 4;
export const MAX_VIDEO_GENERATION_TOTAL_VIDEOS = 4;

export type VideoGenerationSettings = {
  defaultProvider: AIProvider | null;
};

export function normalizeVideoGenerationSettings(
  value:
    | Partial<VideoGenerationSettings>
    | {
        defaultProvider?: AIProvider | null;
      }
    | null
    | undefined,
): VideoGenerationSettings {
  return {
    defaultProvider: value?.defaultProvider ?? null,
  };
}
