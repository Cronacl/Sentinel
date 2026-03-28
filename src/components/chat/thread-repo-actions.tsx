"use client";

import {
  AiIdeaIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CodeSquareIcon,
  ComputerTerminal01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  GithubIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BUTTON_GROUP_CHILD,
  Button,
  ButtonGroup,
  Dropdown,
  Input,
  Label,
  Modal,
  Spinner,
  Switch,
  TextArea,
  useOverlayState,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import { getDesktopApi, isDesktopRuntime } from "@/lib/desktop/client";
import type { DesktopOpenTarget } from "@/lib/desktop/contracts";
import {
  isCustomOpenTargetGlyph,
  OpenTargetGlyph,
} from "@/components/icons/open-target-icons";
import { TerminalToggleButton } from "@/components/terminal/terminal-toggle-button";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";
import {
  buildCreatePullRequestInput,
  buildGenerateCommitMessageInput,
  formatRepoActionErrorMessage,
  getActivePullRequestUrl,
  getGeneratedCommitPromptValue,
} from "./thread-repo-actions.helpers";

type ThreadRepoActionsProps = {
  threadId: string;
  workspaceId: string;
  workspaceRootPath: string | null;
};

type CommitNextStep = "commit" | "commit-push" | "commit-pr";

function targetIcon(target: Pick<DesktopOpenTarget, "id" | "kind">) {
  if (target.kind === "terminal") {
    return ComputerTerminal01Icon;
  }
  if (target.kind === "file_manager") {
    return FolderOpenIcon;
  }
  return CodeSquareIcon;
}

const NEXT_STEP_OPTIONS: {
  disabled?: (ctx: { hasGithubRemote: boolean; hasRemote: boolean }) => boolean;
  icon: typeof GitCommitIcon;
  id: CommitNextStep;
  label: string;
}[] = [
  { icon: GitCommitIcon, id: "commit", label: "Commit" },
  {
    disabled: ({ hasRemote }) => !hasRemote,
    icon: ArrowUp01Icon,
    id: "commit-push",
    label: "Commit and push",
  },
  {
    disabled: ({ hasGithubRemote }) => !hasGithubRemote,
    icon: GithubIcon,
    id: "commit-pr",
    label: "Commit and create PR",
  },
];

export function ThreadRepoActions({
  threadId,
  workspaceId,
  workspaceRootPath,
}: ThreadRepoActionsProps) {
  const desktop = getDesktopApi();
  const isDesktop = isDesktopRuntime();
  const utils = api.useUtils();
  const [launchTargets, setLaunchTargets] = useState<DesktopOpenTarget[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [launchingTargetId, setLaunchingTargetId] = useState<string | null>(
    null,
  );
  const [preferredLaunchTargetId, setPreferredLaunchTargetId] = useState<
    string | null
  >(null);

  const commitModalState = useOverlayState({});
  const pushModalState = useOverlayState({});
  const branchModalState = useOverlayState({});
  const prBranchModalState = useOverlayState({});

  const [commitMessage, setCommitMessage] = useState("");
  const [commitNextStep, setCommitNextStep] =
    useState<CommitNextStep>("commit");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [isDraft, setIsDraft] = useState(false);
  const [commitError, setCommitError] = useState("");

  const [branchName, setBranchName] = useState("");
  const [branchError, setBranchError] = useState("");

  const [prBranchName, setPrBranchName] = useState("");
  const [prBranchError, setPrBranchError] = useState("");
  const repoContextQueryInput = useMemo(
    () => ({
      threadId,
      workspaceId,
    }),
    [threadId, workspaceId],
  );

  const anyModalOpen =
    commitModalState.isOpen ||
    pushModalState.isOpen ||
    branchModalState.isOpen ||
    prBranchModalState.isOpen;

  const repoContextQuery = api.repo.getContext.useQuery(repoContextQueryInput, {
    enabled: isDesktop && Boolean(workspaceRootPath),
    refetchInterval:
      isDesktop && workspaceRootPath && !anyModalOpen ? 2500 : false,
    refetchOnWindowFocus: !anyModalOpen,
  });

  const repoContext = repoContextQuery.data;
  const launchPath = repoContext?.repoRoot ?? workspaceRootPath ?? null;

  const snapshotRef = useRef(repoContext);
  if (!anyModalOpen) {
    snapshotRef.current = repoContext;
  }
  const modalContext = anyModalOpen ? snapshotRef.current : repoContext;

  const primaryLaunchTarget = useMemo(
    () =>
      launchTargets.find((target) => target.id === preferredLaunchTargetId) ??
      launchTargets.find(
        (target) => target.kind === "editor" || target.kind === "ide",
      ) ??
      launchTargets[0] ??
      null,
    [launchTargets, preferredLaunchTargetId],
  );

  const isRepoVisible = Boolean(
    isDesktop && workspaceRootPath && repoContext?.isGitRepo,
  );

  const refreshContext = useCallback(async () => {
    await utils.repo.getContext.invalidate(repoContextQueryInput);
  }, [repoContextQueryInput, utils]);

  const applyRepoContext = useCallback(
    (nextRepoContext: typeof repoContext) => {
      utils.repo.getContext.setData(repoContextQueryInput, nextRepoContext);
    },
    [repoContextQueryInput, utils],
  );

  const commitMutation = api.repo.commit.useMutation({
    onError: (error) => {
      setCommitError(
        formatRepoActionErrorMessage(
          getErrorMessage(error, "Unable to create commit."),
        ),
      );
    },
  });

  const createBranchMutation = api.repo.createBranch.useMutation({
    onError: (error) => {
      setBranchError(
        formatRepoActionErrorMessage(
          getErrorMessage(error, "Unable to create branch."),
        ),
      );
    },
  });

  const pushMutation = api.repo.push.useMutation({
    onError: (error) => {
      const description = formatRepoActionErrorMessage(
        getErrorMessage(error, "Unable to push branch."),
      );
      sileo.error({
        description,
        title: "Push failed",
      });
    },
  });

  const createPullRequestMutation = api.repo.createPullRequest.useMutation({
    onError: (error) => {
      const msg = formatRepoActionErrorMessage(
        getErrorMessage(error, "Unable to create PR."),
      );
      setCommitError(msg);
      setPrBranchError(msg);
      if (!commitModalState.isOpen && !prBranchModalState.isOpen) {
        sileo.error({ description: msg, title: "Create PR failed" });
      }
    },
  });

  const initMutation = api.repo.init.useMutation({
    onSuccess: async () => {
      sileo.success({
        description: "Initialized git repository.",
        title: "Repository ready",
      });
      await refreshContext();
    },
    onError: (error) => {
      sileo.error({
        description: getErrorMessage(error, "Unable to initialize repository."),
        title: "Repository init failed",
      });
    },
  });

  const generateCommitMessageMutation =
    api.repo.generateCommitMessage.useMutation({
      onSuccess: (result) => {
        setCommitError("");
        setCommitMessage(getGeneratedCommitPromptValue(result));
      },
      onError: (error) => {
        setCommitError(
          formatRepoActionErrorMessage(
            getErrorMessage(error, "Unable to generate a commit message."),
          ),
        );
      },
    });

  const setPreferredOpenTargetMutation =
    api.repo.setPreferredOpenTarget.useMutation();

  useEffect(() => {
    setPreferredLaunchTargetId(repoContext?.preferredOpenTargetId ?? null);
  }, [repoContext?.preferredOpenTargetId]);

  useEffect(() => {
    if (!isRepoVisible || !launchPath || !desktop) {
      setLaunchTargets([]);
      return;
    }

    let cancelled = false;
    setIsLoadingTargets(true);

    void desktop.workspace
      .listOpenTargets(launchPath)
      .then((targets) => {
        if (!cancelled) setLaunchTargets(targets);
      })
      .catch((error) => {
        if (!cancelled) {
          setLaunchTargets([]);
          const description = formatRepoActionErrorMessage(
            getErrorMessage(error, "Unable to load project launch targets."),
          );
          sileo.error({
            description,
            title: "Project launch targets failed",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTargets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, isRepoVisible, launchPath]);

  const handleLaunchTarget = useCallback(
    async (target: DesktopOpenTarget) => {
      if (!desktop || !launchPath) return;

      setLaunchingTargetId(target.id);
      try {
        if (target.kind === "file_manager") {
          await desktop.workspace.revealInFileManager(launchPath);
        } else if (target.kind === "terminal") {
          await desktop.workspace.openInTerminal(launchPath, target.id);
        } else {
          await desktop.workspace.openInTarget(launchPath, target.id);
        }

        setPreferredLaunchTargetId(target.id);

        let didPersistPreference = true;
        try {
          await setPreferredOpenTargetMutation.mutateAsync({
            targetId: target.id,
          });
        } catch {
          didPersistPreference = false;
        }

        if (didPersistPreference) {
          sileo.success({
            description: `Opened in ${target.label}.`,
            title: "Project opened",
          });
        } else {
          sileo.warning({
            description: `Opened in ${target.label}, but couldn't save it as the default app.`,
            title: "Project opened",
          });
        }
      } catch (error) {
        sileo.error({
          description: getErrorMessage(
            error,
            `Unable to open ${target.label}.`,
          ),
          title: "Open project failed",
        });
      } finally {
        setLaunchingTargetId(null);
      }
    },
    [desktop, launchPath, setPreferredOpenTargetMutation],
  );

  const handleOpenCommitModal = useCallback(() => {
    setCommitMessage("");
    setCommitError("");
    setCommitNextStep("commit");
    setIncludeUnstaged(true);
    setIsDraft(false);
    snapshotRef.current = repoContext;
    commitModalState.open();
  }, [commitModalState, repoContext]);

  const handleOpenPushModal = useCallback(() => {
    snapshotRef.current = repoContext;
    pushModalState.open();
  }, [pushModalState, repoContext]);

  const handleOpenBranchModal = useCallback(() => {
    setBranchName("");
    setBranchError("");
    snapshotRef.current = repoContext;
    branchModalState.open();
  }, [branchModalState, repoContext]);

  const handleCommitSubmit = useCallback(async () => {
    setCommitError("");

    if (commitNextStep === "commit-pr") {
      if (repoContext?.isDefaultBranch) {
        commitModalState.close();
        setPrBranchName("");
        setPrBranchError("");
        snapshotRef.current = repoContext;
        prBranchModalState.open();
        return;
      }

      try {
        const result = await createPullRequestMutation.mutateAsync(
          buildCreatePullRequestInput({
            draft: isDraft,
            includeUnstaged,
            message: commitMessage,
            threadId,
            workspaceId,
          }),
        );
        applyRepoContext(result.repoContext);
        commitModalState.close();
        setCommitMessage("");
        if (desktop) {
          await desktop.openExternal(result.pullRequestUrl).catch(() => {});
        }
        sileo.success({
          description: result.branch
            ? `Created PR from ${result.branch}.`
            : "Created PR.",
          title: "Pull request ready",
        });
      } catch {
        /* onError handler shows the toast */
      }
      return;
    }

    let message = commitMessage.trim();
    if (!message) {
      try {
        const generated = await generateCommitMessageMutation.mutateAsync(
          buildGenerateCommitMessageInput({
            includeUnstaged,
            threadId,
            workspaceId,
          }),
        );
        message = getGeneratedCommitPromptValue(generated);
      } catch {
        return;
      }
    }

    try {
      const commitResult = await commitMutation.mutateAsync({
        includeUnstaged,
        message,
        threadId,
        workspaceId,
      });
      applyRepoContext(commitResult.repoContext);
      sileo.success({
        description: `Committed ${commitResult.commit.slice(0, 7)}.`,
        title: "Commit created",
      });
    } catch {
      return;
    }

    if (commitNextStep === "commit-push") {
      commitModalState.close();
      setCommitMessage("");
      try {
        const pushResult = await pushMutation.mutateAsync({
          threadId,
          workspaceId,
        });
        applyRepoContext(pushResult.repoContext);
        sileo.success({
          description: pushResult.branch
            ? `Pushed ${pushResult.branch}.`
            : "Pushed branch.",
          title: "Push complete",
        });
      } catch {
        /* onError handler shows the toast */
      }
      return;
    }

    commitModalState.close();
    setCommitMessage("");
  }, [
    applyRepoContext,
    commitMessage,
    commitModalState,
    commitMutation,
    commitNextStep,
    createPullRequestMutation,
    desktop,
    generateCommitMessageMutation,
    includeUnstaged,
    isDraft,
    prBranchModalState,
    pushMutation,
    repoContext,
    threadId,
    workspaceId,
  ]);

  const handleBranchSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = branchName.trim();
      if (!trimmed) {
        setBranchError("Enter a branch name.");
        return;
      }
      setBranchError("");

      try {
        const result = await createBranchMutation.mutateAsync({
          branchName: trimmed,
          threadId,
          workspaceId,
        });
        applyRepoContext(result.repoContext);
        branchModalState.close();
        setBranchName("");
        sileo.success({
          description: `Switched to ${result.branch}.`,
          title: "Branch created",
        });
      } catch {
        /* onError handler sets branchError */
      }
    },
    [
      applyRepoContext,
      branchName,
      branchModalState,
      createBranchMutation,
      threadId,
      workspaceId,
    ],
  );

  const handlePushSubmit = useCallback(async () => {
    try {
      const result = await pushMutation.mutateAsync({
        threadId,
        workspaceId,
      });
      applyRepoContext(result.repoContext);
      pushModalState.close();
      sileo.success({
        description: result.branch
          ? `Pushed ${result.branch}.`
          : "Pushed branch.",
        title: "Push complete",
      });
    } catch {
      /* onError handler shows the toast */
    }
  }, [applyRepoContext, pushModalState, pushMutation, threadId, workspaceId]);

  const handlePrBranchSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = prBranchName.trim();
      if (!trimmed) {
        setPrBranchError("Enter a branch name.");
        return;
      }
      setPrBranchError("");

      try {
        const result = await createPullRequestMutation.mutateAsync(
          buildCreatePullRequestInput({
            branchName: trimmed,
            draft: isDraft,
            includeUnstaged,
            message: commitMessage,
            threadId,
            workspaceId,
          }),
        );
        applyRepoContext(result.repoContext);
        prBranchModalState.close();
        setPrBranchName("");
        if (desktop) {
          await desktop.openExternal(result.pullRequestUrl).catch(() => {});
        }
        sileo.success({
          description: result.createdBranch
            ? `Created PR from ${result.createdBranch}.`
            : "Created PR.",
          title: "Pull request ready",
        });
      } catch {
        /* onError handler sets prBranchError */
      }
    },
    [
      applyRepoContext,
      commitMessage,
      createPullRequestMutation,
      desktop,
      includeUnstaged,
      isDraft,
      prBranchModalState,
      prBranchName,
      threadId,
      workspaceId,
    ],
  );

  const handleCreatePullRequest = useCallback(() => {
    if (!repoContext?.githubRemote) return;

    setCommitMessage("");
    setIncludeUnstaged(true);
    setIsDraft(false);

    if (repoContext.isDefaultBranch) {
      setPrBranchName("");
      setPrBranchError("");
      snapshotRef.current = repoContext;
      prBranchModalState.open();
      return;
    }

    void (async () => {
      try {
        const result = await createPullRequestMutation.mutateAsync(
          buildCreatePullRequestInput({ threadId, workspaceId }),
        );
        applyRepoContext(result.repoContext);
        if (desktop) {
          await desktop.openExternal(result.pullRequestUrl).catch(() => {});
        }
        sileo.success({
          description: result.branch
            ? `Created PR from ${result.branch}.`
            : "Created PR.",
          title: "Pull request ready",
        });
      } catch {
        /* onError handler shows the toast */
      }
    })();
  }, [
    applyRepoContext,
    createPullRequestMutation,
    desktop,
    prBranchModalState,
    repoContext,
    threadId,
    workspaceId,
  ]);

  const isGitBusy =
    commitMutation.isPending ||
    createPullRequestMutation.isPending ||
    createBranchMutation.isPending ||
    pushMutation.isPending;
  const isGeneratingCommitMessage = generateCommitMessageMutation.isPending;
  const isCommitBusy =
    commitMutation.isPending ||
    createPullRequestMutation.isPending ||
    pushMutation.isPending ||
    isGeneratingCommitMessage;

  if (!isDesktop || !workspaceRootPath) {
    return null;
  }

  if (!repoContextQuery.isLoading && repoContext && !repoContext.isGitRepo) {
    return (
      <div className="flex items-center gap-2">
        <TerminalToggleButton cwd={launchPath} />
        <Button
          isDisabled={initMutation.isPending}
          isPending={initMutation.isPending}
          onPress={() => initMutation.mutate({ workspaceId })}
          size="sm"
          className="max-h-7"
          variant="tertiary"
        >
          {({ isPending }) => (
            <>
              {!isPending ? (
                <HugeiconsIcon
                  color="currentColor"
                  icon={GithubIcon}
                  size={16}
                  strokeWidth={1.5}
                />
              ) : (
                <Spinner
                  className="size-3.5 min-w-3.5"
                  color="current"
                  size="sm"
                />
              )}
              <span>Initialize repo</span>
            </>
          )}
        </Button>
      </div>
    );
  }

  if (!isRepoVisible) {
    return null;
  }

  const hasChanges = Boolean(repoContext?.hasChanges);
  const hasPushableCommits = Boolean(
    repoContext?.branch &&
    repoContext?.hasCommits &&
    repoContext?.pushRemoteName &&
    (repoContext.hasUpstream ? (repoContext.aheadCount ?? 0) > 0 : true),
  );
  const hasGithubRemote = Boolean(repoContext?.githubRemote);
  const activePullRequestUrl = getActivePullRequestUrl({
    branch: repoContext?.branch,
    lastPullRequest: repoContext?.lastPullRequest,
  });

  const handleViewPullRequest = async () => {
    if (!desktop || !activePullRequestUrl) {
      return;
    }

    try {
      await desktop.openExternal(activePullRequestUrl);
    } catch (error) {
      const description = formatRepoActionErrorMessage(
        getErrorMessage(error, "Unable to open PR."),
      );
      sileo.error({
        description,
        title: "Open PR failed",
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <TerminalToggleButton cwd={launchPath} />
        <ButtonGroup size="sm" variant="tertiary">
          <Button
            variant="tertiary"
            aria-label={
              primaryLaunchTarget
                ? `Open project in ${primaryLaunchTarget.label}`
                : "Open project"
            }
            className="max-h-7 rounded-r-none"
            isDisabled={
              !primaryLaunchTarget ||
              isLoadingTargets ||
              launchingTargetId !== null
            }
            isPending={
              Boolean(launchingTargetId) &&
              primaryLaunchTarget?.id === launchingTargetId
            }
            onPress={() => {
              if (primaryLaunchTarget) {
                void handleLaunchTarget(primaryLaunchTarget);
              }
            }}
          >
            {({ isPending }) => (
              <>
                {isPending ? (
                  <Spinner
                    className="size-3.5 min-w-3.5"
                    color="current"
                    size="sm"
                  />
                ) : primaryLaunchTarget ? (
                  isCustomOpenTargetGlyph(primaryLaunchTarget.id) ? (
                    <OpenTargetGlyph target={primaryLaunchTarget} />
                  ) : (
                    <HugeiconsIcon
                      color="currentColor"
                      icon={targetIcon(primaryLaunchTarget)}
                      size={16}
                      strokeWidth={1.6}
                    />
                  )
                ) : (
                  <HugeiconsIcon
                    color="currentColor"
                    icon={FolderOpenIcon}
                    size={16}
                    strokeWidth={1.6}
                  />
                )}
              </>
            )}
          </Button>

          <Dropdown>
            <Button
              aria-label="Choose app to open project"
              className="max-h-7"
              isDisabled={isLoadingTargets || launchTargets.length === 0}
              isIconOnly
              {...{ [BUTTON_GROUP_CHILD]: true }}
              variant="tertiary"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.6}
              />
            </Button>

            <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
              <Dropdown.Menu
                onAction={(key) => {
                  const target = launchTargets.find(
                    (entry) => entry.id === key,
                  );
                  if (target) {
                    void handleLaunchTarget(target);
                  }
                }}
              >
                {launchTargets.map((target) => (
                  <Dropdown.Item
                    id={target.id}
                    key={target.id}
                    textValue={target.label}
                  >
                    {isCustomOpenTargetGlyph(target.id) ? (
                      <OpenTargetGlyph target={target} />
                    ) : (
                      <HugeiconsIcon
                        color="currentColor"
                        icon={targetIcon(target)}
                        size={14}
                        strokeWidth={1.5}
                      />
                    )}
                    <Label>{target.label}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </ButtonGroup>

        <div className="flex items-center">
          <Button
            aria-label="Commit changes"
            className="max-h-7 pl-2 pr-3 rounded-r-none"
            variant="tertiary"
            isDisabled={!hasChanges || isGitBusy}
            isPending={isGitBusy}
            onPress={handleOpenCommitModal}
            {...{ [BUTTON_GROUP_CHILD]: true }}
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
                    icon={GitCommitIcon}
                    size={16}
                    strokeWidth={1.5}
                  />
                )}
                <span>Commit</span>
              </>
            )}
          </Button>

          <Dropdown>
            <Button
              className="max-h-7 max-w-6 rounded-l-none"
              isDisabled={isGitBusy}
              isIconOnly
              {...{ [BUTTON_GROUP_CHILD]: true }}
              variant="tertiary"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.6}
              />
            </Button>

            <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === "commit") handleOpenCommitModal();
                  if (key === "push") handleOpenPushModal();
                  if (key === "pull-request") {
                    if (activePullRequestUrl) {
                      void handleViewPullRequest();
                    } else {
                      handleCreatePullRequest();
                    }
                  }
                  if (key === "branch") handleOpenBranchModal();
                }}
              >
                <Dropdown.Item
                  id="commit"
                  isDisabled={!hasChanges}
                  textValue="Commit"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitCommitIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Commit</Label>
                </Dropdown.Item>
                <Dropdown.Item
                  id="push"
                  isDisabled={!hasPushableCommits}
                  textValue="Push"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={ArrowUp01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Push</Label>
                </Dropdown.Item>
                <Dropdown.Item
                  id="pull-request"
                  isDisabled={!hasGithubRemote}
                  textValue={activePullRequestUrl ? "View PR" : "Create PR"}
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitPullRequestIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>
                    {activePullRequestUrl ? "View PR" : "Create PR"}
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="branch" textValue="Create branch">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitBranchIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Create branch</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>

      {/* ── Commit Modal ── */}
      <Modal.Root state={commitModalState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-border/60 w-full border sm:max-w-[380px]">
              <div className="">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-content1">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={GitCommitIcon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </div>
                  <Modal.CloseTrigger />
                </div>

                <h2 className="mt-3 text-base font-semibold text-foreground">
                  Commit your changes
                </h2>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">Branch</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={GitBranchIcon}
                        size={14}
                        strokeWidth={1.5}
                      />
                      {modalContext?.branch ?? "—"}
                    </span>
                  </div>

                  {modalContext?.hasChanges && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Changes</span>
                      <span className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">
                          {modalContext.changedFileCount}{" "}
                          {modalContext.changedFileCount === 1
                            ? "file"
                            : "files"}
                        </span>
                        {(modalContext.insertions > 0 ||
                          modalContext.deletions > 0) && (
                          <>
                            <span className="text-success">
                              +{modalContext.insertions.toLocaleString()}
                            </span>
                            <span className="text-danger">
                              -{modalContext.deletions.toLocaleString()}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2.5">
                  <Switch
                    isSelected={includeUnstaged}
                    onChange={() => setIncludeUnstaged((prev) => !prev)}
                    size="sm"
                  >
                    <Switch.Control>
                      <Switch.Thumb>
                        <Switch.Icon />
                      </Switch.Thumb>
                    </Switch.Control>
                  </Switch>
                  <span className="text-sm text-foreground">
                    Include unstaged
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Commit message
                    </span>
                    <Button
                      className="h-6 min-w-0 px-2 text-[11px]"
                      isDisabled={isCommitBusy}
                      isPending={isGeneratingCommitMessage}
                      onPress={() => {
                        setCommitError("");
                        generateCommitMessageMutation.mutate(
                          buildGenerateCommitMessageInput({
                            includeUnstaged,
                            threadId,
                            workspaceId,
                          }),
                        );
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {({ isPending }) => (
                        <>
                          {isPending ? (
                            <Spinner
                              className="size-3 min-w-3"
                              color="current"
                              size="sm"
                            />
                          ) : (
                            <HugeiconsIcon
                              color="currentColor"
                              icon={AiIdeaIcon}
                              size={13}
                              strokeWidth={1.5}
                            />
                          )}
                          <span>Generate</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <TextArea.Root
                    className="mt-2 min-h-20"
                    fullWidth
                    name="message"
                    onChange={(event) =>
                      setCommitMessage(event.currentTarget.value)
                    }
                    placeholder="Leave blank to autogenerate a commit message"
                    variant="secondary"
                    value={commitMessage}
                  />
                  {isGeneratingCommitMessage && (
                    <p className="sentinel-thinking-shimmer mt-1.5 text-xs">
                      Generating commit message...
                    </p>
                  )}
                  {commitError && (
                    <p className="mt-1.5 text-xs leading-relaxed text-danger whitespace-pre-wrap break-words">
                      {commitError}
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <span className="text-sm font-medium text-foreground">
                    Next steps
                  </span>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {NEXT_STEP_OPTIONS.map((option) => {
                      const isOptionDisabled = option.disabled?.({
                        hasGithubRemote: Boolean(modalContext?.githubRemote),
                        hasRemote: Boolean(modalContext?.pushRemoteName),
                      });
                      const isSelected = commitNextStep === option.id;

                      return (
                        <button
                          key={option.id}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-content2 text-foreground bg-background"
                              : isOptionDisabled
                                ? "cursor-not-allowed text-muted/50"
                                : "text-muted hover:bg-content1 hover:text-foreground"
                          }`}
                          disabled={isOptionDisabled}
                          onClick={() => setCommitNextStep(option.id)}
                          type="button"
                        >
                          <HugeiconsIcon
                            color="currentColor"
                            icon={option.icon}
                            size={16}
                            strokeWidth={1.5}
                          />
                          <span className="flex-1">{option.label}</span>
                          {isSelected && (
                            <HugeiconsIcon
                              color="currentColor"
                              icon={Tick02Icon}
                              size={16}
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  {commitNextStep === "commit-pr" ? (
                    <div className="flex items-center gap-2.5">
                      <Switch
                        isSelected={isDraft}
                        onChange={() => setIsDraft((prev) => !prev)}
                        size="sm"
                      >
                        <Switch.Control>
                          <Switch.Thumb>
                            <Switch.Icon />
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch>
                      <span className="text-sm text-muted">Draft</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <Button
                    isDisabled={isCommitBusy}
                    isPending={isCommitBusy}
                    onPress={() => void handleCommitSubmit()}
                    size="sm"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        Continue
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ── Push Modal ── */}
      <Modal.Root state={pushModalState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-border/60 w-full border sm:max-w-[380px]">
              <div className="">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-content1">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={ArrowUp01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </div>
                  <Modal.CloseTrigger />
                </div>

                <h2 className="mt-3 text-base font-semibold text-foreground">
                  Push changes
                </h2>

                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={GitBranchIcon}
                      size={14}
                      strokeWidth={1.5}
                    />
                    Branch
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {modalContext?.branch ?? "—"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-muted">
                  Push your latest commits to the remote repository.
                </p>

                <Button
                  className="mt-4 w-full"
                  isDisabled={pushMutation.isPending}
                  isPending={pushMutation.isPending}
                  onPress={() => void handlePushSubmit()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Push
                    </>
                  )}
                </Button>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ── Create Branch Modal ── */}
      <Modal.Root state={branchModalState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-border/60 w-full border sm:max-w-[380px]">
              <form className="" onSubmit={(e) => void handleBranchSubmit(e)}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-content1">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={GitBranchIcon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </div>
                  <Modal.CloseTrigger />
                </div>

                <h2 className="mt-3 text-base font-semibold text-foreground">
                  Work here
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Create a branch to commit changes, push, and create a PR from
                  this worktree.
                </p>

                <div className="flex flex-col gap-1 mt-2">
                  <label className="text-sm font-medium text-foreground">
                    Branch name
                  </label>
                  <Input.Root
                    autoFocus
                    name="branchName"
                    onChange={(event) =>
                      setBranchName(event.currentTarget.value)
                    }
                    placeholder="feature/my-changes"
                    value={branchName}
                  />
                  {branchError && (
                    <p className="mt-1.5 text-xs text-danger">{branchError}</p>
                  )}
                </div>

                <Button
                  className="mt-4 w-full"
                  isDisabled={createBranchMutation.isPending}
                  isPending={createBranchMutation.isPending}
                  type="submit"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Create
                    </>
                  )}
                </Button>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      {/* ── Create PR Branch Modal (when on default branch) ── */}
      <Modal.Root state={prBranchModalState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-border/60 w-full border sm:max-w-[380px]">
              <form className="" onSubmit={(e) => void handlePrBranchSubmit(e)}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-content1">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={GitPullRequestIcon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </div>
                  <Modal.CloseTrigger />
                </div>

                <h2 className="mt-3 text-base font-semibold text-foreground">
                  Create PR branch
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Enter a branch name and continue creating the pull request.
                </p>

                <div className="flex flex-col gap-1 mt-2">
                  <label className="text-sm font-medium text-foreground">
                    Branch name
                  </label>
                  <Input.Root
                    autoFocus
                    name="branchName"
                    onChange={(event) =>
                      setPrBranchName(event.currentTarget.value)
                    }
                    placeholder="feature/my-changes"
                    value={prBranchName}
                  />
                  {prBranchError && (
                    <p className="mt-1.5 text-xs leading-relaxed text-danger whitespace-pre-wrap break-words">
                      {prBranchError}
                    </p>
                  )}
                </div>

                <Button
                  className="mt-4 w-full"
                  isDisabled={createPullRequestMutation.isPending}
                  isPending={createPullRequestMutation.isPending}
                  type="submit"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Continue
                    </>
                  )}
                </Button>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
