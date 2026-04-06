"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceFileLinkContext = createContext<string | null>(null);

export function WorkspaceFileLinkProvider({
  children,
  workspaceRootPath,
}: {
  children: ReactNode;
  workspaceRootPath?: string | null;
}) {
  return (
    <WorkspaceFileLinkContext.Provider value={workspaceRootPath ?? null}>
      {children}
    </WorkspaceFileLinkContext.Provider>
  );
}

export function useWorkspaceFileLinkRootPath() {
  return useContext(WorkspaceFileLinkContext);
}
