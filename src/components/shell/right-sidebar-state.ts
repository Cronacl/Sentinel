import type { ReactNode } from "react";

export type RightSidebarSize = "narrow" | "wide";
export type RightSidebarPanelId = "repo-diff" | null;

export type RightSidebarState = {
  content: ReactNode | null;
  open: boolean;
  panelId: RightSidebarPanelId;
  size: RightSidebarSize;
};

export const DEFAULT_RIGHT_SIDEBAR_STATE: RightSidebarState = {
  content: null,
  open: false,
  panelId: null,
  size: "narrow",
};

export function clearRightSidebarState(
  current: RightSidebarState,
): RightSidebarState {
  if (
    !current.open &&
    current.content === null &&
    current.panelId === null &&
    current.size === "narrow"
  ) {
    return current;
  }

  return DEFAULT_RIGHT_SIDEBAR_STATE;
}
