"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";
import {
  deriveWorkspaceName,
  pickWorkspaceDirectory,
} from "@/lib/workspaces/picker";
import { api } from "@/trpc/react";

import { useShell } from "./shell-context";
import { openSettingsRoute } from "./settings-navigation";

export function useAppShortcutActions() {
  const router = useRouter();
  const pathname = usePathname();
  const { isHomeRoute } = useShell();
  const utils = api.useUtils();

  const createWorkspace = api.workspaces.create.useMutation({
    onSuccess: (workspace) => {
      utils.workspaces.getCurrent.setData(undefined, {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isArchived: workspace.isArchived,
        isExpanded: workspace.isExpanded,
        kind: workspace.kind,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
        rootPath: workspace.rootPath,
        sortOrder: workspace.sortOrder,
        updatedAt: workspace.updatedAt,
        userId: workspace.userId,
      });
      utils.workspaces.list.setData(undefined, (current) => {
        const existing = current ?? [];
        const withoutWorkspace = existing.filter(
          (item) => item.id !== workspace.id,
        );

        return [
          {
            createdAt: workspace.createdAt,
            description: workspace.description,
            id: workspace.id,
            isExpanded: workspace.isExpanded,
            isSelected: true,
            kind: workspace.kind,
            latestThreadUpdatedAt: null,
            name: workspace.name,
            permissionModeOverride: workspace.permissionModeOverride,
            rootPath: workspace.rootPath,
            sortOrder: workspace.sortOrder,
            threadCount: 0,
            updatedAt: workspace.updatedAt,
          },
          ...withoutWorkspace.map((item) => ({ ...item, isSelected: false })),
        ];
      });
      void utils.threads.list.invalidate();
      void utils.repo.listWorkspaceStatuses.invalidate();
    },
  });

  const handleCreateWorkspace = useCallback(() => {
    void (async () => {
      try {
        const directory = await pickWorkspaceDirectory();

        if (!directory) {
          return;
        }

        await createWorkspace.mutateAsync({
          name: deriveWorkspaceName(directory),
          rootPath: directory.path,
        });
      } catch (error) {
        sileo.error({
          description: getErrorMessage(error, "Unable to add that project."),
          title: "Project creation failed",
        });
      }
    })();
  }, [createWorkspace]);

  const handleStartQuickChat = useCallback(() => {
    if (pathname === "/quick-chat") {
      window.dispatchEvent(new Event("sentinel:new-thread"));
      return;
    }

    router.push("/quick-chat");
  }, [pathname, router]);

  const handleStartNewProjectThread = useCallback(() => {
    router.push("/project-thread");
  }, [router]);

  const handleStartNewThread = useCallback(() => {
    if (isHomeRoute || pathname === "/project-thread") {
      window.dispatchEvent(new Event("sentinel:new-thread"));
      return;
    }

    router.push("/project-thread");
  }, [isHomeRoute, pathname, router]);

  const handleOpenAutomations = useCallback(() => {
    router.push("/automations");
  }, [router]);

  const handleOpenScratchpad = useCallback(() => {
    router.push("/scratchpad");
  }, [router]);

  const handleOpenSkills = useCallback(() => {
    router.push("/skills");
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    openSettingsRoute(router, "/settings", pathname);
  }, [pathname, router]);

  return {
    handleCreateWorkspace,
    handleOpenAutomations,
    handleOpenScratchpad,
    handleOpenSettings,
    handleOpenSkills,
    handleStartQuickChat,
    handleStartNewThread,
    handleStartNewProjectThread,
    isCreatingWorkspace: createWorkspace.isPending,
  };
}
