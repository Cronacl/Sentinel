export function resolveDraftThreadRepoThreadId(input: {
  draftThreadId: string;
  handoffPending?: boolean;
  draftThreadInitialized: boolean;
  threadId?: string;
}) {
  if (input.threadId) {
    return input.threadId;
  }

  if (input.draftThreadInitialized || input.handoffPending) {
    return input.draftThreadId;
  }

  return null;
}
