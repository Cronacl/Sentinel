import { resolveThreadChatModel } from "./model";
import { createDrizzleThreadChatPersistence } from "./persistence";
import { parseThreadChatRequest } from "./request";
import { createReasoningMetadataTracker } from "./reasoning-metadata";
import { createThreadChatResponse } from "./stream";
import { buildConversationState, ensureThreadForChat } from "./thread";
import type {
  RunThreadChatOptions,
  ThreadChatDependencies,
} from "./types";

const defaultDependencies: ThreadChatDependencies = {
  clock: {
    now: () => Date.now(),
  },
  persistence: createDrizzleThreadChatPersistence(),
  resolveModel: resolveThreadChatModel,
};

function resolveDependencies(
  overrides?: Partial<ThreadChatDependencies>,
): ThreadChatDependencies {
  return {
    ...defaultDependencies,
    ...overrides,
  };
}

/**
 * Server entrypoint for the current thread chat flow. It keeps the existing
 * route contract intact while isolating orchestration details from the route.
 */
export async function runThreadChat(
  rawInput: unknown,
  { deps: depsOverrides, userId }: RunThreadChatOptions,
) {
  const deps = resolveDependencies(depsOverrides);
  const request = await parseThreadChatRequest(rawInput, { userId });
  const conversation = await buildConversationState(request, deps.persistence);
  const threadState = await ensureThreadForChat(conversation, deps.persistence);

  const resolvedModel = await deps.resolveModel(request, conversation);
  const tracker = createReasoningMetadataTracker({
    clock: deps.clock,
    providerId: resolvedModel.providerId,
    requestedModelId: resolvedModel.requestedModelId,
  });

  return createThreadChatResponse({
    conversation: {
      ...conversation,
      isNewThread: threadState.created && conversation.isNewThread,
    },
    persistence: deps.persistence,
    resolvedModel,
    tracker,
  });
}

export type {
  ChatPersistenceAdapter,
  ThreadChatDependencies,
  ThreadChatRequest,
  ThreadChatRequestBody,
} from "./types";
