import { getCompositeModelId } from "@/lib/ai/providers/model-selection";
import {
  getDefaultReasoningEffort,
  getSupportedReasoningEfforts,
} from "@/lib/ai/providers/models";
import type { AIProvider } from "@/server/db/enums";
import type { RouterOutputs } from "@/trpc/react";

type SentinelEngineModels = RouterOutputs["engines"]["models"];

export function setSentinelModelEnabled(
  current: SentinelEngineModels | undefined,
  input: {
    isEnabled: boolean;
    modelId: string;
    provider: AIProvider;
  },
) {
  if (!current) return current;

  const compositeModelId = getCompositeModelId(input.provider, input.modelId);

  return current.map((model) =>
    model.engine === "sentinel" &&
    model.provider === input.provider &&
    model.rawModelId === input.modelId &&
    model.modelId === compositeModelId
      ? { ...model, isEnabled: input.isEnabled }
      : model,
  );
}

export function setSentinelProviderConnected(
  current: SentinelEngineModels | undefined,
  input: {
    isConnected: boolean;
    provider: AIProvider;
  },
) {
  if (!current) return current;

  return current.map((model) =>
    model.engine === "sentinel" && model.provider === input.provider
      ? { ...model, isConnected: input.isConnected }
      : model,
  );
}

export function addSentinelCustomModel(
  current: SentinelEngineModels | undefined,
  input: {
    modelId: string;
    provider: AIProvider;
  },
) {
  if (!current) return current;

  const compositeModelId = getCompositeModelId(input.provider, input.modelId);
  const existing = current.find(
    (model) =>
      model.engine === "sentinel" &&
      model.provider === input.provider &&
      model.rawModelId === input.modelId &&
      model.modelId === compositeModelId,
  );

  if (existing) {
    return setSentinelModelEnabled(current, {
      ...input,
      isEnabled: true,
    });
  }

  return [
    ...current,
    {
      contextWindow: undefined,
      defaultReasoningEffort: getDefaultReasoningEffort(
        input.provider,
        input.modelId,
      ),
      description: "Custom model",
      displayName: input.modelId,
      engine: "sentinel" as const,
      inputModalities: ["text"],
      isConnected: true,
      isEnabled: true,
      modelId: compositeModelId,
      provider: input.provider,
      rawModelId: input.modelId,
      supportedReasoningEfforts: getSupportedReasoningEfforts(
        input.provider,
        input.modelId,
      ),
    },
  ];
}

export function removeSentinelCustomModel(
  current: SentinelEngineModels | undefined,
  input: {
    modelId: string;
    provider: AIProvider;
  },
) {
  if (!current) return current;

  const compositeModelId = getCompositeModelId(input.provider, input.modelId);

  return current.filter(
    (model) =>
      !(
        model.engine === "sentinel" &&
        model.provider === input.provider &&
        model.rawModelId === input.modelId &&
        model.modelId === compositeModelId
      ),
  );
}
