"use client";

import {
  Add01Icon,
  ArrowDown01Icon,
  GitBranchIcon,
  Shield01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Input, Popover, ScrollShadow, Spinner } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  showBranchSwitcher: boolean;
};

type FeedbackState = {
  text: string;
  tone: "error" | "success";
} | null;

function getPermissionModeLabel(value: PermissionMode) {
  return (
    PERMISSION_MODE_OPTIONS.find((option) => option.value === value)?.label ??
    "Default permissions"
  );
}

export function ComposerWorkspaceBar({
  activeWorkspace,
  showBranchSwitcher,
}: ComposerWorkspaceBarProps) {
  const utils = api.useUtils();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [permissionPopoverOpen, setPermissionPopoverOpen] = useState(false);
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
  const repoContextQuery = api.repo.getContext.useQuery(
    { workspaceId: activeWorkspace.id },
    {
      enabled: showBranchSwitcher && Boolean(activeWorkspace.rootPath),
      refetchInterval:
        showBranchSwitcher && activeWorkspace.rootPath ? 2500 : false,
      refetchOnWindowFocus: true,
    },
  );
  const listBranchesQuery = api.repo.listBranches.useQuery(
    { workspaceId: activeWorkspace.id },
    {
      enabled: Boolean(
        showBranchSwitcher &&
        activeWorkspace.rootPath &&
        repoContextQuery.data?.isGitRepo,
      ),
    },
  );

  useEffect(() => {
    setPermissionOverride(activeWorkspace.permissionModeOverride ?? null);
  }, [activeWorkspace.id, activeWorkspace.permissionModeOverride]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

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
        setFeedback({
          text: getErrorMessage(
            error,
            "Unable to update workspace permissions.",
          ),
          tone: "error",
        });
      },
      onSuccess: (result) => {
        setPermissionOverride(result.permissionModeOverride);
        setFeedback({
          text: result.permissionModeOverride
            ? `Workspace permissions set to ${getPermissionModeLabel(result.permissionModeOverride)}`
            : "Workspace now uses global permissions",
          tone: "success",
        });
      },
      onSettled: async () => {
        await utils.workspaces.getCurrent.invalidate();
        await utils.workspaces.list.invalidate();
      },
    });

  const checkoutBranchMutation = api.repo.checkoutBranch.useMutation({
    onSuccess: async (result) => {
      setBranchError("");
      setBranchPopoverOpen(false);
      setBranchSearch("");
      setFeedback({
        text: `Switched to ${result.branch}`,
        tone: "success",
      });
      await utils.repo.getContext.invalidate({
        workspaceId: activeWorkspace.id,
      });
      await utils.repo.listBranches.invalidate({
        workspaceId: activeWorkspace.id,
      });
    },
    onError: (error) => {
      setBranchError(getErrorMessage(error, "Unable to switch branches."));
    },
  });

  const createBranchMutation = api.repo.createBranch.useMutation({
    onSuccess: async (result) => {
      setBranchError("");
      setBranchName("");
      setBranchSearch("");
      setBranchMode("list");
      setBranchPopoverOpen(false);
      setFeedback({
        text: `Switched to ${result.branch}`,
        tone: "success",
      });
      await utils.repo.getContext.invalidate({
        workspaceId: activeWorkspace.id,
      });
      await utils.repo.listBranches.invalidate({
        workspaceId: activeWorkspace.id,
      });
    },
    onError: (error) => {
      setBranchError(getErrorMessage(error, "Unable to create branch."));
    },
  });

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
    const trimmedBranchName = branchName.trim();
    if (!trimmedBranchName) {
      setBranchError("Enter a branch name.");
      return;
    }

    setBranchError("");
    createBranchMutation.mutate({
      branchName: trimmedBranchName,
      workspaceId: activeWorkspace.id,
    });
  }, [activeWorkspace.id, branchName, createBranchMutation]);

  const isBranchMutating =
    checkoutBranchMutation.isPending || createBranchMutation.isPending;

  return (
    <div className="flex min-h-9 items-center justify-between gap-2 bg-transparent px-2.5 py-2">
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

      <div className="flex min-w-0 items-center justify-end gap-2">
        {feedback ? (
          <p
            className={
              feedback.tone === "error"
                ? "truncate text-xs text-danger"
                : "truncate text-xs text-muted"
            }
          >
            {feedback.text}
          </p>
        ) : null}

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
                      {repoContextQuery.data?.branch ?? "Branch"}
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

                              setBranchError("");
                              checkoutBranchMutation.mutate({
                                branchName: branch.name,
                                workspaceId: activeWorkspace.id,
                              });
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
