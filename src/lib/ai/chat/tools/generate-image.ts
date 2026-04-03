import { generateImage } from "ai";
import { z } from "zod";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import {
  getImageModelsForProvider,
  supportsCustomImageModels,
  type ImageGenerationRuntime,
} from "@/lib/ai/providers/images";
import {
  DEFAULT_IMAGE_GENERATION_COUNT,
  IMAGE_GENERATION_MODE_VALUES,
  MAX_IMAGE_GENERATION_IMAGES_PER_TARGET,
  MAX_IMAGE_GENERATION_TARGETS,
  MAX_IMAGE_GENERATION_TOTAL_IMAGES,
} from "@/lib/image-generation";
import { AI_PROVIDERS, type AIProvider } from "@/server/db/enums";

const IMAGE_DATA_URL_PLACEHOLDER =
  "[omitted from model output; image preview available in the UI]";

const imageTargetProviderSchema = z.enum(AI_PROVIDERS);

export const generateImageInputSchema = z
  .object({
    aspectRatio: z
      .string()
      .regex(/^\d+:\d+$/)
      .optional()
      .describe("Optional aspect ratio like 1:1 or 16:9."),
    count: z
      .number()
      .int()
      .min(1)
      .max(MAX_IMAGE_GENERATION_IMAGES_PER_TARGET)
      .default(DEFAULT_IMAGE_GENERATION_COUNT)
      .describe("Number of images to generate per provider."),
    mode: z
      .enum(IMAGE_GENERATION_MODE_VALUES)
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
      .describe("Describe the image you want to generate."),
    provider: imageTargetProviderSchema
      .optional()
      .describe("Optional provider override for single-provider generation."),
    providers: z
      .array(imageTargetProviderSchema)
      .min(1)
      .max(MAX_IMAGE_GENERATION_TARGETS)
      .optional()
      .describe("Optional provider subset when mode is multi_model."),
    seed: z.number().int().optional().describe("Optional deterministic seed."),
    size: z
      .string()
      .regex(/^\d+x\d+$/)
      .optional()
      .describe("Optional size like 1024x1024."),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "multi_model" && value.modelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "modelId overrides are only supported in single mode.",
        path: ["modelId"],
      });
    }

    const providerCount =
      value.mode === "multi_model" ? (value.providers?.length ?? 0) : 1;
    const totalRequested = providerCount * value.count;
    if (
      providerCount > 0 &&
      totalRequested > MAX_IMAGE_GENERATION_TOTAL_IMAGES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Requested output exceeds the ${MAX_IMAGE_GENERATION_TOTAL_IMAGES}-image limit.`,
        path: ["count"],
      });
    }
  });

const generatedImageSchema = z.object({
  dataUrl: z.string(),
  mediaType: z.string(),
});

const successfulTargetSchema = z.object({
  images: z.array(generatedImageSchema).min(1),
  modelId: z.string(),
  provider: imageTargetProviderSchema,
  providerMetadataSummary: z.string().nullable(),
  responseModelId: z.string().nullable(),
  status: z.literal("success"),
  warnings: z.array(z.string()),
});

const failedTargetSchema = z.object({
  error: z.string(),
  modelId: z.string(),
  provider: imageTargetProviderSchema,
  status: z.literal("error"),
});

export const generateImageTargetSchema = z.discriminatedUnion("status", [
  successfulTargetSchema,
  failedTargetSchema,
]);

export const generateImageOutputSchema = z.object({
  failureCount: z.number().int().min(0),
  mode: z.enum(IMAGE_GENERATION_MODE_VALUES),
  prompt: z.string(),
  requestedCount: z.number().int().min(1),
  successCount: z.number().int().min(0),
  targets: z.array(generateImageTargetSchema),
});

export type GenerateImageInput = z.infer<typeof generateImageInputSchema>;
export type GenerateImageOutput = z.infer<typeof generateImageOutputSchema>;

type GenerateImageRuntime = {
  imageGeneration: ImageGenerationRuntime;
};

function stringifyWarning(value: unknown) {
  if (!value || typeof value !== "object") {
    return String(value ?? "");
  }

  const candidate = value as { message?: unknown; type?: unknown };
  const label =
    typeof candidate.type === "string" && candidate.type.length > 0
      ? candidate.type
      : "warning";
  const message =
    typeof candidate.message === "string" && candidate.message.length > 0
      ? candidate.message
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

function toDataUrl(base64: string, mediaType: string) {
  return `data:${mediaType};base64,${base64}`;
}

function requireTargetProvider(
  runtime: ImageGenerationRuntime,
  provider: AIProvider,
) {
  const entry = runtime.providers[provider];
  if (!entry) {
    throw new Error(
      `Image provider "${provider}" is not configured, enabled, or missing a valid model. Check Settings > Images.`,
    );
  }

  return entry;
}

function resolveTargets(
  input: GenerateImageInput,
  runtime: ImageGenerationRuntime,
) {
  if (input.mode === "single") {
    const provider = input.provider ?? runtime.defaultProvider;
    if (!provider) {
      throw new Error(
        "No image provider is available. Configure one in Settings > Images.",
      );
    }

    const entry = requireTargetProvider(runtime, provider);
    const requestedModelId = input.modelId?.trim() || null;
    if (requestedModelId) {
      const isKnownModel = getImageModelsForProvider(provider).some(
        (model) => model.id === requestedModelId,
      );
      if (!isKnownModel && !supportsCustomImageModels(provider)) {
        throw new Error(
          `Model "${requestedModelId}" is not a valid image model override for provider "${provider}".`,
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
      "No image providers are available. Configure one in Settings > Images.",
    );
  }

  return targetProviders.map((provider) =>
    requireTargetProvider(runtime, provider),
  );
}

async function executeTarget({
  abortSignal,
  count,
  entry,
  input,
}: {
  abortSignal?: AbortSignal;
  count: number;
  entry: {
    config: Record<string, unknown>;
    modelId: string;
    provider: AIProvider;
  };
  input: GenerateImageInput;
}) {
  try {
    const providerInstance = createProviderInstance(
      entry.provider,
      entry.config,
    ) as {
      imageModel: (modelId: string) => unknown;
    };
    const model = providerInstance.imageModel(entry.modelId) as Parameters<
      typeof generateImage
    >[0]["model"];
    const result = await generateImage({
      abortSignal,
      aspectRatio: input.aspectRatio as `${number}:${number}` | undefined,
      model,
      n: count,
      prompt: input.prompt.trim(),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.size ? { size: input.size as `${number}x${number}` } : {}),
    });

    return {
      images: result.images.map((image) => ({
        dataUrl: toDataUrl(image.base64, image.mediaType),
        mediaType: image.mediaType,
      })),
      modelId: entry.modelId,
      provider: entry.provider,
      providerMetadataSummary: summarizeProviderMetadata(
        result.providerMetadata,
      ),
      responseModelId:
        result.responses[result.responses.length - 1]?.modelId ?? null,
      status: "success" as const,
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

export async function executeGenerateImage({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: GenerateImageInput;
  runtime: GenerateImageRuntime;
}): Promise<GenerateImageOutput> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("Image prompt is required.");
  }

  const targets = resolveTargets(input, runtime.imageGeneration);
  const count = input.count ?? DEFAULT_IMAGE_GENERATION_COUNT;

  if (targets.length * count > MAX_IMAGE_GENERATION_TOTAL_IMAGES) {
    throw new Error(
      `This request exceeds the ${MAX_IMAGE_GENERATION_TOTAL_IMAGES}-image safety cap.`,
    );
  }

  const results = await Promise.all(
    targets.map((entry) =>
      executeTarget({
        abortSignal,
        count,
        entry,
        input,
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

export function toGenerateImageModelOutput(output: GenerateImageOutput) {
  return {
    ...output,
    targets: output.targets.map((target) =>
      target.status === "success"
        ? {
            ...target,
            images: target.images.map((image) => ({
              ...image,
              dataUrl: IMAGE_DATA_URL_PLACEHOLDER,
            })),
          }
        : target,
    ),
  };
}

export const __internal = {
  IMAGE_DATA_URL_PLACEHOLDER,
  MAX_IMAGE_GENERATION_TOTAL_IMAGES,
  resolveTargets,
};
