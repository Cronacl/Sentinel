export type ThreadWorkspaceScope = {
  workspaceId: string;
  workspaceKind: "project" | "quick_chat";
};

export function shouldUseRepoThreadSwitch(input: {
  sourceThread: ThreadWorkspaceScope | null;
  targetThread: ThreadWorkspaceScope;
}) {
  return Boolean(
    input.sourceThread &&
    input.sourceThread.workspaceKind === "project" &&
    input.targetThread.workspaceKind === "project" &&
    input.sourceThread.workspaceId === input.targetThread.workspaceId,
  );
}
