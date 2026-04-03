import { experimental_generateVideo as generateVideo } from "ai";
import type { FileUIPart } from "ai";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import {
  getVideoModelsForProvider,
  supportsCustomVideoModels,
  type VideoGenerationRuntime,
} from "@/lib/ai/providers/videos";
import { writeGeneratedMediaArtifact } from "@/lib/generated-media";
import {
  DEFAULT_VIDEO_GENERATION_COUNT,
  MAX_VIDEO_GENERATION_TARGETS,
  MAX_VIDEO_GENERATION_TOTAL_VIDEOS,
  MAX_VIDEO_GENERATION_VIDEOS_PER_TARGET,
  VIDEO_GENERATION_MODE_VALUES,
} from "@/lib/video-generation";
import { buildActiveThreadMessages } from "@/lib/ai/messages/branches";
import { loadThreadMessages } from "@/lib/ai/chat/persistence";
import { AI_PROVIDERS, type AIProvider } from "@/server/db/enums";

const VIDEO_ARTIFACT_PATH_PLACEHOLDER =
  "[omitted from model output; video playback available in the UI]";
const NULLISH_OPTIONAL_INPUT_VALUES = new Set([
  "n/a",
  "na",
  "no image",
  "no reference",
  "none",
  "null",
  "undefined",
]);

const videoTargetProviderSchema = z.enum(AI_PROVIDERS);

function normalizeOptionalInputString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return NULLISH_OPTIONAL_INPUT_VALUES.has(trimmed.toLowerCase())
    ? undefined
    : trimmed;
}

function preprocessOptionalInputString(value: unknown) {
  return typeof value === "string"
    ? normalizeOptionalInputString(value)
    : value;
}

export const generateVideoInputSchema = z
  .object({
    aspectRatio: z
      .string()
      .regex(/^\d+:\d+$/)
      .optional()
      .describe("Optional aspect ratio like 16:9 or 9:16."),
    count: z
      .number()
      .int()
      .min(1)
      .max(MAX_VIDEO_GENERATION_VIDEOS_PER_TARGET)
      .default(DEFAULT_VIDEO_GENERATION_COUNT)
      .describe("Number of videos to generate per provider."),
    duration: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("Optional target duration in seconds."),
    fps: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("Optional target frames per second."),
    mode: z
      .enum(VIDEO_GENERATION_MODE_VALUES)
      .default("single")
      .describe("Use single for one provider or multi_model to fan out."),
    modelId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional model override for single-provider generation."),
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("Describe the video you want to generate."),
    provider: videoTargetProviderSchema
      .optional()
      .describe("Optional provider override for single-provider generation."),
    providers: z
      .array(videoTargetProviderSchema)
      .min(1)
      .max(MAX_VIDEO_GENERATION_TARGETS)
      .optional()
      .describe("Optional provider subset when mode is multi_model."),
    referenceImageAttachmentIndex: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Optional attachment index when multiple images share a filename.",
      ),
    referenceImageFilename: z
      .preprocess(
        preprocessOptionalInputString,
        z.string().trim().min(1).optional(),
      )
      .describe(
        "Optional image attachment filename for image-to-video generation.",
      ),
    referenceImageMessageId: z
      .preprocess(
        preprocessOptionalInputString,
        z.string().trim().min(1).optional(),
      )
      .describe(
        "Optional message id containing the reference image attachment.",
      ),
    resolution: z
      .string()
      .regex(/^\d+x\d+$/)
      .optional()
      .describe("Optional resolution like 1280x720."),
    seed: z.number().int().optional().describe("Optional deterministic seed."),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "multi_model" && value.modelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "modelId overrides are only supported in single mode.",
        path: ["modelId"],
      });
    }

    if (
      (value.referenceImageAttachmentIndex != null ||
        value.referenceImageMessageId != null) &&
      !value.referenceImageFilename
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "referenceImageFilename is required when targeting a reference image attachment.",
        path: ["referenceImageFilename"],
      });
    }

    const providerCount =
      value.mode === "multi_model" ? (value.providers?.length ?? 0) : 1;
    const totalRequested = providerCount * value.count;
    if (
      providerCount > 0 &&
      totalRequested > MAX_VIDEO_GENERATION_TOTAL_VIDEOS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Requested output exceeds the ${MAX_VIDEO_GENERATION_TOTAL_VIDEOS}-video limit.`,
        path: ["count"],
      });
    }
  });

const generatedVideoSchema = z.object({
  artifactPath: z.string(),
  mediaType: z.string(),
});

const successfulTargetSchema = z.object({
  modelId: z.string(),
  provider: videoTargetProviderSchema,
  providerMetadataSummary: z.string().nullable(),
  responseModelId: z.string().nullable(),
  status: z.literal("success"),
  videos: z.array(generatedVideoSchema).min(1),
  warnings: z.array(z.string()),
});

const failedTargetSchema = z.object({
  error: z.string(),
  modelId: z.string(),
  provider: videoTargetProviderSchema,
  status: z.literal("error"),
});

export const generateVideoTargetSchema = z.discriminatedUnion("status", [
  successfulTargetSchema,
  failedTargetSchema,
]);

export const generateVideoOutputSchema = z.object({
  failureCount: z.number().int().min(0),
  mode: z.enum(VIDEO_GENERATION_MODE_VALUES),
  prompt: z.string(),
  requestedCount: z.number().int().min(1),
  successCount: z.number().int().min(0),
  targets: z.array(generateVideoTargetSchema),
});

export type GenerateVideoInput = z.infer<typeof generateVideoInputSchema>;
export type GenerateVideoOutput = z.infer<typeof generateVideoOutputSchema>;

type GenerateVideoRuntime = {
  sourceMessageId?: string | null;
  threadId: string;
  userId: string;
  videoGeneration: VideoGenerationRuntime;
};

type ReferenceImage = {
  data: Uint8Array;
  mediaType: string;
};

function decodeDataUrl(url: string) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(url);
  if (!match?.[2]) {
    throw new Error("Invalid reference image data URL.");
  }

  return {
    data: Uint8Array.from(Buffer.from(match[2], "base64")),
    mediaType: match[1] || "image/png",
  };
}

function getReferenceImageParts(
  parts: readonly unknown[],
  filename: string,
): FileUIPart[] {
  return parts.filter(
    (part): part is FileUIPart =>
      typeof part === "object" &&
      part != null &&
      "type" in part &&
      part.type === "file" &&
      (("filename" in part ? part.filename : undefined) ?? "Attachment") ===
        filename,
  );
}

function getImageFileParts(parts: readonly unknown[]): FileUIPart[] {
  return parts.filter(
    (part): part is FileUIPart =>
      typeof part === "object" &&
      part != null &&
      "type" in part &&
      part.type === "file" &&
      "mediaType" in part &&
      typeof part.mediaType === "string" &&
      part.mediaType.startsWith("image/"),
  );
}

async function resolveReferenceImage(
  input: GenerateVideoInput,
  runtime: GenerateVideoRuntime,
): Promise<ReferenceImage | null> {
  const filename = normalizeOptionalInputString(input.referenceImageFilename);
  if (!filename) {
    return null;
  }

  const targetMessageId =
    normalizeOptionalInputString(input.referenceImageMessageId) ||
    runtime.sourceMessageId ||
    null;
  if (!runtime.threadId || !targetMessageId) {
    throw new Error(
      "A source message is required to resolve the reference image attachment.",
    );
  }

  const transcript = buildActiveThreadMessages(
    await loadThreadMessages(runtime.threadId),
  );
  const message = transcript.find(
    (candidate) => candidate.id === targetMessageId,
  );

  if (!message) {
    throw new Error(
      `Message "${targetMessageId}" was not found in this thread.`,
    );
  }

  const imageParts = getImageFileParts(message.parts);
  if (imageParts.length === 0) {
    return null;
  }

  const matchingParts = getReferenceImageParts(message.parts, filename);
  if (matchingParts.length === 0) {
    if (
      imageParts.length === 1 &&
      input.referenceImageAttachmentIndex == null &&
      !normalizeOptionalInputString(input.referenceImageMessageId)
    ) {
      const [fallbackPart] = imageParts;
      if (!fallbackPart) {
        return null;
      }

      if (fallbackPart.url.startsWith("data:")) {
        return decodeDataUrl(fallbackPart.url);
      }

      if (/^https?:\/\//i.test(fallbackPart.url)) {
        return null;
      }

      return {
        data: Uint8Array.from(await readFile(fallbackPart.url)),
        mediaType: fallbackPart.mediaType,
      };
    }

    throw new Error(
      `Reference image attachment "${filename}" was not found on message "${targetMessageId}".`,
    );
  }

  const selectedIndex =
    input.referenceImageAttachmentIndex != null
      ? input.referenceImageAttachmentIndex - 1
      : 0;
  if (matchingParts.length > 1 && input.referenceImageAttachmentIndex == null) {
    throw new Error(
      `Reference image "${filename}" appears multiple times on message "${targetMessageId}". Provide referenceImageAttachmentIndex to disambiguate.`,
    );
  }

  const selected = matchingParts[selectedIndex];
  if (!selected) {
    throw new Error(
      `referenceImageAttachmentIndex ${input.referenceImageAttachmentIndex} is out of range for "${filename}".`,
    );
  }

  if (!selected.mediaType?.startsWith("image/")) {
    throw new Error(`Attachment "${filename}" is not an image.`);
  }

  if (selected.url.startsWith("data:")) {
    return decodeDataUrl(selected.url);
  }

  if (/^https?:\/\//i.test(selected.url)) {
    throw new Error(
      `Attachment "${filename}" is not stored locally, so it cannot be used as a reference image yet.`,
    );
  }

  return {
    data: Uint8Array.from(await readFile(selected.url)),
    mediaType: selected.mediaType,
  };
}

function stringifyWarning(value: unknown) {
  if (!value || typeof value !== "object") {
    return String(value ?? "");
  }

  const candidate = value as {
    details?: unknown;
    feature?: unknown;
    type?: unknown;
  };
  const label =
    typeof candidate.feature === "string" && candidate.feature.length > 0
      ? candidate.feature
      : typeof candidate.type === "string" && candidate.type.length > 0
        ? candidate.type
        : "warning";
  const message =
    typeof candidate.details === "string" && candidate.details.length > 0
      ? candidate.details
      : JSON.stringify(value);

  return `${label}: ${message}`;
}

function summarizeProviderMetadata(value: unknown) {
  if (value == null) {
    return null;
  }

  try {
    const text = JSON.stringify(value);
    return text.length > 600 ? `${text.slice(0, 600)}...` : text;
  } catch {
    return String(value);
  }
}

function requireTargetProvider(
  runtime: VideoGenerationRuntime,
  provider: AIProvider,
) {
  const entry = runtime.providers[provider];
  if (!entry) {
    throw new Error(
      `Video provider "${provider}" is not configured, enabled, or missing a valid model. Check Settings > Videos.`,
    );
  }

  return entry;
}

function resolveTargets(
  input: GenerateVideoInput,
  runtime: VideoGenerationRuntime,
) {
  if (input.mode === "single") {
    const provider = input.provider ?? runtime.defaultProvider;
    if (!provider) {
      throw new Error(
        "No video provider is available. Configure one in Settings > Videos.",
      );
    }

    const entry = requireTargetProvider(runtime, provider);
    const requestedModelId = input.modelId?.trim() || null;
    if (requestedModelId) {
      const isKnownModel = getVideoModelsForProvider(provider).some(
        (model) => model.id === requestedModelId,
      );
      if (!isKnownModel && !supportsCustomVideoModels(provider)) {
        throw new Error(
          `Model "${requestedModelId}" is not a valid video model override for provider "${provider}".`,
        );
      }
    }

    return [
      {
        ...entry,
        modelId: requestedModelId || entry.modelId,
      },
    ];
  }

  const targetProviders = input.providers?.length
    ? input.providers
    : (Object.keys(runtime.providers) as AIProvider[]);

  if (targetProviders.length === 0) {
    throw new Error(
      "No video providers are available. Configure one in Settings > Videos.",
    );
  }

  return targetProviders.map((provider) =>
    requireTargetProvider(runtime, provider),
  );
}

function getVideoModel(
  providerInstance: Record<string, unknown>,
  modelId: string,
): unknown {
  if (typeof providerInstance.videoModel === "function") {
    return providerInstance.videoModel(modelId);
  }

  if (typeof providerInstance.video === "function") {
    return providerInstance.video(modelId);
  }

  throw new Error("Provider does not expose a video generation model.");
}

async function executeTarget({
  abortSignal,
  count,
  entry,
  input,
  referenceImage,
  threadId,
  userId,
}: {
  abortSignal?: AbortSignal;
  count: number;
  entry: {
    config: Record<string, unknown>;
    modelId: string;
    provider: AIProvider;
  };
  input: GenerateVideoInput;
  referenceImage: ReferenceImage | null;
  threadId: string;
  userId: string;
}) {
  try {
    const providerInstance = createProviderInstance(
      entry.provider,
      entry.config,
    ) as unknown as Record<string, unknown>;
    const model = getVideoModel(providerInstance, entry.modelId) as Parameters<
      typeof generateVideo
    >[0]["model"];
    const result = await generateVideo({
      abortSignal,
      aspectRatio: input.aspectRatio as `${number}:${number}` | undefined,
      duration: input.duration,
      fps: input.fps,
      model,
      n: count,
      prompt: referenceImage
        ? {
            image: referenceImage.data,
            text: input.prompt.trim(),
          }
        : input.prompt.trim(),
      resolution: input.resolution as `${number}x${number}` | undefined,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    });

    const videos = await Promise.all(
      result.videos.map(async (video, index) => {
        const artifact = await writeGeneratedMediaArtifact({
          data: video.uint8Array,
          mediaType: video.mediaType,
          targetId: `${entry.provider}-${entry.modelId}-${index + 1}`,
          threadId,
          userId,
        });

        return {
          artifactPath: artifact.artifactPath,
          mediaType: video.mediaType,
        };
      }),
    );

    return {
      modelId: entry.modelId,
      provider: entry.provider,
      providerMetadataSummary: summarizeProviderMetadata(
        result.providerMetadata,
      ),
      responseModelId:
        result.responses[result.responses.length - 1]?.modelId ?? null,
      status: "success" as const,
      videos,
      warnings: result.warnings.map(stringifyWarning).filter(Boolean),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      modelId: entry.modelId,
      provider: entry.provider,
      status: "error" as const,
    };
  }
}

export async function executeGenerateVideo({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: GenerateVideoInput;
  runtime: GenerateVideoRuntime;
}): Promise<GenerateVideoOutput> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("Video prompt is required.");
  }

  const targets = resolveTargets(input, runtime.videoGeneration);
  const count = input.count ?? DEFAULT_VIDEO_GENERATION_COUNT;

  if (targets.length * count > MAX_VIDEO_GENERATION_TOTAL_VIDEOS) {
    throw new Error(
      `This request exceeds the ${MAX_VIDEO_GENERATION_TOTAL_VIDEOS}-video safety cap.`,
    );
  }

  const referenceImage = await resolveReferenceImage(input, runtime);
  const results = await Promise.all(
    targets.map((entry) =>
      executeTarget({
        abortSignal,
        count,
        entry,
        input,
        referenceImage,
        threadId: runtime.threadId,
        userId: runtime.userId,
      }),
    ),
  );

  const successCount = results.filter(
    (result) => result.status === "success",
  ).length;

  return {
    failureCount: results.length - successCount,
    mode: input.mode,
    prompt,
    requestedCount: count,
    successCount,
    targets: results,
  };
}

export function toGenerateVideoModelOutput(output: GenerateVideoOutput) {
  return {
    ...output,
    targets: output.targets.map((target) =>
      target.status === "success"
        ? {
            ...target,
            videos: target.videos.map((video) => ({
              ...video,
              artifactPath: VIDEO_ARTIFACT_PATH_PLACEHOLDER,
            })),
          }
        : target,
    ),
  };
}

export const __internal = {
  MAX_VIDEO_GENERATION_TOTAL_VIDEOS,
  NULLISH_OPTIONAL_INPUT_VALUES,
  VIDEO_ARTIFACT_PATH_PLACEHOLDER,
  normalizeOptionalInputString,
  resolveTargets,
};
