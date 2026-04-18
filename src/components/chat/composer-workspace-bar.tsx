"use client";

import {
  Add01Icon,
  ArrowDown01Icon,
  FolderTreeIcon,
  GitBranchIcon,
  LaptopIcon,
  Shield01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Input, Popover, ScrollShadow, Spinner } from "@heroui/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODE_OPTIONS,
  type PermissionMode,
} from "@/lib/security";
import { api } from "@/trpc/react";
import {
  resolveComposerWorkspaceBarDisplayState,
  resolveComposerWorkspaceBarLiveState,
  type ComposerWorkspaceBarDisplayState,
} from "./composer-workspace-bar.helpers";
import type { DraftProjectMode } from "./draft-thread-project-mode";

type ComposerWorkspaceBarProps = {
  activeWorkspace: {
    id: string;
    kind?: "project" | "quick_chat";
    name: string;
    permissionModeOverride?: PermissionMode | null;
    rootPath?: string | null;
  };
  deferRepoContextFetch?: boolean;
  draftPreparedWorktree?: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode?: DraftProjectMode;
  draftThreadId?: string;
  onDraftPreparedWorktreeChange?: (
    worktree: { branch: string; path: string } | null,
  ) => void;
  onDraftProjectModeChange?: (mode: DraftProjectMode) => void;
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

export const ComposerWorkspaceBar = memo(function ComposerWorkspaceBar({
  activeWorkspace,
  deferRepoContextFetch = false,
  draftPreparedWorktree = null,
  draftProjectMode = "local",
  draftThreadId,
  onDraftPreparedWorktreeChange,
  onDraftProjectModeChange,
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
  const [stableDisplayState, setStableDisplayState] =
    useState<ComposerWorkspaceBarDisplayState | null>(null);

  const securityQuery = api.security.get.useQuery();
  const repoContextInput = repoThreadId
    ? { threadId: repoThreadId, workspaceId: activeWorkspace.id }
    : { workspaceId: activeWorkspace.id };
  const cachedRepoContext = utils.repo.getContext.getData(repoContextInput);
  const repoContextQuery = api.repo.getContext.useQuery(repoContextInput, {
    ...(cachedRepoContext ? { initialData: cachedRepoContext } : {}),
    enabled:
      showBranchSwitcher &&
      Boolean(activeWorkspace.rootPath) &&
      !deferRepoContextFetch,
    refetchInterval:
      showBranchSwitcher &&
      activeWorkspace.rootPath &&
      repoThreadId &&
      !deferRepoContextFetch
        ? 2500
        : false,
    refetchOnWindowFocus: Boolean(repoThreadId) && !deferRepoContextFetch,
    staleTime: repoThreadId ? 2_500 : 15_000,
  });
  const listBranchesQuery = api.repo.listBranches.useQuery(repoContextInput, {
    enabled: Boolean(
      branchPopoverOpen &&
      !deferRepoContextFetch &&
      showBranchSwitcher &&
      activeWorkspace.rootPath &&
      repoContextQuery.data?.isGitRepo,
    ),
    staleTime: 30_000,
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
      const message = getErrorMessage(error, "Unable to switch branches.");
      setBranchError(message);
      sileo.error({
        description: message,
        title: "Branch switch failed",
      });
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
  const prepareThreadWorktreeMutation =
    api.repo.prepareThreadWorktree.useMutation();
  const discardPreparedThreadWorktreeMutation =
    api.repo.discardPreparedThreadWorktree.useMutation();
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
  const canConfigureThreadEnvironment = Boolean(repoThreadId);
  const hasDraftProjectMode = Boolean(
    onDraftProjectModeChange && !repoThreadId,
  );
  const projectModeSwitcherVisible = Boolean(
    branchSwitcherVisible &&
    (canConfigureThreadEnvironment || hasDraftProjectMode),
  );
  const isProjectModeLoading =
    (repoContextQuery.isLoading && !repoContextQuery.data) ||
    resumeThreadBranchMutation.isPending ||
    enableThreadWorktreeMutation.isPending ||
    prepareThreadWorktreeMutation.isPending ||
    discardPreparedThreadWorktreeMutation.isPending ||
    useLocalProjectMutation.isPending ||
    removeThreadWorktreeMutation.isPending;
  const liveDisplayState = useMemo(
    () =>
      resolveComposerWorkspaceBarLiveState({
        draftPreparedWorktree,
        draftProjectMode,
        repoContext: repoContextQuery.data,
        repoThreadId,
      }),
    [
      draftPreparedWorktree,
      draftProjectMode,
      repoContextQuery.data,
      repoThreadId,
    ],
  );
  const isRepoStatePending = Boolean(
    repoContextQuery.isFetching || isProjectModeLoading,
  );
  const displayState = useMemo(
    () =>
      resolveComposerWorkspaceBarDisplayState({
        isRepoStatePending,
        liveState: liveDisplayState,
        previousStableState: stableDisplayState,
      }),
    [isRepoStatePending, liveDisplayState, stableDisplayState],
  );
  const threadBranch = displayState.threadBranch;
  const isUsingWorktree = displayState.isUsingWorktree;
  const displayBranch = displayState.displayBranch;
  const hasReadyWorktree = displayState.hasReadyWorktree;
  const branchResumeStatus =
    repoContextQuery.data?.branchResumeStatus ?? "matched";
  const branchResumeReason = repoContextQuery.data?.branchResumeReason ?? null;
  const projectModeLabel = displayState.projectModeLabel;
  const projectModeIcon = isUsingWorktree ? FolderTreeIcon : LaptopIcon;
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

  useEffect(() => {
    if (!isRepoStatePending) {
      setStableDisplayState(liveDisplayState);
    }
  }, [isRepoStatePending, liveDisplayState]);

  const handlePrepareDraftWorktree = useCallback(async () => {
    if (!draftThreadId || !onDraftProjectModeChange) {
      return;
    }

    setProjectModePopoverOpen(false);
    try {
      const result = await prepareThreadWorktreeMutation.mutateAsync({
        threadId: draftThreadId,
        workspaceId: activeWorkspace.id,
      });
      onDraftPreparedWorktreeChange?.({
        branch: result.branch,
        path: result.path,
      });
      onDraftProjectModeChange("worktree");
    } catch (error) {
      onDraftPreparedWorktreeChange?.(null);
      onDraftProjectModeChange("local");
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to prepare a worktree for this thread.",
        ),
        title: "Worktree failed",
      });
    }
  }, [
    activeWorkspace.id,
    draftThreadId,
    onDraftPreparedWorktreeChange,
    onDraftProjectModeChange,
    prepareThreadWorktreeMutation,
  ]);

  const handleDiscardDraftWorktree = useCallback(async () => {
    setProjectModePopoverOpen(false);
    onDraftProjectModeChange?.("local");
    onDraftPreparedWorktreeChange?.(null);

    if (!draftThreadId || !draftPreparedWorktree) {
      return;
    }

    try {
      await discardPreparedThreadWorktreeMutation.mutateAsync({
        threadId: draftThreadId,
        workspaceId: activeWorkspace.id,
      });
    } catch (error) {
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to clean up the draft worktree.",
        ),
        title: "Worktree cleanup failed",
      });
    }
  }, [
    activeWorkspace.id,
    discardPreparedThreadWorktreeMutation,
    draftPreparedWorktree,
    draftThreadId,
    onDraftPreparedWorktreeChange,
    onDraftProjectModeChange,
  ]);

  const resyncDraftWorktreeToCurrentBranch = useCallback(async () => {
    if (
      !hasDraftProjectMode ||
      draftProjectMode !== "worktree" ||
      !draftThreadId
    ) {
      return;
    }

    if (draftPreparedWorktree) {
      await discardPreparedThreadWorktreeMutation
        .mutateAsync({
          threadId: draftThreadId,
          workspaceId: activeWorkspace.id,
        })
        .catch(() => undefined);
    }

    try {
      const result = await prepareThreadWorktreeMutation.mutateAsync({
        threadId: draftThreadId,
        workspaceId: activeWorkspace.id,
      });
      onDraftPreparedWorktreeChange?.({
        branch: result.branch,
        path: result.path,
      });
    } catch (error) {
      onDraftPreparedWorktreeChange?.(null);
      onDraftProjectModeChange?.("local");
      sileo.error({
        description: getErrorMessage(
          error,
          "Unable to prepare a worktree for this thread.",
        ),
        title: "Worktree failed",
      });
    }
  }, [
    activeWorkspace.id,
    discardPreparedThreadWorktreeMutation,
    draftPreparedWorktree,
    draftProjectMode,
    draftThreadId,
    hasDraftProjectMode,
    onDraftPreparedWorktreeChange,
    onDraftProjectModeChange,
    prepareThreadWorktreeMutation,
  ]);

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

      const resolvedThreadId = repoThreadId ?? null;
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
        await resyncDraftWorktreeToCurrentBranch();
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
    repoThreadId,
    resyncDraftWorktreeToCurrentBranch,
    utils.repo.listBranches,
    utils.threads.list,
  ]);

  const handleResumeThreadBranch = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? null;
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
    resumeThreadBranchMutation,
    repoThreadId,
    syncRepoContext,
    threadBranch,
  ]);

  const handleEnableThreadWorktree = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? null;
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
    repoThreadId,
    syncRepoContext,
  ]);

  const handleUseLocalProject = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? null;
    if (!resolvedThreadId) {
      if (!repoThreadId && onDraftProjectModeChange) {
        await handleDiscardDraftWorktree();
      }
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
    handleDiscardDraftWorktree,
    isUsingWorktree,
    onDraftProjectModeChange,
    repoThreadId,
    syncRepoContext,
    useLocalProjectMutation,
  ]);

  const handleRemoveThreadWorktree = useCallback(async () => {
    setProjectModePopoverOpen(false);
    const resolvedThreadId = repoThreadId ?? null;
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

            <Popover.Content className="w-64 " placement="top start">
              <Popover.Dialog className="flex flex-col gap-1 p-1">
                {hasDraftProjectMode ? (
                  <>
                    <button
                      className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                      onClick={() => void handleDiscardDraftWorktree()}
                      type="button"
                    >
                      <div className="min-w-0">
                        <p>Local project</p>
                        <p className="text-xs text-muted">
                          Start this thread on the workspace checkout
                        </p>
                      </div>
                      {!isUsingWorktree ? (
                        <span className="text-xs text-muted">Current</span>
                      ) : null}
                    </button>

                    <button
                      className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                      onClick={() => void handlePrepareDraftWorktree()}
                      type="button"
                    >
                      <div className="min-w-0">
                        <p>Worktree</p>
                        <p className="text-xs text-muted">
                          Prepare an isolated checkout before the first message
                        </p>
                      </div>
                      {isUsingWorktree ? (
                        <span className="text-xs text-muted">Current</span>
                      ) : null}
                    </button>
                  </>
                ) : null}

                {!hasDraftProjectMode &&
                threadBranch &&
                branchResumeStatus !== "matched" ? (
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

                {!hasDraftProjectMode ? (
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
                ) : null}

                {!hasDraftProjectMode ? (
                  <button
                    className="flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-default"
                    onClick={() => void handleEnableThreadWorktree()}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p>
                        {hasReadyWorktree ? "Use worktree" : "New worktree"}
                      </p>
                      <p className="text-xs text-muted">
                        Give this thread an isolated checkout
                      </p>
                    </div>
                    {isUsingWorktree ? (
                      <span className="text-xs text-muted">Current</span>
                    ) : null}
                  </button>
                ) : null}

                {!hasDraftProjectMode && hasReadyWorktree ? (
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

          <Popover.Content className="w-56 " placement="top start">
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
                      {displayBranch ?? "Branch"}
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

            <Popover.Content className="w-64 " placement="top end">
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
                                setBranchSearch("");
                                setBranchPopoverOpen(false);
                                return;
                              }

                              void (async () => {
                                const resolvedThreadId = repoThreadId ?? null;
                                setBranchPopoverOpen(false);
                                setBranchSearch("");
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
                                  applyRepoContext(
                                    resolvedThreadId,
                                    result.repoContext,
                                  );
                                  await resyncDraftWorktreeToCurrentBranch();
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
                                    description: result.reusedExistingWorktree
                                      ? `This thread is now using the existing worktree on ${result.branch}.`
                                      : result.switchedToLocalProject
                                        ? `This thread is now using the local project on ${result.branch}.`
                                        : `Switched to ${result.branch}.`,
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
});
