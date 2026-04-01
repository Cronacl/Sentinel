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

export function useAppShortcutActions() {
  const pathname = usePathname();
  const router = useRouter();
  const utils = api.useUtils();

  const createWorkspace = api.workspaces.create.useMutation({
    onSuccess: (workspace) => {
      utils.workspaces.getCurrent.setData(undefined, {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isArchived: workspace.isArchived,
        isExpanded: workspace.isExpanded,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
        rootPath: workspace.rootPath,
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
            latestThreadUpdatedAt: null,
            name: workspace.name,
            permissionModeOverride: workspace.permissionModeOverride,
            rootPath: workspace.rootPath,
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

  const handleStartNewThread = useCallback(() => {
    window.dispatchEvent(new Event("sentinel:new-thread"));
    if (pathname !== "/") {
      router.push("/");
    }
  }, [pathname, router]);

  const handleOpenAutomations = useCallback(() => {
    router.push("/automations");
  }, [router]);

  const handleOpenSkills = useCallback(() => {
    router.push("/skills");
  }, [router]);

  const handleOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  return {
    handleCreateWorkspace,
    handleOpenAutomations,
    handleOpenSettings,
    handleOpenSkills,
    handleStartNewThread,
    isCreatingWorkspace: createWorkspace.isPending,
  };
}
