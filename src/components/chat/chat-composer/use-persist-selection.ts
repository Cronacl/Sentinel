import { useCallback } from "react";

import type { ReasoningEffort } from "@/lib/ai/providers/models";
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

  const globalSelectionQuery = api.chatPreferences.get.useQuery();

  const updateGlobalSelection = api.chatPreferences.updateGlobal.useMutation({
    onMutate: (input) => {
      const previous = utils.chatPreferences.get.getData();
      utils.chatPreferences.get.setData(undefined, (current) => ({
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
      }));
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
          ...(input.modelId === undefined
            ? {}
            : { chatModelId: input.modelId }),
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
          chatModelId: data.modelId,
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
        mode?: "chat" | "plan";
        skipGlobal?: boolean;
        skipThread?: boolean;
      },
    ) => {
      if (!options?.skipGlobal) {
        updateGlobalSelection.mutate({
          mode: options?.mode,
          modelId,
          reasoningEffort,
        });
      }

      if (!options?.skipThread && canPersistThreadSelection && threadId) {
        updateThreadSelection.mutate({
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          modelId,
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

  return {
    globalSelectionQuery,
    persistSelection,
    updateGlobalSelection,
    updateThreadSelection,
  };
}
