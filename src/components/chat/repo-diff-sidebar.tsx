"use client";

import { FileDiff } from "@pierre/diffs/react";
import { skipToken } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  CollapseIcon,
  FolderOpenIcon,
  GitCommitHorizontalIcon,
  GitCompareIcon,
  SplitIcon,
  TextWrapIcon,
  Undo02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  CloseButton,
  Dropdown,
  Label,
  Spinner,
  Tooltip,
} from "@heroui/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sileo } from "sileo";

import { getActiveCodeThemeName } from "@/lib/appearance";
import { useRightSidebar } from "@/components/shell/shell-context";
import { getDesktopApi, isDesktopRuntime } from "@/lib/desktop/client";
import type { DesktopOpenTarget } from "@/lib/desktop/contracts";
import { getErrorMessage } from "@/lib/errors";
import {
  ensureSentinelDiffThemesRegistered,
  getSentinelCodeThemeName,
} from "@/lib/syntax/theme";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";
import { api } from "@/trpc/react";

import { formatRepoActionErrorMessage } from "./thread-repo-actions.helpers";
import {
  buildRenderableDiffCacheKey,
  getInitialRenderableFileCount,
  getNextRenderableFileCount,
  parseRenderableDiffFile,
  type RenderableDiffFile,
  type RepoDiffSourceFile,
} from "./repo-diff-sidebar.helpers";
import {
  closeRepoDiffSidebarState,
  updateRepoDiffSidebarPrefs,
  useRepoDiffSidebarState,
  type RepoDiffSidebarMode,
} from "./repo-diff-sidebar-store";

const DIFF_PANEL_UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--background) 94%, var(--foreground)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--background) 94%, var(--foreground)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--background) 94%, var(--foreground)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-addition-color-override: var(--syntax-token-inserted);
  --diffs-deletion-color-override: var(--syntax-token-deleted);
  --diffs-fg-number-addition-override: var(--syntax-token-inserted);
  --diffs-fg-number-deletion-override: var(--syntax-token-deleted);
  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));
  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 88%, var(--syntax-token-inserted));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 84%, var(--syntax-token-inserted));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 78%, var(--syntax-token-inserted));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 70%, var(--syntax-token-inserted));
  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 88%, var(--syntax-token-deleted));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 84%, var(--syntax-token-deleted));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 78%, var(--syntax-token-deleted));
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--background) 70%, var(--syntax-token-deleted));
  background-color: var(--diffs-bg) !important;
}

[data-line-type='change-addition'][data-line] span {
  color: color-mix(in srgb, currentColor 76%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line] span {
  color: color-mix(in srgb, currentColor 76%, var(--syntax-token-deleted)) !important;
}

[data-line-type='change-addition'][data-line],
[data-line-type='change-addition'][data-no-newline] {
  background-color: color-mix(in srgb, var(--background) 82%, var(--syntax-token-inserted)) !important;
  color: color-mix(in srgb, var(--foreground) 28%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line],
[data-line-type='change-deletion'][data-no-newline] {
  background-color: color-mix(in srgb, var(--background) 82%, var(--syntax-token-deleted)) !important;
  color: color-mix(in srgb, var(--foreground) 28%, var(--syntax-token-deleted)) !important;
}

[data-line-type='change-addition'][data-column-number] {
  background-color: color-mix(in srgb, var(--background) 76%, var(--syntax-token-inserted)) !important;
  color: var(--syntax-token-inserted) !important;
}

[data-line-type='change-deletion'][data-column-number] {
  background-color: color-mix(in srgb, var(--background) 76%, var(--syntax-token-deleted)) !important;
  color: var(--syntax-token-deleted) !important;
}

[data-line-type='change-addition'][data-line][data-hovered],
[data-line-type='change-addition'][data-column-number][data-hovered] {
  background-color: color-mix(in srgb, var(--background) 74%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line][data-hovered],
[data-line-type='change-deletion'][data-column-number][data-hovered] {
  background-color: color-mix(in srgb, var(--background) 74%, var(--syntax-token-deleted)) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--background) 92%, var(--foreground)) !important;
  border-block-color: color-mix(in srgb, var(--border) 80%, transparent) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--background) 92%, var(--foreground)) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent) !important;
}

[data-title] {
  transition: color 120ms ease;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--foreground) 86%, var(--accent)) !important;
}
`;

const MODE_LABELS: Record<RepoDiffSidebarMode, string> = {
  branch: "Branch",
  staged: "Staged",
  unstaged: "Unstaged",
};

ensureSentinelDiffThemesRegistered();
const EMPTY_SOURCE_FILES: RepoDiffSourceFile[] = [];

function getPreferredEditorTarget(
  openTargets: DesktopOpenTarget[],
  preferredTargetId: string | null,
) {
  return (
    openTargets.find(
      (target) =>
        target.id === preferredTargetId &&
        (target.kind === "editor" || target.kind === "ide"),
    ) ??
    openTargets.find(
      (target) => target.kind === "editor" || target.kind === "ide",
    ) ??
    null
  );
}

function resolveDiffThemeName(theme: "light" | "dark") {
  return getSentinelCodeThemeName(getActiveCodeThemeName(), theme);
}

function DiffRevealTrigger({
  isActive,
  onReveal,
}: {
  isActive: boolean;
  onReveal: () => void;
}) {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const element = triggerRef.current;
    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      onReveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onReveal();
        }
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isActive, onReveal]);

  return <div aria-hidden className="h-px w-full" ref={triggerRef} />;
}

function IconActionButton({
  ariaLabel,
  className,
  icon,
  isActive = false,
  isDisabled = false,
  onPress,
  size = 14,
  strokeWidth = 1.6,
  variant,
}: {
  ariaLabel: string;
  className?: string;
  icon: typeof ArrowReloadHorizontalIcon;
  isActive?: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  size?: number;
  strokeWidth?: number;
  variant?: "ghost" | "tertiary";
}) {
  return (
    <Tooltip.Root delay={150}>
      <Button
        aria-label={ariaLabel}
        className={["h-8 w-8 min-h-8 min-w-8 shrink-0 rounded-xl", className]
          .filter(Boolean)
          .join(" ")}
        isDisabled={isDisabled}
        isIconOnly
        onPress={onPress}
        size="sm"
        type="button"
        variant={variant ?? (isActive ? "tertiary" : "ghost")}
      >
        <HugeiconsIcon
          color="currentColor"
          icon={icon}
          size={size}
          strokeWidth={strokeWidth}
        />
      </Button>
      <Tooltip.Content
        className="rounded-xl border border-border/60 bg-overlay px-2 py-1 text-xs shadow-overlay"
        offset={10}
      >
        {ariaLabel}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function FileHeaderActions({
  canOpenInEditor,
  canRevert,
  canStage,
  canUnstage,
  isBusy,
  onOpenInEditor,
  onRevert,
  onStage,
  onUnstage,
}: {
  canOpenInEditor: boolean;
  canRevert: boolean;
  canStage: boolean;
  canUnstage: boolean;
  isBusy: boolean;
  onOpenInEditor: () => void;
  onRevert: () => void;
  onStage: () => void;
  onUnstage: () => void;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-1">
      {canStage ? (
        <IconActionButton
          ariaLabel="Stage file"
          className="h-6 min-h-6 w-6 min-w-6 text-success"
          icon={GitCommitHorizontalIcon}
          isDisabled={isBusy}
          onPress={onStage}
          size={13}
          strokeWidth={1.7}
        />
      ) : null}
      {canUnstage ? (
        <IconActionButton
          ariaLabel="Unstage file"
          className="h-6 min-h-6 w-6 min-w-6 text-warning"
          icon={Undo02Icon}
          isDisabled={isBusy}
          onPress={onUnstage}
          size={13}
          strokeWidth={1.7}
        />
      ) : null}
      {canRevert ? (
        <IconActionButton
          ariaLabel="Revert file"
          className="h-6 min-h-6 w-6 min-w-6 text-danger"
          icon={Cancel01Icon}
          isDisabled={isBusy}
          onPress={onRevert}
          size={13}
          strokeWidth={1.7}
        />
      ) : null}
      <IconActionButton
        ariaLabel="Open file in editor"
        className="h-6 min-h-6 w-6 min-w-6 text-foreground/70"
        icon={FolderOpenIcon}
        isDisabled={!canOpenInEditor || isBusy}
        onPress={onOpenInEditor}
        size={13}
        strokeWidth={1.7}
      />
    </div>
  );
}

function getCachedRenderableFile(args: {
  cache: Map<string, RenderableDiffFile>;
  file: RepoDiffSourceFile;
  mode: RepoDiffSidebarMode;
}) {
  const cacheKey = buildRenderableDiffCacheKey(args.mode, args.file);
  const cached = args.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const parsed = parseRenderableDiffFile(args.mode, args.file);
  args.cache.set(cacheKey, parsed);
  return parsed;
}

export function RepoDiffSidebar() {
  const desktop = getDesktopApi();
  const isDesktop = isDesktopRuntime();
  const { close } = useRightSidebar();
  const utils = api.useUtils();
  const resolvedTheme = useResolvedTheme();
  const sidebarState = useRepoDiffSidebarState();
  const [openTargets, setOpenTargets] = useState<DesktopOpenTarget[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [visibleFileCount, setVisibleFileCount] = useState(0);
  const renderableFileCacheRef = useRef(new Map<string, RenderableDiffFile>());

  const threadId =
    sidebarState.kind === "thread" ? sidebarState.threadId : null;
  const workspaceId =
    sidebarState.kind === "thread" ? sidebarState.workspaceId : null;
  const prefs = sidebarState.kind === "thread" ? sidebarState.prefs : null;

  const queryInput = useMemo(
    () =>
      threadId && workspaceId && prefs
        ? {
            mode: prefs.mode,
            threadId,
            workspaceId,
          }
        : null,
    [prefs, threadId, workspaceId],
  );

  const diffPanelQuery = api.repo.getDiffPanelData.useQuery(
    queryInput ?? skipToken,
    {
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  );

  const repoRoot =
    diffPanelQuery.data?.repoContext.effectiveRootPath ??
    diffPanelQuery.data?.repoContext.repoRoot ??
    null;
  const preferredOpenTargetId =
    diffPanelQuery.data?.repoContext.preferredOpenTargetId ?? null;

  useEffect(() => {
    if (!desktop || !repoRoot) {
      setIsLoadingTargets(false);
      setOpenTargets([]);
      return;
    }

    let cancelled = false;
    setIsLoadingTargets(true);

    void desktop.workspace
      .listOpenTargets(repoRoot)
      .then((targets) => {
        if (!cancelled) {
          setOpenTargets(targets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenTargets([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTargets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, repoRoot]);

  const preferredEditorTarget = useMemo(
    () => getPreferredEditorTarget(openTargets, preferredOpenTargetId),
    [openTargets, preferredOpenTargetId],
  );

  const applyRepoContext = useCallback(
    (repoContext: unknown) => {
      if (!threadId || !workspaceId) {
        return;
      }
      utils.repo.getContext.setData(
        { threadId, workspaceId },
        repoContext as never,
      );
    },
    [threadId, utils, workspaceId],
  );
  const applyDiffPanelData = useCallback(
    (nextData: unknown, mode: RepoDiffSidebarMode) => {
      if (!threadId || !workspaceId) {
        return;
      }

      utils.repo.getDiffPanelData.setData(
        { mode, threadId, workspaceId },
        nextData as never,
      );
    },
    [threadId, utils, workspaceId],
  );

  const handleMutationError = useCallback(
    (error: unknown, fallback: string) => {
      sileo.error({
        description: formatRepoActionErrorMessage(
          getErrorMessage(error, fallback),
        ),
        title: "Repo diff action failed",
      });
    },
    [],
  );

  const stageMutation = api.repo.stageFiles.useMutation({
    onError: (error) => handleMutationError(error, "Unable to stage files."),
    onSuccess: (result) => {
      applyRepoContext(result.repoContext);
      applyDiffPanelData(result, result.diff.mode);
    },
  });
  const unstageMutation = api.repo.unstageFiles.useMutation({
    onError: (error) => handleMutationError(error, "Unable to unstage files."),
    onSuccess: (result) => {
      applyRepoContext(result.repoContext);
      applyDiffPanelData(result, result.diff.mode);
    },
  });
  const revertMutation = api.repo.revertFiles.useMutation({
    onError: (error) => handleMutationError(error, "Unable to revert files."),
    onSuccess: (result) => {
      applyRepoContext(result.repoContext);
      applyDiffPanelData(result, result.diff.mode);
    },
  });

  const isMutating =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    revertMutation.isPending;

  const handleClose = useCallback(() => {
    closeRepoDiffSidebarState();
    close();
  }, [close]);

  const handleOpenInEditor = useCallback(
    async (filePath: string, lineNumber: number | null) => {
      if (!desktop || !repoRoot || !preferredEditorTarget) {
        sileo.error({
          description: "No editor target is available for this workspace.",
          title: "Open in editor failed",
        });
        return;
      }

      try {
        await desktop.workspace.openFileInTarget(
          repoRoot,
          filePath,
          preferredEditorTarget.id,
          lineNumber ?? undefined,
        );
      } catch (error) {
        sileo.error({
          description: formatRepoActionErrorMessage(
            getErrorMessage(error, "Unable to open file in editor."),
          ),
          title: "Open in editor failed",
        });
      }
    },
    [desktop, preferredEditorTarget, repoRoot],
  );

  const currentMode = prefs?.mode ?? "unstaged";
  const diff = diffPanelQuery.data?.diff;
  const diffFiles = diff?.files ?? EMPTY_SOURCE_FILES;

  useEffect(() => {
    setVisibleFileCount(getInitialRenderableFileCount(diffFiles.length));
  }, [currentMode, diffFiles]);

  const effectiveVisibleFileCount =
    visibleFileCount === 0 && diffFiles.length > 0
      ? getInitialRenderableFileCount(diffFiles.length)
      : visibleFileCount;

  const queuePrefsUpdate = useCallback(
    (patch: Parameters<typeof updateRepoDiffSidebarPrefs>[0]) => {
      startTransition(() => {
        updateRepoDiffSidebarPrefs(patch);
      });
    },
    [],
  );
  const revealMoreFiles = useCallback(() => {
    setVisibleFileCount((current) =>
      getNextRenderableFileCount(current, diffFiles.length),
    );
  }, [diffFiles.length]);

  if (sidebarState.kind !== "thread" || !prefs || !threadId || !workspaceId) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-sm text-muted">
        No diff panel selected.
      </div>
    );
  }

  const modeLabel = MODE_LABELS[currentMode];
  const fileCount = diff?.fileCount ?? 0;
  const disabledReason = diff?.disabledReason ?? null;
  const canOpenInEditor = Boolean(preferredEditorTarget) && !isLoadingTargets;
  const lineDiffType = prefs.wordDiffs ? "word-alt" : "none";

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/20 px-4 py-3">
        <Dropdown>
          <Button
            className="h-8 shrink-0 rounded-xl px-3"
            size="sm"
            variant="tertiary"
          >
            <span>{modeLabel}</span>
            {fileCount > 0 ? (
              <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-muted">
                {fileCount}
              </span>
            ) : null}
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowDown01Icon}
              size={14}
              strokeWidth={1.6}
            />
          </Button>
          <Dropdown.Popover className="min-w-[220px]" placement="bottom start">
            <Dropdown.Menu
              onAction={(key) => {
                queuePrefsUpdate({
                  mode: key as RepoDiffSidebarMode,
                });
              }}
            >
              {(["unstaged", "staged", "branch"] as const).map((mode) => (
                <Dropdown.Item
                  id={mode}
                  key={mode}
                  textValue={MODE_LABELS[mode]}
                >
                  <Label>{MODE_LABELS[mode]}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <div className="min-w-0 flex-1">
          <span className="block min-w-0 truncate text-xs text-muted">
            {diff?.sourceLabel ?? null}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip.Root delay={150}>
            <Button
              aria-label="Refresh diff"
              className="h-8 w-8 min-h-8 min-w-8 shrink-0 rounded-xl"
              isDisabled={diffPanelQuery.isPending}
              isIconOnly
              onPress={() => void diffPanelQuery.refetch()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {diffPanelQuery.isFetching ? (
                <Spinner
                  className="size-3.5 min-w-3.5"
                  color="current"
                  size="sm"
                />
              ) : (
                <HugeiconsIcon
                  color="currentColor"
                  icon={ArrowReloadHorizontalIcon}
                  size={14}
                  strokeWidth={1.6}
                />
              )}
            </Button>
            <Tooltip.Content
              className="rounded-xl border border-border/60 bg-overlay px-2 py-1 text-xs shadow-overlay"
              offset={10}
            >
              Refresh diff
            </Tooltip.Content>
          </Tooltip.Root>
          <IconActionButton
            ariaLabel={
              prefs.layout === "split"
                ? "Switch to unified diff"
                : "Switch to split diff"
            }
            icon={prefs.layout === "split" ? ArrowLeftRightIcon : SplitIcon}
            isActive={prefs.layout === "split"}
            onPress={() =>
              queuePrefsUpdate({
                layout: prefs.layout === "unified" ? "split" : "unified",
              })
            }
          />
          <IconActionButton
            ariaLabel={
              prefs.wordWrap ? "Disable word wrap" : "Enable word wrap"
            }
            icon={TextWrapIcon}
            isActive={prefs.wordWrap}
            onPress={() =>
              queuePrefsUpdate({
                wordWrap: !prefs.wordWrap,
              })
            }
          />
          <IconActionButton
            ariaLabel={
              prefs.wordDiffs ? "Disable word diffs" : "Enable word diffs"
            }
            icon={GitCompareIcon}
            isActive={prefs.wordDiffs}
            onPress={() =>
              queuePrefsUpdate({
                wordDiffs: !prefs.wordDiffs,
              })
            }
          />
          <IconActionButton
            ariaLabel={
              prefs.expandAll ? "Collapse all diffs" : "Expand all diffs"
            }
            icon={prefs.expandAll ? CollapseIcon : UnfoldMoreIcon}
            isActive={prefs.expandAll}
            onPress={() =>
              queuePrefsUpdate({
                expandAll: !prefs.expandAll,
              })
            }
          />
          <CloseButton
            aria-label="Close repo diff sidebar"
            className="shrink-0"
            onPress={handleClose}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {diffPanelQuery.isPending && !diff ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
            <Spinner color="current" size="sm" />
          </div>
        ) : diffPanelQuery.error ? (
          <div className="px-4 py-6 text-sm text-danger">
            {formatRepoActionErrorMessage(
              getErrorMessage(
                diffPanelQuery.error,
                "Unable to load diff panel.",
              ),
            )}
          </div>
        ) : disabledReason ? (
          <div className="px-4 py-6">
            <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
              {disabledReason}
            </div>
          </div>
        ) : diffFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
            No files in this diff view.
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-auto px-2 pb-2">
            {diffFiles.map((file, index) => {
              const canStage = currentMode === "unstaged";
              const canUnstage = currentMode === "staged";
              const canRevert = currentMode !== "branch";
              const shouldRenderDiff = index < effectiveVisibleFileCount;
              const parsedFile = shouldRenderDiff
                ? getCachedRenderableFile({
                    cache: renderableFileCacheRef.current,
                    file,
                    mode: currentMode,
                  })
                : null;

              return (
                <div
                  className="mb-2 overflow-hidden rounded-xl border border-border/40 bg-background/40 first:mt-2 last:mb-0"
                  data-diff-mounted={
                    shouldRenderDiff && parsedFile?.fileDiff ? "true" : "false"
                  }
                  key={`${currentMode}:${file.path}`}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/20 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-foreground/75">
                        {file.path}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        <span>
                          +{file.additions} -{file.deletions}
                        </span>
                        {parsedFile?.parseError ? (
                          <span>{parsedFile.parseError}</span>
                        ) : shouldRenderDiff ? null : (
                          <span>
                            Diff body deferred for smoother scrolling.
                          </span>
                        )}
                      </div>
                    </div>
                    <FileHeaderActions
                      canOpenInEditor={canOpenInEditor}
                      canRevert={canRevert}
                      canStage={canStage}
                      canUnstage={canUnstage}
                      isBusy={isMutating}
                      onOpenInEditor={() =>
                        void handleOpenInEditor(
                          file.path,
                          file.firstChangedLine,
                        )
                      }
                      onRevert={() => {
                        if (currentMode === "branch") return;
                        void revertMutation.mutateAsync({
                          mode: currentMode,
                          paths: [file.path],
                          threadId,
                          workspaceId,
                        });
                      }}
                      onStage={() =>
                        void stageMutation.mutateAsync({
                          mode: currentMode,
                          paths: [file.path],
                          threadId,
                          workspaceId,
                        })
                      }
                      onUnstage={() =>
                        void unstageMutation.mutateAsync({
                          mode: currentMode,
                          paths: [file.path],
                          threadId,
                          workspaceId,
                        })
                      }
                    />
                  </div>
                  {parsedFile?.fileDiff ? (
                    <FileDiff
                      fileDiff={parsedFile.fileDiff}
                      options={{
                        collapsedContextThreshold: 8,
                        disableBackground: false,
                        diffStyle:
                          prefs.layout === "split" ? "split" : "unified",
                        disableFileHeader: true,
                        expandUnchanged: prefs.expandAll,
                        lineDiffType,
                        overflow: prefs.wordWrap ? "wrap" : "scroll",
                        theme: resolveDiffThemeName(resolvedTheme),
                        themeType: resolvedTheme,
                        unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
                      }}
                    />
                  ) : shouldRenderDiff ? (
                    <pre className="overflow-auto rounded-b-lg bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                      {file.patch}
                    </pre>
                  ) : (
                    <div className="rounded-b-lg bg-background/60 px-3 py-4 text-[11px] text-muted">
                      Diff body deferred for smoother scrolling.
                    </div>
                  )}
                  <DiffRevealTrigger
                    isActive={index === effectiveVisibleFileCount}
                    onReveal={revealMoreFiles}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {diff &&
      (currentMode === "unstaged" || currentMode === "staged") &&
      diff.files.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/20 px-4 py-3">
          <div className="text-xs text-muted">
            {diff.totalAdditions > 0 ? (
              <span className="text-success">+{diff.totalAdditions}</span>
            ) : null}
            {diff.totalAdditions > 0 && diff.totalDeletions > 0 ? " " : null}
            {diff.totalDeletions > 0 ? (
              <span className="text-danger">-{diff.totalDeletions}</span>
            ) : null}
          </div>
          <Button
            className="rounded-xl"
            isDisabled={isMutating}
            onPress={() => {
              if (currentMode === "unstaged") {
                void stageMutation.mutateAsync({
                  mode: currentMode,
                  paths: diff.files.map((file) => file.path),
                  threadId,
                  workspaceId,
                });
                return;
              }

              void unstageMutation.mutateAsync({
                mode: currentMode,
                paths: diff.files.map((file) => file.path),
                threadId,
                workspaceId,
              });
            }}
            size="sm"
            variant="tertiary"
          >
            {currentMode === "unstaged" ? "Stage all" : "Unstage all"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
