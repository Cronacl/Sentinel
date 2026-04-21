export type ThreadWorkspaceState = {
  workspaceId: string;
  workspaceKind: "project" | "quick_chat";
};

export function shouldInspectWorkspaceThreadSwitch(input: {
  selectedThreadId: string | null;
  selectedThreadState: ThreadWorkspaceState | null;
  targetWorkspaceId: string;
}) {
  if (!input.selectedThreadId || !input.selectedThreadState) {
    return false;
  }

  return (
    input.selectedThreadState.workspaceKind === "project" &&
    input.selectedThreadState.workspaceId === input.targetWorkspaceId
  );
}
