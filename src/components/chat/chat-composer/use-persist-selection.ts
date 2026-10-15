import { useCallback } from "react";

import type { EngineOptionSelection } from "@/lib/ai/chat/engines/contract";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine } from "@/server/db/enums";
import { applyThreadSettingsCacheUpdate } from "@/lib/threads/cache";
import { api } from "@/trpc/react";

export function usePersistSelection({
  activeWorkspaceId,
  canPersistThreadSelection,
  threadId,
}: {
  activeWorkspaceId?: string;
  canPersistThreadSelection: boolean;
  threadId?: string;
}) {
  const utils = api.useUtils();

  const globalSelectionQuery = api.chatPreferences.get.useQuery(undefined, {
    staleTime: 60_000,
  });

  const updateGlobalSelection = api.chatPreferences.updateGlobal.useMutation({
    onMutate: (input) => {
      const previous = utils.chatPreferences.get.getData();
      utils.chatPreferences.get.setData(undefined, (current) => {
        const engine =
          input.engine !== undefined
            ? (input.engine ?? "sentinel")
            : (current?.engine ?? "sentinel");
        return {
          engine,
          engineInstanceId:
            input.engine === undefined
              ? (current?.engineInstanceId ?? engine)
              : input.engineInstanceId !== undefined
                ? (input.engineInstanceId ?? engine)
                : current?.engine === engine
                  ? (current?.engineInstanceId ?? engine)
                  : engine,
          mode:
            input.mode !== undefined
              ? (input.mode ?? null)
              : (current?.mode ?? null),
          modelId:
            input.modelId !== undefined
              ? input.modelId
              : (current?.modelId ?? null),
          reasoningEffort:
            input.reasoningEffort !== undefined
              ? (input.reasoningEffort ?? null)
              : (current?.reasoningEffort ?? null),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.chatPreferences.get.setData(undefined, context.previous);
      }
    },
    onSuccess: (data) => {
      utils.chatPreferences.get.setData(undefined, data);
    },
  });

  const updateThreadSelection = api.threads.updateChatSettings.useMutation({
    onMutate: (input) => {
      applyThreadSettingsCacheUpdate({
        patch: {
          ...(input.engine === undefined ? {} : { chatEngine: input.engine }),
          ...(input.engine === undefined || input.engineInstanceId === undefined
            ? {}
            : {
                chatEngineInstanceId: input.engineInstanceId ?? input.engine,
              }),
          ...(input.modelId === undefined
            ? {}
            : { chatModelId: input.modelId }),
          ...(input.modelOptions === undefined
            ? {}
            : { chatModelOptions: input.modelOptions ?? null }),
          ...(input.reasoningEffort === undefined
            ? {}
            : { chatReasoningEffort: input.reasoningEffort ?? null }),
          ...(input.mode === undefined ? {} : { mode: input.mode }),
        },
        threadId: input.threadId,
        utils,
        workspaceId: activeWorkspaceId,
      });
    },
    onError: (_error, input) => {
      void utils.threads.get.invalidate({ threadId: input.threadId });
      void utils.threads.list.invalidate();
    },
    onSuccess: (data) => {
      applyThreadSettingsCacheUpdate({
        patch: {
          chatEngine: data.engine,
          chatEngineInstanceId: data.engineInstanceId,
          chatModelId: data.modelId,
          chatModelOptions: data.modelOptions,
          chatReasoningEffort: data.reasoningEffort ?? null,
          mode: data.mode,
        },
        threadId: data.threadId,
        utils,
        workspaceId: activeWorkspaceId,
      });
    },
  });

  const persistSelection = useCallback(
    (
      modelId: string,
      reasoningEffort: ReasoningEffort | null,
      options?: {
        engine?: ChatEngine;
        /** The instance of `engine`; only sent together with it. */
        engineInstanceId?: string | null;
        mode?: "chat" | "plan";
        /** Thread only: the user default carries no model options. */
        modelOptions?: EngineOptionSelection[] | null;
        skipGlobal?: boolean;
        skipThread?: boolean;
      },
    ) => {
      const engineFields =
        options?.engine === undefined
          ? {}
          : {
              engine: options.engine,
              ...(options.engineInstanceId === undefined
                ? {}
                : { engineInstanceId: options.engineInstanceId }),
            };

      if (!options?.skipGlobal) {
        updateGlobalSelection.mutate({
          ...engineFields,
          mode: options?.mode,
          modelId,
          reasoningEffort,
        });
      }

      if (!options?.skipThread && canPersistThreadSelection && threadId) {
        updateThreadSelection.mutate({
          ...engineFields,
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          modelId,
          ...(options?.modelOptions === undefined
            ? {}
            : { modelOptions: options.modelOptions }),
          reasoningEffort,
          threadId,
        });
      }
    },
    [
      canPersistThreadSelection,
      threadId,
      updateGlobalSelection,
      updateThreadSelection,
    ],
  );

  const persistEngineSelection = useCallback(
    (
      engine: ChatEngine,
      options?: {
        engineInstanceId?: string | null;
        mode?: "chat" | "plan";
        skipThread?: boolean;
      },
    ) => {
      const instanceFields =
        options?.engineInstanceId === undefined
          ? {}
          : { engineInstanceId: options.engineInstanceId };
      updateGlobalSelection.mutate({
        engine,
        ...instanceFields,
        ...(options?.mode === undefined ? {} : { mode: options.mode }),
      });

      if (!options?.skipThread && canPersistThreadSelection && threadId) {
        updateThreadSelection.mutate({
          engine,
          ...instanceFields,
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          threadId,
        });
      }
    },
    [
      canPersistThreadSelection,
      threadId,
      updateGlobalSelection,
      updateThreadSelection,
    ],
  );

  return {
    globalSelectionQuery,
    persistEngineSelection,
    persistSelection,
    updateGlobalSelection,
    updateThreadSelection,
  };
}
