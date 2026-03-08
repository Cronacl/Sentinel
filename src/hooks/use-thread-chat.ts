"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useCallback, useMemo, useRef } from "react";

import type { ReasoningEffort } from "@/lib/ai/models";

type UseThreadChatOptions = {
  threadId: string;
  initialMessages?: UIMessage[];
  workspaceId: string;
  onFinish?: () => void;
  onError?: (error: Error) => void;
};

type SendThreadMessageInput = {
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
  text: string;
};

export function useThreadChat({
  threadId,
  initialMessages = [],
  workspaceId,
  onFinish,
  onError,
}: UseThreadChatOptions) {
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    [],
  );

  const chat = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish,
    onError,
  });

  const sendMessage = useCallback(
    ({ modelId, reasoningEffort, text }: SendThreadMessageInput) =>
      chat.sendMessage(
        { text },
        {
          body: {
            modelId,
            ...(reasoningEffort ? { reasoningEffort } : {}),
            workspaceId: workspaceIdRef.current,
          },
        },
      ),
    [chat],
  );

  return {
    ...chat,
    sendMessage,
  };
}
