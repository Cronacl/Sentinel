"use client";

import { FileDiff } from "@pierre/diffs/react";
import { skipToken } from "@tanstack/react-query";
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  ArrowRight01Icon,
  CollapseIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitCompareIcon,
  Search01Icon,
  TextWrapIcon,
  Tick02Icon,
  Undo02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";
import {
  Button,
  ButtonGroup,
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
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopOpenTarget } from "@/lib/desktop/contracts";
import { getErrorMessage } from "@/lib/errors";
import {
  detectLanguageFromPath,
  languageToVSCodeIcon,
} from "@/lib/syntax/highlighter";
import {
  ensureSentinelDiffThemesRegistered,
  getSentinelCodeThemeName,
} from "@/lib/syntax/theme";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";
import { api } from "@/trpc/react";

import { formatRepoActionErrorMessage } from "./thread-repo-actions.helpers";
import {
  buildRenderableDiffCacheKey,
  detectFileChangeType,
  getInitialRenderableFileCount,
  getNextRenderableFileCount,
  parseRenderableDiffFile,
  type FileChangeType,
  type RenderableDiffFile,
  type RepoDiffSourceFile,
} from "./repo-diff-sidebar.helpers";
import {
  closeRepoDiffSidebarState,
  toggleRepoDiffFileCollapsed,
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
  --diffs-bg: color-mix(in oklab, var(--background) 94%, var(--foreground)) !important;
  --diffs-light-bg: color-mix(in oklab, var(--background) 94%, var(--foreground)) !important;
  --diffs-dark-bg: color-mix(in oklab, var(--background) 94%, var(--foreground)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-addition-color-override: var(--syntax-token-inserted);
  --diffs-deletion-color-override: var(--syntax-token-deleted);
  --diffs-fg-number-addition-override: var(--syntax-token-inserted);
  --diffs-fg-number-deletion-override: var(--syntax-token-deleted);
  --diffs-bg-context-override: color-mix(in oklab, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in oklab, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in oklab, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in oklab, var(--background) 90%, var(--foreground));
  --diffs-bg-addition-override: color-mix(in oklab, var(--background) 88%, var(--syntax-token-inserted));
  --diffs-bg-addition-number-override: color-mix(in oklab, var(--background) 84%, var(--syntax-token-inserted));
  --diffs-bg-addition-hover-override: color-mix(in oklab, var(--background) 78%, var(--syntax-token-inserted));
  --diffs-bg-addition-emphasis-override: color-mix(in oklab, var(--background) 70%, var(--syntax-token-inserted));
  --diffs-bg-deletion-override: color-mix(in oklab, var(--background) 88%, var(--syntax-token-deleted));
  --diffs-bg-deletion-number-override: color-mix(in oklab, var(--background) 84%, var(--syntax-token-deleted));
  --diffs-bg-deletion-hover-override: color-mix(in oklab, var(--background) 78%, var(--syntax-token-deleted));
  --diffs-bg-deletion-emphasis-override: color-mix(in oklab, var(--background) 70%, var(--syntax-token-deleted));
  background-color: var(--diffs-bg) !important;
}

[data-line],
[data-column-number],
[data-no-newline] {
  font-size: 12px !important;
  line-height: 1.35 !important;
}

[data-line-type='context'][data-line][data-hovered],
[data-line-type='context'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 92%, var(--foreground)) !important;
}

[data-line-type='change-addition'][data-line],
[data-line-type='change-addition'][data-no-newline] {
  background-color: color-mix(in oklab, var(--background) 82%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line],
[data-line-type='change-deletion'][data-no-newline] {
  background-color: color-mix(in oklab, var(--background) 82%, var(--syntax-token-deleted)) !important;
}

[data-line-type='change-addition'][data-column-number] {
  background-color: color-mix(in oklab, var(--background) 76%, var(--syntax-token-inserted)) !important;
  color: var(--syntax-token-inserted) !important;
}

[data-line-type='change-deletion'][data-column-number] {
  background-color: color-mix(in oklab, var(--background) 76%, var(--syntax-token-deleted)) !important;
  color: var(--syntax-token-deleted) !important;
}

[data-line-type='change-addition'][data-line][data-hovered],
[data-line-type='change-addition'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 74%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line][data-hovered],
[data-line-type='change-deletion'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 74%, var(--syntax-token-deleted)) !important;
}

[data-file-info] {
  background-color: color-mix(in oklab, var(--background) 92%, var(--foreground)) !important;
  border-block-color: color-mix(in oklab, var(--border) 80%, transparent) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in oklab, var(--background) 92%, var(--foreground)) !important;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 75%, transparent) !important;
}

[data-title] {
  transition: color 120ms ease;
}

[data-title]:hover {
  color: color-mix(in oklab, var(--foreground) 86%, var(--accent)) !important;
}
`;

const MODE_LABELS: Record<RepoDiffSidebarMode, string> = {
  branch: "Branch",
  staged: "Staged",
  unstaged: "Unstaged",
};

const MODE_EMPTY_MESSAGES: Record<
  RepoDiffSidebarMode,
  { description: string; title: string }
> = {
  branch: {
    description: "No differences from the base branch.",
    title: "Branch is up to date",
  },
  staged: {
    description: "Stage files from unstaged changes to see them here.",
    title: "No staged changes",
  },
  unstaged: {
    description: "All files match the last commit.",
    title: "Working tree is clean",
  },
};

const CHANGE_TYPE_CONFIG: Record<
  FileChangeType,
  { className: string; label: string }
> = {
  added: { className: "bg-success/15 text-success", label: "A" },
  deleted: { className: "bg-danger/15 text-danger", label: "D" },
  modified: { className: "bg-warning/15 text-warning", label: "M" },
  renamed: { className: "bg-info/15 text-info", label: "R" },
};

const DIFF_BODY_REVEAL_DELAY_MS = 220;

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

function getFileIcon(path: string): string {
  const language = detectLanguageFromPath(path);
  return languageToVSCodeIcon[language] ?? "vscode-icons:default-file";
}

function splitFilePath(path: string): { dir: string; name: string } {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return { dir: "", name: path };
  return {
    dir: path.slice(0, lastSlash + 1),
    name: path.slice(lastSlash + 1),
  };
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
        className={["h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-xl", className]
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
      <Tooltip.Content className="rounded-xl" offset={10}>
        {ariaLabel}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function ChangeTypeBadge({ type }: { type: FileChangeType }) {
  const config = CHANGE_TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded text-[9px] font-bold leading-none ${config.className}`}
    >
      {config.label}
    </span>
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
    <div className="pointer-events-auto flex items-center gap-0.5">
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

function RawPatchFallback({ patch }: { patch: string }) {
  return (
    <div className="overflow-auto rounded-b-xl bg-background/70 p-3 font-mono text-[11px] leading-[18px]">
      {patch.split("\n").map((line, i) => {
        let bgClass = "";
        let textClass = "text-foreground/60";

        if (line.startsWith("+")) {
          bgClass = "sentinel-diff-add";
          textClass = "text-success/90";
        } else if (line.startsWith("-")) {
          bgClass = "sentinel-diff-del";
          textClass = "text-danger/90";
        } else if (line.startsWith("@@")) {
          textClass = "text-info/60";
        }

        return (
          <div
            key={i}
            className={`${bgClass} whitespace-pre-wrap wrap-break-word px-1`}
          >
            <span className={textClass}>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

function FileListPanel({
  diffFiles,
  onScrollToFile,
  searchFilter,
  onSearchChange,
}: {
  diffFiles: RepoDiffSourceFile[];
  onScrollToFile: (path: string) => void;
  onSearchChange: (value: string) => void;
  searchFilter: string;
}) {
  const filteredFiles = useMemo(() => {
    if (!searchFilter) return diffFiles;
    const lower = searchFilter.toLowerCase();
    return diffFiles.filter((f) => f.path.toLowerCase().includes(lower));
  }, [diffFiles, searchFilter]);

  return (
    <div className="border-b border-border/20">
      <div className="px-2 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5 rounded-xl border border-border/30 bg-foreground/3 px-2">
          <HugeiconsIcon
            color="currentColor"
            icon={Search01Icon}
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-muted"
          />
          <input
            className="h-7 w-full bg-transparent text-xs text-foreground placeholder:text-muted/60 outline-none"
            placeholder="Filter files..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="max-h-[200px] overflow-auto px-1 pb-1.5">
        {filteredFiles.map((file) => {
          const { dir, name } = splitFilePath(file.path);
          const changeType = detectFileChangeType(file);
          const fileIcon = getFileIcon(file.path);

          return (
            <button
              key={file.path}
              className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-foreground/5"
              onClick={() => onScrollToFile(file.path)}
              type="button"
            >
              <ChangeTypeBadge type={changeType} />
              <Icon className="h-3.5 w-3.5 shrink-0" icon={fileIcon} />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
                <span className="text-foreground/30">{dir}</span>
                <span className="text-foreground/70">{name}</span>
              </span>
              <span className="shrink-0 font-mono text-[9px]">
                {file.additions > 0 ? (
                  <span className="text-success">+{file.additions}</span>
                ) : null}
                {file.additions > 0 && file.deletions > 0 ? " " : null}
                {file.deletions > 0 ? (
                  <span className="text-danger">-{file.deletions}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {filteredFiles.length === 0 && searchFilter ? (
          <div className="px-2 py-3 text-center text-[11px] text-muted">
            No files match &ldquo;{searchFilter}&rdquo;
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonFileCard() {
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border/20 bg-background/30 first:mt-2">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-surface" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface" />
        </div>
        <div className="h-3 w-12 animate-pulse rounded bg-surface" />
      </div>
      <div className="space-y-1 px-3 pb-3 pt-1">
        <div className="h-2.5 w-full animate-pulse rounded bg-foreground/5" />
        <div className="h-2.5 w-5/6 animate-pulse rounded bg-foreground/5" />
        <div className="h-2.5 w-4/6 animate-pulse rounded bg-foreground/5" />
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-foreground/5" />
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: RepoDiffSidebarMode }) {
  const config = MODE_EMPTY_MESSAGES[mode];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
        <HugeiconsIcon
          color="currentColor"
          icon={Tick02Icon}
          size={20}
          strokeWidth={2}
          className="text-success"
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground/80">{config.title}</p>
        <p className="mt-1 text-xs text-muted">{config.description}</p>
      </div>
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
  const rightSidebar = useRightSidebar();
  const { close } = rightSidebar;
  const utils = api.useUtils();
  const resolvedTheme = useResolvedTheme();
  const sidebarState = useRepoDiffSidebarState();
  const [openTargets, setOpenTargets] = useState<DesktopOpenTarget[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [visibleFileCount, setVisibleFileCount] = useState(0);
  const [isBodyReady, setIsBodyReady] = useState(false);
  const [revertAllConfirm, setRevertAllConfirm] = useState(false);
  const [renderableFileCache] = useState(
    () => new Map<string, RenderableDiffFile>(),
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const threadId =
    sidebarState.kind === "thread" ? sidebarState.threadId : null;
  const workspaceId =
    sidebarState.kind === "thread" ? sidebarState.workspaceId : null;
  const prefs = sidebarState.kind === "thread" ? sidebarState.prefs : null;
  const currentMode = prefs?.mode ?? "unstaged";

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
  const gitStateInput = useMemo(
    () =>
      threadId && workspaceId
        ? {
            threadId,
            workspaceId,
          }
        : null,
    [threadId, workspaceId],
  );

  const threadGitStateQuery = api.repo.getThreadGitState.useQuery(
    gitStateInput ?? skipToken,
    {
      refetchOnMount: "always",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: 2_500,
    },
  );

  const diffPanelQuery = api.repo.getDiffPanelData.useQuery(
    queryInput ?? skipToken,
    {
      refetchOnMount: "always",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  );
  const [stableDiffPanelData, setStableDiffPanelData] = useState<
    typeof diffPanelQuery.data | undefined
  >(undefined);
  const isDiffFingerprintAccepted =
    !diffPanelQuery.data ||
    !threadGitStateQuery.data ||
    diffPanelQuery.data.statusFingerprint ===
      threadGitStateQuery.data.statusFingerprint;
  const shouldClearStableDiff =
    currentMode !== "branch" && threadGitStateQuery.data?.hasChanges === false;
  const diffPanelData = isDiffFingerprintAccepted
    ? diffPanelQuery.data
    : shouldClearStableDiff
      ? undefined
      : stableDiffPanelData;

  useEffect(() => {
    setStableDiffPanelData(undefined);
  }, [currentMode, threadId, workspaceId]);

  useEffect(() => {
    if (shouldClearStableDiff) {
      setStableDiffPanelData(undefined);
      return;
    }

    if (diffPanelQuery.data && isDiffFingerprintAccepted) {
      setStableDiffPanelData(diffPanelQuery.data);
    }
  }, [diffPanelQuery.data, isDiffFingerprintAccepted, shouldClearStableDiff]);

  useEffect(() => {
    if (
      queryInput &&
      diffPanelQuery.data &&
      threadGitStateQuery.data &&
      !isDiffFingerprintAccepted &&
      !diffPanelQuery.isFetching
    ) {
      void diffPanelQuery.refetch();
    }
  }, [
    diffPanelQuery,
    isDiffFingerprintAccepted,
    queryInput,
    threadGitStateQuery.data,
  ]);

  const repoRoot =
    diffPanelData?.repoContext.effectiveRootPath ??
    diffPanelData?.repoContext.repoRoot ??
    null;
  const preferredOpenTargetId =
    diffPanelData?.repoContext.preferredOpenTargetId ?? null;

  useEffect(() => {
    if (!gitStateInput || !diffPanelQuery.data?.repoContext) {
      return;
    }

    const currentGitState = utils.repo.getThreadGitState.getData(gitStateInput);
    if (
      currentGitState &&
      currentGitState.statusFingerprint !==
        diffPanelQuery.data.repoContext.statusFingerprint
    ) {
      return;
    }

    utils.repo.getThreadGitState.setData(
      gitStateInput,
      diffPanelQuery.data.repoContext,
    );
  }, [
    diffPanelQuery.data?.repoContext,
    gitStateInput,
    utils.repo.getThreadGitState,
  ]);

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

  useEffect(() => {
    if (!(rightSidebar.isOpen && rightSidebar.panelId === "repo-diff")) {
      setIsBodyReady(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsBodyReady(true);
    }, DIFF_BODY_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [rightSidebar.isOpen, rightSidebar.panelId, threadId, workspaceId]);

  const preferredEditorTarget = useMemo(
    () => getPreferredEditorTarget(openTargets, preferredOpenTargetId),
    [openTargets, preferredOpenTargetId],
  );

  const applyRepoMutationResult = useCallback(
    (result: {
      diff: unknown;
      repoContext: unknown;
      statusFingerprint?: string;
    }) => {
      if (!threadId || !workspaceId || !prefs) {
        return;
      }

      const input = { mode: prefs.mode, threadId, workspaceId };
      utils.repo.getThreadGitState.setData(
        { threadId, workspaceId },
        result.repoContext as never,
      );
      utils.repo.getDiffPanelData.setData(input, {
        diff: result.diff,
        repoContext: result.repoContext,
        statusFingerprint: result.statusFingerprint,
      } as never);
      void utils.repo.listThreadGitStates.invalidate();
      void Promise.all(
        (["unstaged", "staged", "branch"] as const)
          .filter((mode) => mode !== prefs.mode)
          .map((mode) =>
            utils.repo.getDiffPanelData.invalidate({
              mode,
              threadId,
              workspaceId,
            }),
          ),
      );
    },
    [prefs, threadId, utils, workspaceId],
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
      applyRepoMutationResult(result);
    },
  });
  const unstageMutation = api.repo.unstageFiles.useMutation({
    onError: (error) => handleMutationError(error, "Unable to unstage files."),
    onSuccess: (result) => {
      applyRepoMutationResult(result);
    },
  });
  const revertMutation = api.repo.revertFiles.useMutation({
    onError: (error) => handleMutationError(error, "Unable to revert files."),
    onSuccess: (result) => {
      applyRepoMutationResult(result);
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

  const handleScrollToFile = useCallback((path: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const element = container.querySelector<HTMLDivElement>(
      `[data-diff-file-path="${CSS.escape(path)}"]`,
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const diff = diffPanelData?.diff;
  const diffFiles = diff?.files ?? EMPTY_SOURCE_FILES;

  const filteredDiffFiles = useMemo(() => {
    const filter = prefs?.searchFilter ?? "";
    if (!filter) return diffFiles;
    const lower = filter.toLowerCase();
    return diffFiles.filter((f) => f.path.toLowerCase().includes(lower));
  }, [diffFiles, prefs?.searchFilter]);

  const renderableDiffSnapshotKey = useMemo(
    () =>
      [
        currentMode,
        diff?.branch ?? "",
        diff?.sourceLabel ?? "",
        ...diffFiles.map((file) =>
          buildRenderableDiffCacheKey(currentMode, file),
        ),
      ].join("|"),
    [currentMode, diff?.branch, diff?.sourceLabel, diffFiles],
  );

  useEffect(() => {
    setVisibleFileCount(
      getInitialRenderableFileCount(filteredDiffFiles.length),
    );
  }, [currentMode, filteredDiffFiles]);

  useEffect(() => {
    renderableFileCache.clear();
  }, [renderableFileCache, renderableDiffSnapshotKey]);

  const effectiveVisibleFileCount =
    visibleFileCount === 0 && filteredDiffFiles.length > 0
      ? getInitialRenderableFileCount(filteredDiffFiles.length)
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
      getNextRenderableFileCount(current, filteredDiffFiles.length),
    );
  }, [filteredDiffFiles.length]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (filteredDiffFiles.length === 0) return;
      const container = scrollContainerRef.current;
      if (!container) return;

      if (event.key === "j" || event.key === "k") {
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();
        const cards = Array.from(
          container.querySelectorAll<HTMLDivElement>("[data-diff-file-path]"),
        );
        if (cards.length === 0) return;

        const containerTop = container.getBoundingClientRect().top;

        let currentIndex = -1;
        for (let i = 0; i < cards.length; i++) {
          const cardTop = cards[i]!.getBoundingClientRect().top - containerTop;
          if (cardTop >= -10) {
            currentIndex = i;
            break;
          }
        }
        if (currentIndex === -1) currentIndex = cards.length - 1;

        const nextIndex =
          event.key === "j"
            ? Math.min(currentIndex + 1, cards.length - 1)
            : Math.max(currentIndex - 1, 0);

        const targetCard = cards[nextIndex];
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [filteredDiffFiles.length],
  );

  const prevModeRef = useRef(currentMode);
  if (prevModeRef.current !== currentMode) {
    prevModeRef.current = currentMode;
    if (revertAllConfirm) {
      setRevertAllConfirm(false);
    }
  }

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
  const totalAdditions = diff?.totalAdditions ?? 0;
  const totalDeletions = diff?.totalDeletions ?? 0;

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Git diff panel"
    >
      {/* ── Header ── */}
      <header className="flex shrink-0 flex-col border-b border-border/20">
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Mode selector */}
          <Dropdown>
            <Button
              className="h-7 shrink-0 rounded-xl px-2.5 text-xs"
              size="sm"
              variant="tertiary"
            >
              <span className="font-medium">{modeLabel}</span>
              {fileCount > 0 ? (
                <span className="ml-0.5 rounded-md bg-surface px-1.5 py-px text-[10px] font-medium tabular-nums text-foreground/60">
                  {fileCount}
                </span>
              ) : null}
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={1.8}
              />
            </Button>
            <Dropdown.Popover
              className="min-w-[200px]"
              placement="bottom start"
            >
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

          {/* Branch + stats summary */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {diff?.branch ? (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/50">
                <HugeiconsIcon
                  color="currentColor"
                  icon={GitBranchIcon}
                  size={10}
                  strokeWidth={1.6}
                />
                <span className="max-w-[120px] truncate">{diff.branch}</span>
              </span>
            ) : null}
            {totalAdditions > 0 || totalDeletions > 0 ? (
              <span className="shrink-0 font-mono text-[10px]">
                {totalAdditions > 0 ? (
                  <span className="text-success">+{totalAdditions}</span>
                ) : null}
                {totalAdditions > 0 && totalDeletions > 0 ? (
                  <span className="text-foreground/20"> </span>
                ) : null}
                {totalDeletions > 0 ? (
                  <span className="text-danger">-{totalDeletions}</span>
                ) : null}
              </span>
            ) : null}
          </div>

          {/* Close button */}
          <CloseButton
            aria-label="Close repo diff sidebar"
            className="shrink-0 h-7 w-7 min-h-7 min-w-7"
            onPress={handleClose}
          />
        </div>

        {/* ── Toolbar row ── */}
        <div className="flex items-center justify-between gap-2 border-t border-border/10 px-3 py-1.5">
          {/* Left: view options */}
          <div className="flex items-center gap-1">
            <Tooltip.Root delay={150}>
              <Button
                aria-label="Refresh diff"
                className="h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-xl"
                isDisabled={diffPanelQuery.isPending}
                isIconOnly
                onPress={() => void diffPanelQuery.refetch()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className={
                    diffPanelQuery.isFetching ? "opacity-45" : undefined
                  }
                  color="currentColor"
                  icon={ArrowReloadHorizontalIcon}
                  size={13}
                  strokeWidth={1.6}
                />
              </Button>
              <Tooltip.Content className="rounded-xl" offset={10}>
                Refresh diff
              </Tooltip.Content>
            </Tooltip.Root>

            <div className="mx-1 h-4 w-px bg-border/20" />

            {/* Layout toggle as button group */}
            <ButtonGroup size="sm" variant="ghost">
              <Button
                aria-label="Unified diff"
                className={`h-7 rounded-xl rounded-r-none px-2 text-[10px] ${
                  prefs.layout === "unified"
                    ? "bg-surface text-foreground font-medium"
                    : "text-foreground/40 bg-surface/50"
                }`}
                onPress={() => queuePrefsUpdate({ layout: "unified" })}
                size="sm"
              >
                Unified
              </Button>
              <Button
                aria-label="Split diff"
                className={`h-7 rounded-xl rounded-l-none px-2 text-[10px] ${
                  prefs.layout === "split"
                    ? "bg-surface text-foreground font-medium"
                    : "text-foreground/40 bg-surface/50"
                }`}
                onPress={() => queuePrefsUpdate({ layout: "split" })}
                size="sm"
              >
                Split
              </Button>
            </ButtonGroup>
          </div>

          {/* Right: toggle options */}
          <div className="flex items-center gap-0.5">
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
              size={13}
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
              size={13}
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
              size={13}
            />

            <div className="mx-1 h-4 w-px bg-border/20" />

            <IconActionButton
              ariaLabel={
                prefs.fileListOpen ? "Hide file list" : "Show file list"
              }
              icon={prefs.fileListOpen ? ArrowDown01Icon : ArrowRight01Icon}
              isActive={prefs.fileListOpen}
              onPress={() =>
                queuePrefsUpdate({ fileListOpen: !prefs.fileListOpen })
              }
              size={13}
            />
          </div>
        </div>
      </header>

      {/* ── File list panel ── */}
      {prefs.fileListOpen && diffFiles.length > 0 ? (
        <FileListPanel
          diffFiles={diffFiles}
          onScrollToFile={handleScrollToFile}
          searchFilter={prefs.searchFilter}
          onSearchChange={(value) => queuePrefsUpdate({ searchFilter: value })}
        />
      ) : null}

      {/* ── Diff body ── */}
      <div className="min-h-0 flex-1" role="list" aria-label="Changed files">
        {!isBodyReady || (diffPanelQuery.isPending && !diff) ? (
          <div className="px-2 pt-2 h-48 flex items-center justify-center">
            <Spinner size="sm" />
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
            <div className="rounded-xl border border-warning-soft-hover bg-warning/10 px-4 py-3 text-sm text-warning">
              {disabledReason}
            </div>
          </div>
        ) : filteredDiffFiles.length === 0 ? (
          prefs.searchFilter && diffFiles.length > 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
              No files match &ldquo;{prefs.searchFilter}&rdquo;
            </div>
          ) : (
            <EmptyState mode={currentMode} />
          )
        ) : (
          <div
            className="h-full min-h-0 overflow-auto px-2 pb-2"
            ref={scrollContainerRef}
          >
            {filteredDiffFiles.map((file, index) => {
              const canStage = currentMode === "unstaged";
              const canUnstage = currentMode === "staged";
              const canRevert = currentMode !== "branch";
              const shouldRenderDiff = index < effectiveVisibleFileCount;
              const parsedFile = shouldRenderDiff
                ? getCachedRenderableFile({
                    cache: renderableFileCache,
                    file,
                    mode: currentMode,
                  })
                : null;

              const changeType = detectFileChangeType(file);
              const fileIcon = getFileIcon(file.path);
              const { dir, name } = splitFilePath(file.path);
              const isCollapsed = prefs.collapsedFiles.has(file.path);

              return (
                <div
                  className="mb-2 overflow-hidden rounded-xl border border-border/30 bg-background/40 first:mt-2 last:mb-0"
                  data-diff-mounted={
                    shouldRenderDiff && parsedFile?.fileDiff ? "true" : "false"
                  }
                  data-diff-file-path={file.path}
                  key={`${currentMode}:${file.path}`}
                  role="listitem"
                  aria-label={`${file.path}: ${file.additions} additions, ${file.deletions} deletions`}
                >
                  {/* File card header */}
                  <div className="flex items-center gap-2 border-b border-border/15 px-3 py-2">
                    {/* Collapse toggle */}
                    <button
                      aria-label={isCollapsed ? "Expand diff" : "Collapse diff"}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/30 transition-colors hover:text-foreground/60"
                      onClick={() => toggleRepoDiffFileCollapsed(file.path)}
                      type="button"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>

                    {/* Change type badge */}
                    <ChangeTypeBadge type={changeType} />

                    {/* File icon */}
                    <Icon className="h-3.5 w-3.5 shrink-0" icon={fileIcon} />

                    {/* File path with highlighted name */}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-mono text-[11px]"
                        title={file.path}
                      >
                        <span className="text-foreground/35">{dir}</span>
                        <span className="font-medium text-foreground/80">
                          {name}
                        </span>
                      </p>
                    </div>

                    {/* Stats */}
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      {file.additions > 0 ? (
                        <span className="text-success">+{file.additions}</span>
                      ) : null}
                      {file.additions > 0 && file.deletions > 0 ? " " : null}
                      {file.deletions > 0 ? (
                        <span className="text-danger">-{file.deletions}</span>
                      ) : null}
                    </span>

                    {/* Actions */}
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

                  {/* Diff content */}
                  {!isCollapsed ? (
                    <>
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
                        <RawPatchFallback patch={file.patch} />
                      ) : (
                        <div className="rounded-b-xl bg-background/60 px-3 py-4 text-[11px] text-muted">
                          Scroll down to load this diff.
                        </div>
                      )}
                    </>
                  ) : null}

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

      {/* ── Footer ── */}
      {diff &&
      (currentMode === "unstaged" || currentMode === "staged") &&
      diff.files.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/20 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {fileCount} {fileCount === 1 ? "file" : "files"}
              </span>
              <span className="text-foreground/15">|</span>
              {totalAdditions > 0 ? (
                <span className="text-success">+{totalAdditions}</span>
              ) : null}
              {totalAdditions > 0 && totalDeletions > 0 ? " " : null}
              {totalDeletions > 0 ? (
                <span className="text-danger">-{totalDeletions}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              {currentMode === "unstaged" ? (
                revertAllConfirm ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-danger">Revert all?</span>
                    <Button
                      className="h-6 rounded-xl px-2 text-[10px] text-danger"
                      isDisabled={isMutating}
                      onPress={() => {
                        setRevertAllConfirm(false);
                        void revertMutation.mutateAsync({
                          mode: currentMode,
                          paths: diff.files.map((f) => f.path),
                          threadId,
                          workspaceId,
                        });
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Yes
                    </Button>
                    <Button
                      className="h-6 rounded-xl px-2 text-[10px]"
                      onPress={() => setRevertAllConfirm(false)}
                      size="sm"
                      variant="ghost"
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="h-7 rounded-xl px-2.5 text-[11px] text-danger"
                    isDisabled={isMutating}
                    onPress={() => setRevertAllConfirm(true)}
                    size="sm"
                    variant="ghost"
                  >
                    Revert all
                  </Button>
                )
              ) : null}
              <Button
                className="h-7 rounded-xl px-3 text-[11px]"
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
