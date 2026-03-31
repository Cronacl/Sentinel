"use client";

import {
  Add01Icon,
  ArrowDown01Icon,
  FolderTreeIcon,
  GitBranchIcon,
  LaptopProgrammingIcon,
  Shield01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Input, Popover, ScrollShadow, Spinner } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODE_OPTIONS,
  type PermissionMode,
} from "@/lib/security";
import { api } from "@/trpc/react";

type ComposerWorkspaceBarProps = {
  activeWorkspace: {
    id: string;
    name: string;
    permissionModeOverride?: PermissionMode | null;
    rootPath?: string | null;
  };
  onEnsureThread?: () => Promise<string | null>;
  onSetupPendingChange?: (isPending: boolean) => void;
  repoThreadId?: string;
  showBranchSwitcher: boolean;
};

function getPermissionModeLabel(value: PermissionMode) {
  return (
    PERMISSION_MODE_OPTIONS.find((option) => option.value === value)?.label ??
    "Default permissions"
  );
}

export function ComposerWorkspaceBar({
  activeWorkspace,
  onEnsureThread,
  onSetupPendingChange,
  repoThreadId,
  showBranchSwitcher,
}: ComposerWorkspaceBarProps) {
  const utils = api.useUtils();
  const [permissionPopoverOpen, setPermissionPopoverOpen] = useState(false);
  const [projectModePopoverOpen, setProjectModePopoverOpen] = useState(false);
  const [permissionOverride, setPermissionOverride] =
    useState<PermissionMode | null>(
      activeWorkspace.permissionModeOverride ?? null,
    );
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [branchMode, setBranchMode] = useState<"list" | "create">("list");
  const [branchSearch, setBranchSearch] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchError, setBranchError] = useState("");

  const securityQuery = api.security.get.useQuery();
  const repoContextInput = repoThreadId
    ? { threadId: repoThreadId, workspaceId: activeWorkspace.id }
    : { workspaceId: activeWorkspace.id };
  const repoContextQuery = api.repo.getContext.useQuery(repoContextInput, {
    enabled: showBranchSwitcher && Boolean(activeWorkspace.rootPath),
    refetchInterval:
      showBranchSwitcher && activeWorkspace.rootPath ? 2500 : false,
    refetchOnWindowFocus: true,
  });
  const listBranchesQuery = api.repo.listBranches.useQuery(repoContextInput, {
    enabled: Boolean(
      showBranchSwitcher &&
      activeWorkspace.rootPath &&
      repoContextQuery.data?.isGitRepo,
    ),
  });

  useEffect(() => {
    setPermissionOverride(activeWorkspace.permissionModeOverride ?? null);
  }, [activeWorkspace.id, activeWorkspace.permissionModeOverride]);

  const applyRepoContext = useCallback(
    (nextThreadId: string | null | undefined, repoContext: unknown) => {
      utils.repo.getContext.setData(
        nextThreadId
          ? { threadId: nextThreadId, workspaceId: activeWorkspace.id }
          : { workspaceId: activeWorkspace.id },
        repoContext as never,
      );
    },
    [activeWorkspace.id, utils.repo.getContext],
  );

  const updatePermissionOverrideMutation =
    api.workspaces.updatePermissionOverride.useMutation({
      onMutate: (input) => {
        const previousCurrentWorkspace = utils.workspaces.getCurrent.getData();
        const previousWorkspaces = utils.workspaces.list.getData();

        setPermissionOverride(input.permissionModeOverride);
        utils.workspaces.getCurrent.setData(undefined, (current) =>
          current?.id === input.workspaceId
            ? {
                ...current,
                permissionModeOverride: input.permissionModeOverride,
              }
            : current,
        );
        utils.workspaces.list.setData(undefined, (current) =>
          current?.map((workspace) =>
            workspace.id === input.workspaceId
              ? {
                  ...workspace,
                  permissionModeOverride: input.permissionModeOverride,
                }
              : workspace,
          ),
        );

        return {
          previousCurrentWorkspace,
          previousOverride: permissionOverride,
          previousWorkspaces,
        };
      },
      onError: (error, _input, context) => {
        setPermissionOverride(context?.previousOverride ?? null);
        utils.workspaces.getCurrent.setData(
          undefined,
          context?.previousCurrentWorkspace ?? null,
        );
        utils.workspaces.list.setData(
          undefined,
          context?.previousWorkspaces ?? [],
        );
        sileo.error({
          description: getErrorMessage(
            error,
            "Unable to update workspace permissions.",
          ),
          title: "Workspace permissions failed",
        });
      },
      onSuccess: (result) => {
        setPermissionOverride(result.permissionModeOverride);
        sileo.success({
          description: result.permissionModeOverride
            ? `Workspace permissions set to ${getPermissionModeLabel(result.permissionModeOverride)}.`
            : "Workspace now uses global permissions.",
          title: "Permissions updated",
        });
      },
      onSettled: async () => {
        await utils.workspaces.getCurrent.invalidate();
        await utils.workspaces.list.invalidate();
      },
    });

  const checkoutBranchMutation = api.repo.checkoutBranch.useMutation({
    onError: (error) => {
      setBranchError(getErrorMessage(error, "Unable to switch branches."));
    },
  });

  const createBranchMutation = api.repo.createBranch.useMutation({
    onError: (error) => {
      setBranchError(getErrorMessage(error, "Unable to create branch."));
    },
  });
  const resumeThreadBranchMutation = api.repo.resumeThreadBranch.useMutation();
  const enableThreadWorktreeMutation =
    api.repo.enableThreadWorktree.useMutation();
  const useLocalProjectMutation = api.repo.useLocalProject.useMutation();
  const removeThreadWorktreeMutation =
    api.repo.removeThreadWorktree.useMutation();

  const effectivePermissionMode =
    permissionOverride ??
    securityQuery.data?.permissionMode ??
    DEFAULT_PERMISSION_MODE;
  const isPermissionLoading =
    securityQuery.isLoading || updatePermissionOverrideMutation.isPending;
  const branchSwitcherVisible = Boolean(
    showBranchSwitcher &&
    activeWorkspace.rootPath &&
    repoContextQuery.data?.isGitRepo,
  );
  const canConfigureThreadEnvironment = Boolean(repoThreadId || onEnsureThread);
  const projectModeSwitcherVisible = Boolean(
    canConfigureThreadEnvironment && branchSwitcherVisible,
  );
  const threadBranch =
    repoContextQuery.data?.threadBranch ??
    repoContextQuery.data?.branch ??
    null;
  const isUsingWorktree =
    repoContextQuery.data?.threadProjectMode === "worktree";
  const hasReadyWorktree = repoContextQuery.data?.worktreeStatus === "ready";
  const branchResumeStatus =
    repoContextQuery.data?.branchResumeStatus ?? "matched";
  const branchResumeReason = repoContextQuery.data?.branchResumeReason ?? null;
  const projectModeLabel = isUsingWorktree ? "Worktree" : "Local";
  const projectModeIcon = isUsingWorktree
    ? FolderTreeIcon
    : LaptopProgrammingIcon;
  const isProjectModeLoading =
    repoContextQuery.isLoading ||
    resumeThreadBranchMutation.isPending ||
    enableThreadWorktreeMutation.isPending ||
    useLocalProjectMutation.isPending ||
    removeThreadWorktreeMutation.isPending;
  const isBranchLoading =
    repoContextQuery.isLoading ||
    listBranchesQuery.isLoading ||
    checkoutBranchMutation.isPending ||
    createBranchMutation.isPending;
  const filteredBranches = useMemo(() => {
    const query = branchSearch.trim().toLowerCase();
    const branches = listBranchesQuery.data?.branches ?? [];
    if (!query) {
      return branches;
    }

    return branches.filter((branch) =>
      branch.name.toLowerCase().includes(query),
    );
  }, [branchSearch, listBranchesQuery.data?.branches]);
  const isBranchMutating =
    checkoutBranchMutation.isPending || createBranchMutation.isPending;
  const isSetupPending = isProjectModeLoading || isBranchMutating;

  useEffect(() => {
    onSetupPendingChange?.(isSetupPending);
  }, [isSetupPending, onSetupPendingChange]);

  const syncRepoContext = useCallback(
    async (
      nextThreadId: string | null | undefined,
      repoContext: unknown,
      options?: { invalidateBranches?: boolean },
    ) => {
      applyRepoContext(nextThreadId, repoContext);

      await Promise.all([
        options?.invalidateBranches
          ? utils.repo.listBranches.invalidate(
              nextThreadId
                ? { threadId: nextThreadId, workspaceId: activeWorkspace.id }
                : { workspaceId: activeWorkspace.id },
            )
          : Promise.resolve(),
        utils.threads.list.invalidate(),
      ]);
    },
    [
      activeWorkspace.id,
      applyRepoContext,
      utils.repo.listBranches,
      utils.threads.list,
    ],
  );

  const handlePermissionChange = useCallback(
    (nextValue: PermissionMode | null) => {
      if (
        updatePermissionOverrideMutation.isPending ||
        nextValue === permissionOverride
      ) {
        return;
      }

      updatePermissionOverrideMutation.mutate({
        permissionModeOverride: nextValue,
        workspaceId: activeWorkspace.id,
      });
      setPermissionPopoverOpen(false);
    },
    [activeWorkspace.id, permissionOverride, updatePermissionOverrideMutation],
  );

  const handleCreateBranch = useCallback(() => {
    void (async () => {
      const trimmedBranchName = branchName.trim();
      if (!trimmedBranchName) {
        setBranchError("Enter a branch name.");
        return;
      }

      const resolvedThreadId =
        repoThreadId ?? (await onEnsureThread?.()) ?? null;
      setBranchError("");
      try {
        const result = await createBranchMutation.mutateAsync({
          branchName: trimmedBranchName,
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          workspaceId: activeWorkspace.id,
        });
        setBranchName("");
        setBranchSearch("");
        setBranchMode("list");
        setBranchPopoverOpen(false);
        applyRepoContext(resolvedThreadId, result.repoContext);
        await utils.repo.listBranches.invalidate(
          resolvedThreadId
            ? { threadId: resolvedThreadId, workspaceId: activeWorkspace.id }
            : { workspaceId: activeWorkspace.id },
        );
        await utils.threads.list.invalidate();
        sileo.success({
          description: `Switched to ${result.branch}.`,
          title: "Branch created",
        });
      } catch {
        /* handled by mutation */
      }
    })();
  }, [
    activeWorkspace.id,
    applyRepoContext,
    branchName,
    createBranchMutation,
    onEnsureThread,
    repoThreadId,
    utils.repo.listBranches,
    utils.threads.list,
  ]);

  const handleResumeThreadBranch = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? (await onEnsureThread?.()) ?? null;
    if (!resolvedThreadId) {
      return;
    }

    try {
      const result = await resumeThreadBranchMutation.mutateAsync({
        threadId: resolvedThreadId,
        workspaceId: activeWorkspace.id,
      });
      await syncRepoContext(resolvedThreadId, result.repoContext, {
        invalidateBranches: true,
      });
      if (!result.ok) {
        sileo.warning({
          description:
            result.repoContext.branchResumeReason ??
            "Clean the local project before switching this thread back to its branch.",
          title: threadBranch
            ? `Resume on ${threadBranch} is blocked`
            : "Resume blocked",
        });
        return;
      }
      sileo.success({
        description: result.branch
          ? `Switched the local project back to ${result.branch}.`
          : "Switched the local project back to this thread branch.",
        title: "Thread resumed",
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to resume this thread branch.",
        ),
        title: "Resume branch failed",
      });
    }
  }, [
    activeWorkspace.id,
    onEnsureThread,
    resumeThreadBranchMutation,
    repoThreadId,
    syncRepoContext,
    threadBranch,
  ]);

  const handleEnableThreadWorktree = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? (await onEnsureThread?.()) ?? null;
    if (!resolvedThreadId) {
      return;
    }

    try {
      const result = await enableThreadWorktreeMutation.mutateAsync({
        threadId: resolvedThreadId,
        workspaceId: activeWorkspace.id,
      });
      await syncRepoContext(resolvedThreadId, result.repoContext);
      sileo.success({
        description: result.branch
          ? `This thread now runs in a worktree on ${result.branch}.`
          : "This thread now runs in its own worktree.",
        title: result.created ? "Worktree created" : "Worktree ready",
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to create a worktree for this thread.",
        ),
        title: "Worktree failed",
      });
    }
  }, [
    activeWorkspace.id,
    enableThreadWorktreeMutation,
    onEnsureThread,
    repoThreadId,
    syncRepoContext,
  ]);

  const handleUseLocalProject = useCallback(async () => {
    setProjectModePopoverOpen(false);
    if (!repoThreadId && !isUsingWorktree) {
      return;
    }

    const resolvedThreadId = repoThreadId ?? (await onEnsureThread?.()) ?? null;
    if (!resolvedThreadId) {
      return;
    }

    try {
      const result = await useLocalProjectMutation.mutateAsync({
        threadId: resolvedThreadId,
        workspaceId: activeWorkspace.id,
      });
      await syncRepoContext(resolvedThreadId, result.repoContext);
      sileo.success({
        description: "This thread is back on the local project checkout.",
        title: "Using local project",
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to switch this thread back to local.",
        ),
        title: "Switch project failed",
      });
    }
  }, [
    activeWorkspace.id,
    isUsingWorktree,
    onEnsureThread,
    repoThreadId,
    syncRepoContext,
    useLocalProjectMutation,
  ]);

  const handleRemoveThreadWorktree = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? (await onEnsureThread?.()) ?? null;
    if (!resolvedThreadId) {
      return;
    }

    try {
      const result = await removeThreadWorktreeMutation.mutateAsync({
        threadId: resolvedThreadId,
        workspaceId: activeWorkspace.id,
      });
      await syncRepoContext(resolvedThreadId, result.repoContext);
      sileo.success({
        description: result.removed
          ? "Removed this thread's worktree."
          : "Cleared the saved worktree for this thread.",
        title: "Worktree removed",
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to remove this thread worktree.",
        ),
        title: "Remove worktree failed",
      });
    }
  }, [
    activeWorkspace.id,
    onEnsureThread,
    removeThreadWorktreeMutation,
    repoThreadId,
    syncRepoContext,
  ]);

  return (
    <div className="flex min-h-9 items-center justify-between gap-2 bg-transparent px-2.5 py-1">
      <div className="flex min-w-0 items-center gap-1">
        {projectModeSwitcherVisible ? (
          <Popover.Root
            isOpen={projectModePopoverOpen}
            onOpenChange={setProjectModePopoverOpen}
          >
            <Popover.Trigger>
              <Button
                className="h-7 max-w-full justify-start gap-1.5 px-2 text-muted"
                isPending={isProjectModeLoading}
                size="sm"
                variant="ghost"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner
                        className="size-3.5 min-w-3.5"
                        color="current"
                        size="sm"
                      />
                    ) : (
                      <HugeiconsIcon
                        color="currentColor"
                        icon={projectModeIcon}
                        size={15}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="truncate text-[12px]">
                      {projectModeLabel}
                    </span>
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ArrowDown01Icon}
                      size={13}
                      strokeWidth={1.5}
                    />
                  </>
                )}
              </Button>
            </Popover.Trigger>

            <Popover.Content
              className="w-64 border border-border/60 bg-overlay shadow-overlay"
              placement="top start"
            >
              <Popover.Dialog className="flex flex-col gap-1 p-1">
                {threadBranch && branchResumeStatus !== "matched" ? (
                  <div className="rounded-xl border border-border/60 bg-default/60 px-2.5 py-2">
                    <p className="text-sm text-foreground">
                      Resume on {threadBranch}
                    </p>
                    {branchResumeReason ? (
                      <p className="mt-1 text-xs text-muted">
                        {branchResumeReason}
                      </p>
                    ) : null}
                    <Button
                      className="mt-2 h-7 justify-start px-2"
                      onPress={() => void handleResumeThreadBranch()}
                      size="sm"
                      variant="secondary"
                    >
                      Resume branch
                    </Button>
                  </div>
                ) : null}

                <button
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                  onClick={() => void handleUseLocalProject()}
                  type="button"
                >
                  <div className="min-w-0">
                    <p>Local project</p>
                    <p className="text-xs text-muted">
                      Use the workspace checkout for this thread
                    </p>
                  </div>
                  {!isUsingWorktree ? (
                    <span className="text-xs text-muted">Current</span>
                  ) : null}
                </button>

                <button
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                  onClick={() => void handleEnableThreadWorktree()}
                  type="button"
                >
                  <div className="min-w-0">
                    <p>{hasReadyWorktree ? "Use worktree" : "New worktree"}</p>
                    <p className="text-xs text-muted">
                      Give this thread an isolated checkout
                    </p>
                  </div>
                  {isUsingWorktree ? (
                    <span className="text-xs text-muted">Current</span>
                  ) : null}
                </button>

                {hasReadyWorktree ? (
                  <button
                    className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                    onClick={() => void handleRemoveThreadWorktree()}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p>Remove worktree</p>
                      <p className="text-xs text-muted">
                        Delete this thread's isolated checkout
                      </p>
                    </div>
                  </button>
                ) : null}
              </Popover.Dialog>
            </Popover.Content>
          </Popover.Root>
        ) : null}

        <Popover.Root
          isOpen={permissionPopoverOpen}
          onOpenChange={setPermissionPopoverOpen}
        >
          <Popover.Trigger>
            <Button
              className="h-7 max-w-full justify-start gap-1.5 px-2 text-muted"
              isPending={isPermissionLoading}
              size="sm"
              variant="ghost"
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <Spinner
                      className="size-3.5 min-w-3.5"
                      color="current"
                      size="sm"
                    />
                  ) : (
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Shield01Icon}
                      size={15}
                      strokeWidth={1.5}
                    />
                  )}
                  <span className="truncate text-[12px]">
                    {getPermissionModeLabel(effectivePermissionMode)}
                  </span>
                  <HugeiconsIcon
                    color="currentColor"
                    icon={ArrowDown01Icon}
                    size={13}
                    strokeWidth={1.5}
                  />
                </>
              )}
            </Button>
          </Popover.Trigger>

          <Popover.Content
            className="w-56 border border-border/60 bg-overlay shadow-overlay"
            placement="top start"
          >
            <Popover.Dialog className="flex flex-col gap-1 p-1">
              <button
                className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                onClick={() => handlePermissionChange(null)}
                type="button"
              >
                <div className="min-w-0">
                  <p>Use global</p>
                  <p className="text-xs text-muted">
                    Currently{" "}
                    {getPermissionModeLabel(
                      securityQuery.data?.permissionMode ??
                        DEFAULT_PERMISSION_MODE,
                    )}
                  </p>
                </div>
                {permissionOverride == null ? (
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={1.5}
                  />
                ) : null}
              </button>

              {PERMISSION_MODE_OPTIONS.map((option) => (
                <button
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                  key={option.value}
                  onClick={() =>
                    handlePermissionChange(option.value as PermissionMode)
                  }
                  type="button"
                >
                  <div className="min-w-0">
                    <p>{option.label}</p>
                    <p className="text-xs text-muted">{option.description}</p>
                  </div>
                  {permissionOverride === option.value ? (
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Tick02Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                  ) : null}
                </button>
              ))}
            </Popover.Dialog>
          </Popover.Content>
        </Popover.Root>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        {branchSwitcherVisible ? (
          <Popover.Root
            isOpen={branchPopoverOpen}
            onOpenChange={(open) => {
              setBranchPopoverOpen(open);
              if (!open) {
                setBranchError("");
                setBranchMode("list");
                setBranchName("");
                setBranchSearch("");
              }
            }}
          >
            <Popover.Trigger>
              <Button
                className="h-7 max-w-[160px] justify-start gap-1.5 px-2 text-muted"
                isDisabled={repoContextQuery.isLoading}
                isPending={isBranchLoading}
                size="sm"
                variant="ghost"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner
                        className="size-3.5 min-w-3.5"
                        color="current"
                        size="sm"
                      />
                    ) : (
                      <HugeiconsIcon
                        color="currentColor"
                        icon={GitBranchIcon}
                        size={15}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="truncate text-[12px]">
                      {repoContextQuery.data?.threadBranch ??
                        repoContextQuery.data?.branch ??
                        "Branch"}
                    </span>
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ArrowDown01Icon}
                      size={13}
                      strokeWidth={1.5}
                    />
                  </>
                )}
              </Button>
            </Popover.Trigger>

            <Popover.Content
              className="w-64 border border-border/60 bg-overlay p-0 shadow-overlay"
              placement="top end"
            >
              <Popover.Dialog className="p-2">
                {branchMode === "list" ? (
                  <div className="flex flex-col gap-3">
                    <Input.Root
                      autoFocus
                      onChange={(event) =>
                        setBranchSearch(event.currentTarget.value)
                      }
                      placeholder="Search branches"
                      value={branchSearch}
                    />
                    <div className="flex flex-col gap-1">
                      <ScrollShadow className="max-h-64 overflow-y-auto">
                        {listBranchesQuery.isLoading ? (
                          <div className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted">
                            <Spinner
                              className="size-3.5 min-w-3.5"
                              color="current"
                              size="sm"
                            />
                          </div>
                        ) : null}
                        {filteredBranches.map((branch) => (
                          <button
                            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default disabled:opacity-60"
                            disabled={isBranchMutating}
                            key={branch.name}
                            onClick={() => {
                              if (branch.current) {
                                setBranchPopoverOpen(false);
                                return;
                              }

                              void (async () => {
                                const resolvedThreadId =
                                  repoThreadId ??
                                  (await onEnsureThread?.()) ??
                                  null;
                                setBranchError("");
                                try {
                                  const result =
                                    await checkoutBranchMutation.mutateAsync({
                                      branchName: branch.name,
                                      ...(resolvedThreadId
                                        ? { threadId: resolvedThreadId }
                                        : {}),
                                      workspaceId: activeWorkspace.id,
                                    });
                                  setBranchPopoverOpen(false);
                                  setBranchSearch("");
                                  applyRepoContext(
                                    resolvedThreadId,
                                    result.repoContext,
                                  );
                                  await utils.repo.listBranches.invalidate(
                                    resolvedThreadId
                                      ? {
                                          threadId: resolvedThreadId,
                                          workspaceId: activeWorkspace.id,
                                        }
                                      : { workspaceId: activeWorkspace.id },
                                  );
                                  await utils.threads.list.invalidate();
                                  sileo.success({
                                    description: `Switched to ${result.branch}.`,
                                    title: "Branch updated",
                                  });
                                } catch {
                                  /* handled by mutation */
                                }
                              })();
                            }}
                            type="button"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <HugeiconsIcon
                                color="currentColor"
                                icon={GitBranchIcon}
                                size={14}
                                strokeWidth={1.5}
                              />
                              <span className="truncate">{branch.name}</span>
                            </span>
                            {branch.current ? (
                              <HugeiconsIcon
                                color="currentColor"
                                icon={Tick02Icon}
                                size={16}
                                strokeWidth={1.5}
                              />
                            ) : null}
                          </button>
                        ))}
                        {!listBranchesQuery.isLoading &&
                        filteredBranches.length === 0 ? (
                          <p className="px-2.5 py-3 text-sm text-muted">
                            No branches found.
                          </p>
                        ) : null}
                      </ScrollShadow>
                    </div>
                    {branchError ? (
                      <p className="text-xs text-danger">{branchError}</p>
                    ) : null}
                    <div className="border-t border-border/50 pt-2">
                      <button
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                        onClick={() => {
                          setBranchError("");
                          setBranchMode("create");
                        }}
                        type="button"
                      >
                        <HugeiconsIcon
                          color="currentColor"
                          icon={Add01Icon}
                          size={14}
                          strokeWidth={1.5}
                        />
                        <span>New Branch</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateBranch();
                    }}
                  >
                    <div>
                      <Popover.Heading className="text-sm px-2 font-medium text-foreground">
                        New Branch
                      </Popover.Heading>
                    </div>

                    <Input.Root
                      autoFocus
                      name="branchName"
                      onChange={(event) =>
                        setBranchName(event.currentTarget.value)
                      }
                      placeholder="feature/thread-workspace-bar"
                      value={branchName}
                    />

                    {branchError ? (
                      <p className="text-xs text-danger">{branchError}</p>
                    ) : null}

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onPress={() => {
                          setBranchError("");
                          setBranchMode("list");
                          setBranchName("");
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Back
                      </Button>
                      <Button
                        isPending={createBranchMutation.isPending}
                        size="sm"
                        type="submit"
                      >
                        Create branch
                      </Button>
                    </div>
                  </form>
                )}
              </Popover.Dialog>
            </Popover.Content>
          </Popover.Root>
        ) : null}
      </div>
    </div>
  );
}
