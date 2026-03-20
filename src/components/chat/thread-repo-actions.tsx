"use client";

import {
  AiIdeaIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CodeSquareIcon,
  ComputerTerminal01Icon,
  FolderOpenIcon,
  FolderGitIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  Github,
  GithubIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BUTTON_GROUP_CHILD,
  Button,
  ButtonGroup,
  Dropdown,
  Input,
  Label,
  Popover,
  Spinner,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getDesktopApi, isDesktopRuntime } from "@/lib/desktop/client";
import type { DesktopOpenTarget } from "@/lib/desktop/contracts";
import {
  isCustomOpenTargetGlyph,
  OpenTargetGlyph,
} from "@/components/icons/open-target-icons";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";
import { GitIcon } from "../settings/mcp-catalog-icons";

type ThreadRepoActionsProps = {
  workspaceId: string;
  workspaceRootPath: string | null;
};

type FeedbackState = {
  text: string;
  tone: "error" | "success";
} | null;

function targetIcon(target: Pick<DesktopOpenTarget, "id" | "kind">) {
  if (target.kind === "terminal") {
    return ComputerTerminal01Icon;
  }

  if (target.kind === "file_manager") {
    return FolderOpenIcon;
  }

  return CodeSquareIcon;
}

export function ThreadRepoActions({
  workspaceId,
  workspaceRootPath,
}: ThreadRepoActionsProps) {
  const desktop = getDesktopApi();
  const isDesktop = isDesktopRuntime();
  const utils = api.useUtils();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [launchTargets, setLaunchTargets] = useState<DesktopOpenTarget[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [launchingTargetId, setLaunchingTargetId] = useState<string | null>(
    null,
  );
  const [preferredLaunchTargetId, setPreferredLaunchTargetId] = useState<
    string | null
  >(null);
  const [promptMode, setPromptMode] = useState<
    "branch" | "commit" | "pull-request-branch" | null
  >(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState("");

  const repoContextQuery = api.repo.getContext.useQuery(
    { workspaceId },
    {
      enabled: isDesktop && Boolean(workspaceRootPath),
      refetchInterval: isDesktop && workspaceRootPath ? 2500 : false,
      refetchOnWindowFocus: true,
    },
  );

  const repoContext = repoContextQuery.data;
  const launchPath = repoContext?.repoRoot ?? workspaceRootPath ?? null;

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

  const commitMutation = api.repo.commit.useMutation({
    onSuccess: async (result) => {
      setPromptMode(null);
      setPromptValue("");
      setPromptError("");
      setFeedback({
        text: `Committed ${result.commit.slice(0, 7)}`,
        tone: "success",
      });
      await utils.repo.getContext.invalidate({ workspaceId });
    },
    onError: (error) => {
      setPromptError(getErrorMessage(error, "Unable to create commit."));
    },
  });

  const createBranchMutation = api.repo.createBranch.useMutation({
    onSuccess: async (result) => {
      setPromptMode(null);
      setPromptValue("");
      setPromptError("");
      setFeedback({
        text: `Switched to ${result.branch}`,
        tone: "success",
      });
      await utils.repo.getContext.invalidate({ workspaceId });
    },
    onError: (error) => {
      setPromptError(getErrorMessage(error, "Unable to create branch."));
    },
  });

  const pushMutation = api.repo.push.useMutation({
    onSuccess: async (result) => {
      setFeedback({
        text: result.branch ? `Pushed ${result.branch}` : "Pushed branch",
        tone: "success",
      });
      await utils.repo.getContext.invalidate({ workspaceId });
    },
    onError: (error) => {
      setFeedback({
        text: getErrorMessage(error, "Unable to push branch."),
        tone: "error",
      });
    },
  });

  const createPullRequestMutation = api.repo.createPullRequest.useMutation({
    onSuccess: async (result) => {
      setPromptMode(null);
      setPromptValue("");
      setPromptError("");

      try {
        if (desktop) {
          await desktop.openExternal(result.pullRequestUrl);
        }

        setFeedback({
          text: result.createdBranch
            ? `Created PR from ${result.createdBranch}`
            : result.branch
              ? `Created PR from ${result.branch}`
              : "Created PR",
          tone: "success",
        });
      } catch (error) {
        setFeedback({
          text: getErrorMessage(error, "Unable to open the PR page."),
          tone: "error",
        });
      }

      await utils.repo.getContext.invalidate({ workspaceId });
    },
    onError: (error) => {
      setPromptError(getErrorMessage(error, "Unable to create PR."));
      setFeedback({
        text: getErrorMessage(error, "Unable to create PR."),
        tone: "error",
      });
    },
  });

  const initMutation = api.repo.init.useMutation({
    onSuccess: async () => {
      setFeedback({
        text: "Initialized git repository",
        tone: "success",
      });
      await utils.repo.getContext.invalidate({ workspaceId });
    },
    onError: (error) => {
      setFeedback({
        text: getErrorMessage(error, "Unable to initialize repository."),
        tone: "error",
      });
    },
  });

  const generateCommitMessageMutation =
    api.repo.generateCommitMessage.useMutation({
      onSuccess: (result) => {
        setPromptError("");
        setPromptValue(result.message);
      },
      onError: (error) => {
        setPromptError(
          getErrorMessage(error, "Unable to generate a commit message."),
        );
      },
    });

  const setPreferredOpenTargetMutation =
    api.repo.setPreferredOpenTarget.useMutation();

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

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
        if (cancelled) {
          return;
        }

        setLaunchTargets(targets);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setLaunchTargets([]);
        setFeedback({
          text: getErrorMessage(
            error,
            "Unable to load project launch targets.",
          ),
          tone: "error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTargets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, isRepoVisible, launchPath]);

  const setPrompt = useCallback(
    (mode: "branch" | "commit" | "pull-request-branch") => {
      setPromptMode(mode);
      setPromptValue("");
      setPromptError("");
      setFeedback(null);
    },
    [],
  );

  const handleLaunchTarget = useCallback(
    async (target: DesktopOpenTarget) => {
      if (!desktop || !launchPath) {
        return;
      }

      setLaunchingTargetId(target.id);
      setFeedback(null);

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

        setFeedback({
          text: didPersistPreference
            ? `Opened in ${target.label}`
            : `Opened in ${target.label}, but couldn't save it as default.`,
          tone: didPersistPreference ? "success" : "error",
        });
      } catch (error) {
        setFeedback({
          text: getErrorMessage(error, `Unable to open ${target.label}.`),
          tone: "error",
        });
      } finally {
        setLaunchingTargetId(null);
      }
    },
    [desktop, launchPath, setPreferredOpenTargetMutation],
  );

  const handlePromptSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedValue = promptValue.trim();
      if (!trimmedValue) {
        setPromptError(
          promptMode === "branch"
            ? "Enter a branch name."
            : "Enter a commit message.",
        );
        return;
      }

      setPromptError("");
      if (promptMode === "branch") {
        createBranchMutation.mutate({
          branchName: trimmedValue,
          workspaceId,
        });
        return;
      }

      if (promptMode === "pull-request-branch") {
        createPullRequestMutation.mutate({
          branchName: trimmedValue,
          workspaceId,
        });
        return;
      }

      commitMutation.mutate({
        message: trimmedValue,
        workspaceId,
      });
    },
    [
      commitMutation,
      createPullRequestMutation,
      createBranchMutation,
      promptMode,
      promptValue,
      workspaceId,
    ],
  );

  const handleCreatePullRequest = useCallback(() => {
    if (!repoContext?.githubRemote) {
      return;
    }

    setPromptError("");
    setFeedback(null);

    if (repoContext.isDefaultBranch) {
      setPrompt("pull-request-branch");
      return;
    }

    createPullRequestMutation.mutate({ workspaceId });
  }, [createPullRequestMutation, repoContext, setPrompt, workspaceId]);

  const isMutating =
    commitMutation.isPending ||
    createPullRequestMutation.isPending ||
    createBranchMutation.isPending ||
    initMutation.isPending ||
    pushMutation.isPending;
  const isGeneratingCommitMessage =
    promptMode === "commit" && generateCommitMessageMutation.isPending;

  if (!isDesktop || !workspaceRootPath) {
    return null;
  }

  if (!repoContextQuery.isLoading && repoContext && !repoContext.isGitRepo) {
    return (
      <div className="flex items-center gap-2">
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

  const canCommit = Boolean(repoContext?.hasChanges) && !isMutating;
  const canPush =
    Boolean(
      repoContext?.branch &&
        repoContext?.hasCommits &&
        repoContext?.pushRemoteName &&
        (repoContext.hasUpstream ? (repoContext.aheadCount ?? 0) > 0 : true),
    ) && !isMutating;
  const canCreatePullRequest =
    Boolean(repoContext?.githubRemote) && !isMutating;
  const canCreateBranch = !isMutating;

  return (
    <>
      <div className="flex items-center gap-2">
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
          <Popover.Root
            isOpen={promptMode !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPromptMode(null);
                setPromptError("");
              }
            }}
          >
            <Popover.Trigger>
              <Button
                aria-label="Commit changes"
                className="max-h-7 pl-2 pr-3 rounded-r-none"
                variant="tertiary"
                isDisabled={!canCommit && !isMutating}
                isPending={
                  commitMutation.isPending ||
                  pushMutation.isPending ||
                  createPullRequestMutation.isPending ||
                  createBranchMutation.isPending
                }
                onPress={() => setPrompt("commit")}
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
            </Popover.Trigger>

            <Popover.Content
              className="w-[280px] border border-border/60 bg-overlay p-0 shadow-overlay"
              placement="bottom end"
            >
              <Popover.Dialog className="p-3">
                <form
                  className="flex flex-col gap-3"
                  onSubmit={handlePromptSubmit}
                >
                  <div>
                    <Popover.Heading className="text-sm font-medium text-foreground">
                      {promptMode === "branch"
                        ? "Create branch"
                        : promptMode === "pull-request-branch"
                          ? "Create PR branch"
                          : "Commit changes"}
                    </Popover.Heading>
                    <p className="mt-0.5 text-xs text-muted">
                      {promptMode === "branch"
                        ? "Create and switch to a new branch."
                        : promptMode === "pull-request-branch"
                          ? "Enter a branch name and continue creating the PR."
                          : "Stage all changes and create a commit."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted">
                        {promptMode === "branch" ||
                        promptMode === "pull-request-branch"
                          ? "Branch name"
                          : "Commit message"}
                      </label>
                      {promptMode === "commit" ? (
                        <Button
                          className="h-6 min-w-0 px-2 text-[11px]"
                          isDisabled={
                            commitMutation.isPending ||
                            !repoContext?.hasChanges
                          }
                          isPending={isGeneratingCommitMessage}
                          onPress={() => {
                            setPromptError("");
                            generateCommitMessageMutation.mutate({
                              workspaceId,
                            });
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
                      ) : null}
                    </div>
                    <Input.Root
                      autoFocus
                      name={
                        promptMode === "branch" ||
                        promptMode === "pull-request-branch"
                          ? "branchName"
                          : "message"
                      }
                      onChange={(event) =>
                        setPromptValue(event.currentTarget.value)
                      }
                      placeholder={
                        promptMode === "branch" ||
                        promptMode === "pull-request-branch"
                          ? "feature/thread-header-actions"
                          : "Describe your changes"
                      }
                      value={promptValue}
                    />
                    {promptMode === "commit" && isGeneratingCommitMessage ? (
                      <p className="sentinel-thinking-shimmer text-xs">
                        Generating commit message...
                      </p>
                    ) : null}
                    {promptError ? (
                      <p className="text-xs text-danger">{promptError}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      onPress={() => {
                        setPromptMode(null);
                        setPromptError("");
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      isDisabled={isGeneratingCommitMessage}
                      isPending={
                        commitMutation.isPending ||
                        createBranchMutation.isPending ||
                        createPullRequestMutation.isPending
                      }
                      size="sm"
                      type="submit"
                    >
                      {promptMode === "branch"
                        ? "Create branch"
                        : promptMode === "pull-request-branch"
                          ? "Continue"
                          : "Commit"}
                    </Button>
                  </div>
                </form>
              </Popover.Dialog>
            </Popover.Content>
          </Popover.Root>

          <Dropdown>
            <Button
              className="max-h-7 max-w-6 rounded-l-none"
              isDisabled={isMutating}
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
                  if (key === "commit" && canCommit) {
                    setPrompt("commit");
                  }
                  if (key === "push" && canPush) {
                    pushMutation.mutate({ workspaceId });
                  }
                  if (key === "pull-request" && canCreatePullRequest) {
                    void handleCreatePullRequest();
                  }
                  if (key === "branch" && canCreateBranch) {
                    setPrompt("branch");
                  }
                }}
              >
                <Dropdown.Item
                  id="commit"
                  isDisabled={!canCommit}
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
                <Dropdown.Item id="push" isDisabled={!canPush} textValue="Push">
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
                  isDisabled={!canCreatePullRequest}
                  textValue="Create PR"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitPullRequestIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Create PR</Label>
                </Dropdown.Item>
                <Dropdown.Item
                  id="branch"
                  isDisabled={!canCreateBranch}
                  textValue="Create branch"
                >
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
    </>
  );
}
