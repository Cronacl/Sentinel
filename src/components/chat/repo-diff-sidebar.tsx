"use client";

import { FileDiff } from "@pierre/diffs/react";
import { skipToken } from "@tanstack/react-query";
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  Cancel01Icon,
  ArrowRight01Icon,
  CollapseIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitCommitHorizontalIcon,
  GitCompareIcon,
  GitPullRequestIcon,
  MoreHorizontalIcon,
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
  memo,
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
  dispatchDiffSidebarGitAction,
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
  --diffs-bg: color-mix(in oklab, var(--background) 96%, var(--foreground)) !important;
  --diffs-light-bg: color-mix(in oklab, var(--background) 96%, var(--foreground)) !important;
  --diffs-dark-bg: color-mix(in oklab, var(--background) 96%, var(--foreground)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-addition-color-override: var(--syntax-token-inserted);
  --diffs-deletion-color-override: var(--syntax-token-deleted);
  --diffs-fg-number-addition-override: var(--syntax-token-inserted);
  --diffs-fg-number-deletion-override: var(--syntax-token-deleted);
  --diffs-bg-context-override: color-mix(in oklab, var(--background) 98%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in oklab, var(--background) 95%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in oklab, var(--background) 96%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in oklab, var(--background) 92%, var(--foreground));
  --diffs-bg-addition-override: color-mix(in oklab, var(--background) 90%, var(--syntax-token-inserted));
  --diffs-bg-addition-number-override: color-mix(in oklab, var(--background) 86%, var(--syntax-token-inserted));
  --diffs-bg-addition-hover-override: color-mix(in oklab, var(--background) 82%, var(--syntax-token-inserted));
  --diffs-bg-addition-emphasis-override: color-mix(in oklab, var(--background) 74%, var(--syntax-token-inserted));
  --diffs-bg-deletion-override: color-mix(in oklab, var(--background) 90%, var(--syntax-token-deleted));
  --diffs-bg-deletion-number-override: color-mix(in oklab, var(--background) 86%, var(--syntax-token-deleted));
  --diffs-bg-deletion-hover-override: color-mix(in oklab, var(--background) 82%, var(--syntax-token-deleted));
  --diffs-bg-deletion-emphasis-override: color-mix(in oklab, var(--background) 74%, var(--syntax-token-deleted));
  background-color: var(--diffs-bg) !important;
}

[data-line],
[data-column-number],
[data-no-newline] {
  font-size: 11.5px !important;
  line-height: 1.4 !important;
}

[data-line-type='context'][data-line][data-hovered],
[data-line-type='context'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 93%, var(--foreground)) !important;
}

[data-line-type='change-addition'][data-line],
[data-line-type='change-addition'][data-no-newline] {
  background-color: color-mix(in oklab, var(--background) 84%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line],
[data-line-type='change-deletion'][data-no-newline] {
  background-color: color-mix(in oklab, var(--background) 84%, var(--syntax-token-deleted)) !important;
}

[data-line-type='change-addition'][data-column-number] {
  background-color: color-mix(in oklab, var(--background) 78%, var(--syntax-token-inserted)) !important;
  color: var(--syntax-token-inserted) !important;
}

[data-line-type='change-deletion'][data-column-number] {
  background-color: color-mix(in oklab, var(--background) 78%, var(--syntax-token-deleted)) !important;
  color: var(--syntax-token-deleted) !important;
}

[data-line-type='change-addition'][data-line][data-hovered],
[data-line-type='change-addition'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 76%, var(--syntax-token-inserted)) !important;
}

[data-line-type='change-deletion'][data-line][data-hovered],
[data-line-type='change-deletion'][data-column-number][data-hovered] {
  background-color: color-mix(in oklab, var(--background) 76%, var(--syntax-token-deleted)) !important;
}

[data-file-info] {
  background-color: color-mix(in oklab, var(--background) 94%, var(--foreground)) !important;
  border-block-color: color-mix(in oklab, var(--border) 60%, transparent) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in oklab, var(--background) 94%, var(--foreground)) !important;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent) !important;
}

[data-title] {
  transition: color 150ms ease;
}

[data-title]:hover {
  color: color-mix(in oklab, var(--foreground) 90%, var(--accent)) !important;
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
  added: {
    className: "bg-success/12 text-success ring-1 ring-success/20",
    label: "A",
  },
  deleted: {
    className: "bg-danger/12 text-danger ring-1 ring-danger/20",
    label: "D",
  },
  modified: {
    className: "bg-warning/12 text-warning ring-1 ring-warning/20",
    label: "M",
  },
  renamed: {
    className: "bg-info/12 text-info ring-1 ring-info/20",
    label: "R",
  },
};

const DIFF_BODY_REVEAL_DELAY_MS = 220;
const DIFF_BATCH_MOUNT_DELAY_MS = 16;

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
    <Tooltip.Root delay={200}>
      <Button
        aria-label={ariaLabel}
        className={[
          "h-6 w-6 min-h-6 min-w-6 shrink-0 rounded-lg transition-all duration-150",
          isActive && !variant
            ? "bg-foreground/8 text-foreground shadow-foreground/10"
            : "",
          className,
        ]
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
      <Tooltip.Content className="rounded-lg text-[11px]" offset={8}>
        {ariaLabel}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function ChangeTypeBadge({ type }: { type: FileChangeType }) {
  const config = CHANGE_TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex h-[17px] w-[17px] items-center justify-center rounded-[4px] text-[9px] font-semibold leading-none ${config.className}`}
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
    <div className="pointer-events-auto flex items-center gap-px opacity-0 transition-opacity duration-150 group-hover/file-card:opacity-100 focus-within:opacity-100">
      {canStage ? (
        <IconActionButton
          ariaLabel="Stage file"
          className="h-6 min-h-6 w-6 min-w-6 text-success hover:bg-success/10"
          icon={GitCommitHorizontalIcon}
          isDisabled={isBusy}
          onPress={onStage}
          size={12}
          strokeWidth={1.8}
        />
      ) : null}
      {canUnstage ? (
        <IconActionButton
          ariaLabel="Unstage file"
          className="h-6 min-h-6 w-6 min-w-6 text-warning hover:bg-warning/10"
          icon={Undo02Icon}
          isDisabled={isBusy}
          onPress={onUnstage}
          size={12}
          strokeWidth={1.8}
        />
      ) : null}
      {canRevert ? (
        <IconActionButton
          ariaLabel="Revert file"
          className="h-6 min-h-6 w-6 min-w-6 text-danger hover:bg-danger/10"
          icon={Cancel01Icon}
          isDisabled={isBusy}
          onPress={onRevert}
          size={12}
          strokeWidth={1.8}
        />
      ) : null}
      <IconActionButton
        ariaLabel="Open in editor"
        className="h-6 min-h-6 w-6 min-w-6 text-foreground/50 hover:text-foreground/80"
        icon={FolderOpenIcon}
        isDisabled={!canOpenInEditor || isBusy}
        onPress={onOpenInEditor}
        size={12}
        strokeWidth={1.8}
      />
    </div>
  );
}

function RawPatchFallback({ patch }: { patch: string }) {
  return (
    <div className="overflow-auto bg-foreground/[0.02] p-3 font-mono text-[11px] leading-[1.5]">
      {patch.split("\n").map((line, i) => {
        let bgClass = "";
        let textClass = "text-foreground/50";

        if (line.startsWith("+")) {
          bgClass = "bg-success/8";
          textClass = "text-success/80";
        } else if (line.startsWith("-")) {
          bgClass = "bg-danger/8";
          textClass = "text-danger/80";
        } else if (line.startsWith("@@")) {
          textClass = "text-info/50";
        }

        return (
          <div
            key={i}
            className={`${bgClass} whitespace-pre-wrap wrap-break-word rounded-sm px-1.5 py-px`}
          >
            <span className={textClass}>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

const MemoizedFileDiff = memo(FileDiff);

const DiffFileCard = memo(function DiffFileCard({
  canOpenInEditor,
  canRevert,
  canStage,
  canUnstage,
  changeType,
  file,
  fileIcon,
  isBusy,
  isCollapsed,
  lineDiffType,
  onOpenInEditor,
  onReveal,
  onRevert,
  onStage,
  onToggleCollapsed,
  onUnstage,
  parsedFile,
  resolvedTheme,
  shouldRenderDiff,
  showRevealTrigger,
  splitPath,
  viewOptions,
}: {
  canOpenInEditor: boolean;
  canRevert: boolean;
  canStage: boolean;
  canUnstage: boolean;
  changeType: FileChangeType;
  file: RepoDiffSourceFile;
  fileIcon: string;
  isBusy: boolean;
  isCollapsed: boolean;
  lineDiffType: "none" | "word-alt";
  onOpenInEditor: (filePath: string, lineNumber: number | null) => void;
  onReveal: () => void;
  onRevert: (filePath: string) => void;
  onStage: (filePath: string) => void;
  onToggleCollapsed: (filePath: string) => void;
  onUnstage: (filePath: string) => void;
  parsedFile: RenderableDiffFile | null;
  resolvedTheme: "dark" | "light";
  shouldRenderDiff: boolean;
  showRevealTrigger: boolean;
  splitPath: { dir: string; name: string };
  viewOptions: {
    expandAll: boolean;
    layout: "split" | "unified";
    wordWrap: boolean;
  };
}) {
  const diffOptions = useMemo(
    () => ({
      collapsedContextThreshold: 8,
      disableBackground: false,
      diffStyle:
        viewOptions.layout === "split"
          ? ("split" as const)
          : ("unified" as const),
      disableFileHeader: true,
      expandUnchanged: viewOptions.expandAll,
      lineDiffType,
      overflow: viewOptions.wordWrap ? ("wrap" as const) : ("scroll" as const),
      theme: resolveDiffThemeName(resolvedTheme),
      themeType: resolvedTheme,
      unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
    }),
    [
      lineDiffType,
      resolvedTheme,
      viewOptions.expandAll,
      viewOptions.layout,
      viewOptions.wordWrap,
    ],
  );

  return (
    <div
      className="group/file-card mb-1.5 overflow-hidden rounded-xl bg-surface dark:bg-background border border-border/50 dark:border-none first:mt-1.5 last:mb-0 transition-[border-color] duration-150 hover:border-border/30"
      data-diff-mounted={
        shouldRenderDiff && parsedFile?.fileDiff ? "true" : "false"
      }
      data-diff-file-path={file.path}
      role="listitem"
      aria-label={`${file.path}: ${file.additions} additions, ${file.deletions} deletions`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-[7px]">
        <button
          aria-label={isCollapsed ? "Expand diff" : "Collapse diff"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-foreground/25 transition-colors hover:text-foreground/60"
          onClick={() => onToggleCollapsed(file.path)}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={11}
            strokeWidth={2.2}
          />
        </button>

        <ChangeTypeBadge type={changeType} />
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" icon={fileIcon} />

        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-[10.5px] leading-tight"
            title={file.path}
          >
            <span className="text-foreground/25">{splitPath.dir}</span>
            <span className="font-medium text-foreground/75">
              {splitPath.name}
            </span>
          </p>
        </div>

        <span className="shrink-0 font-mono text-[9px] tabular-nums">
          {file.additions > 0 ? (
            <span className="text-success/70">+{file.additions}</span>
          ) : null}
          {file.additions > 0 && file.deletions > 0 ? " " : null}
          {file.deletions > 0 ? (
            <span className="text-danger/70">-{file.deletions}</span>
          ) : null}
        </span>

        <FileHeaderActions
          canOpenInEditor={canOpenInEditor}
          canRevert={canRevert}
          canStage={canStage}
          canUnstage={canUnstage}
          isBusy={isBusy}
          onOpenInEditor={() =>
            onOpenInEditor(file.path, file.firstChangedLine)
          }
          onRevert={() => onRevert(file.path)}
          onStage={() => onStage(file.path)}
          onUnstage={() => onUnstage(file.path)}
        />
      </div>

      {!isCollapsed ? (
        <div className="border-t border-border/10">
          {parsedFile?.fileDiff ? (
            <MemoizedFileDiff
              fileDiff={parsedFile.fileDiff}
              options={diffOptions}
            />
          ) : shouldRenderDiff ? (
            <RawPatchFallback patch={file.patch} />
          ) : (
            <div className="bg-foreground/[0.02] px-3 py-3 text-center text-[10px] text-foreground/30">
              Scroll to load diff
            </div>
          )}
        </div>
      ) : null}

      <DiffRevealTrigger isActive={showRevealTrigger} onReveal={onReveal} />
    </div>
  );
});

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
    <div className="border-b border-border/15 bg-foreground/[0.015]">
      <div className="px-2.5 pt-2 pb-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-border/25 bg-background/60 px-2.5 transition-colors focus-within:border-border/40 focus-within:bg-background/80">
          <HugeiconsIcon
            color="currentColor"
            icon={Search01Icon}
            size={11}
            strokeWidth={1.8}
            className="shrink-0 text-foreground/30"
          />
          <input
            className="h-7 w-full bg-transparent text-[11px] text-foreground placeholder:text-foreground/30 outline-none"
            placeholder="Filter files..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
          />
          {searchFilter ? (
            <button
              className="shrink-0 text-foreground/30 transition-colors hover:text-foreground/60"
              onClick={() => onSearchChange("")}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Cancel01Icon}
                size={10}
                strokeWidth={2}
              />
            </button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[180px] overflow-auto px-1.5 pb-1.5">
        {filteredFiles.map((file) => {
          const { dir, name } = splitFilePath(file.path);
          const changeType = detectFileChangeType(file);
          const fileIcon = getFileIcon(file.path);

          return (
            <button
              key={file.path}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-[5px] text-left transition-colors hover:bg-foreground/5 active:bg-foreground/8"
              onClick={() => onScrollToFile(file.path)}
              type="button"
            >
              <ChangeTypeBadge type={changeType} />
              <Icon
                className="h-3.5 w-3.5 shrink-0 opacity-70"
                icon={fileIcon}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
                <span className="text-foreground/25">{dir}</span>
                <span className="text-foreground/70">{name}</span>
              </span>
              <span className="shrink-0 font-mono text-[9px] tabular-nums">
                {file.additions > 0 ? (
                  <span className="text-success/80">+{file.additions}</span>
                ) : null}
                {file.additions > 0 && file.deletions > 0 ? (
                  <span className="text-foreground/10"> </span>
                ) : null}
                {file.deletions > 0 ? (
                  <span className="text-danger/80">-{file.deletions}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {filteredFiles.length === 0 && searchFilter ? (
          <div className="px-2 py-4 text-center text-[11px] text-foreground/40">
            No files match &ldquo;{searchFilter}&rdquo;
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonFileCard() {
  return (
    <div className="mb-1.5 overflow-hidden rounded-lg border border-border/15 bg-foreground/[0.02] first:mt-1.5">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-[17px] w-[17px] shrink-0 animate-pulse rounded-[4px] bg-foreground/6" />
          <div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-foreground/6" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-foreground/6" />
        </div>
        <div className="h-3 w-10 animate-pulse rounded bg-foreground/4" />
      </div>
      <div className="space-y-[3px] px-3 pb-3 pt-0.5">
        <div className="h-[14px] w-full animate-pulse rounded-sm bg-foreground/[0.03]" />
        <div className="h-[14px] w-5/6 animate-pulse rounded-sm bg-foreground/[0.03]" />
        <div className="h-[14px] w-4/6 animate-pulse rounded-sm bg-foreground/[0.03]" />
        <div className="h-[14px] w-3/4 animate-pulse rounded-sm bg-foreground/[0.03]" />
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: RepoDiffSidebarMode }) {
  const config = MODE_EMPTY_MESSAGES[mode];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/8 ring-1 ring-success/15">
        <HugeiconsIcon
          color="currentColor"
          icon={Tick02Icon}
          size={18}
          strokeWidth={2}
          className="text-success/80"
        />
      </div>
      <div>
        <p className="text-[13px] font-medium text-foreground/70">
          {config.title}
        </p>
        <p className="mt-1 text-[11px] text-foreground/40">
          {config.description}
        </p>
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
  const utils = api.useUtils();
  const resolvedTheme = useResolvedTheme();
  const sidebarState = useRepoDiffSidebarState();
  const [openTargets, setOpenTargets] = useState<DesktopOpenTarget[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [visibleFileCount, setVisibleFileCount] = useState(0);
  const [isBodyReady, setIsBodyReady] = useState(false);
  const [readyRenderableDiffSnapshotKey, setReadyRenderableDiffSnapshotKey] =
    useState<string | null>(null);
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
        diffPanelData?.statusFingerprint ?? "",
        diff?.branch ?? "",
        diff?.fileCount ?? 0,
        diff?.sourceLabel ?? "",
        diffFiles.map((file) => file.path).join("\n"),
      ].join("|"),
    [
      currentMode,
      diff?.branch,
      diff?.fileCount,
      diff?.sourceLabel,
      diffFiles,
      diffPanelData?.statusFingerprint,
    ],
  );

  const isRenderableDiffBatchReady =
    readyRenderableDiffSnapshotKey === renderableDiffSnapshotKey;
  const diffViewOptions = useMemo(
    () => ({
      expandAll: prefs?.expandAll ?? false,
      layout: prefs?.layout ?? "unified",
      wordWrap: prefs?.wordWrap ?? false,
    }),
    [prefs?.expandAll, prefs?.layout, prefs?.wordWrap],
  );
  const fileRenderMetadata = useMemo(() => {
    const metadata = new Map<
      string,
      {
        changeType: FileChangeType;
        fileIcon: string;
        splitPath: { dir: string; name: string };
      }
    >();

    for (const file of filteredDiffFiles) {
      metadata.set(file.path, {
        changeType: detectFileChangeType(file),
        fileIcon: getFileIcon(file.path),
        splitPath: splitFilePath(file.path),
      });
    }

    return metadata;
  }, [filteredDiffFiles]);

  useEffect(() => {
    setVisibleFileCount(
      getInitialRenderableFileCount(filteredDiffFiles.length),
    );
  }, [currentMode, filteredDiffFiles]);

  useEffect(() => {
    renderableFileCache.clear();
    setReadyRenderableDiffSnapshotKey(null);

    const timeoutId = window.setTimeout(() => {
      setReadyRenderableDiffSnapshotKey(renderableDiffSnapshotKey);
    }, DIFF_BATCH_MOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
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
  const handleToggleFileCollapsed = useCallback((filePath: string) => {
    startTransition(() => {
      toggleRepoDiffFileCollapsed(filePath);
    });
  }, []);
  const handleStageFile = useCallback(
    (filePath: string) => {
      if (!threadId || !workspaceId) return;

      void stageMutation.mutateAsync({
        mode: currentMode,
        paths: [filePath],
        threadId,
        workspaceId,
      });
    },
    [currentMode, stageMutation.mutateAsync, threadId, workspaceId],
  );
  const handleUnstageFile = useCallback(
    (filePath: string) => {
      if (!threadId || !workspaceId) return;

      void unstageMutation.mutateAsync({
        mode: currentMode,
        paths: [filePath],
        threadId,
        workspaceId,
      });
    },
    [currentMode, threadId, unstageMutation.mutateAsync, workspaceId],
  );
  const handleRevertFile = useCallback(
    (filePath: string) => {
      if (!threadId || !workspaceId) return;
      if (currentMode === "branch") return;

      void revertMutation.mutateAsync({
        mode: currentMode,
        paths: [filePath],
        threadId,
        workspaceId,
      });
    },
    [currentMode, revertMutation.mutateAsync, threadId, workspaceId],
  );

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
      <div className="flex h-full w-full items-center justify-center px-6 text-[12px] text-foreground/30">
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
      className="flex h-full w-full flex-col bg-surface"
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Git diff panel"
    >
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border/15 px-3 py-2">
        {/* Mode selector */}
        <Dropdown>
          <Button
            className="h-7 shrink-0 rounded-lg px-2.5 text-xs gap-1.5"
            size="sm"
            variant="tertiary"
          >
            <span className="font-medium text-foreground/80">{modeLabel}</span>
            {fileCount > 0 ? (
              <span className="rounded-[4px] bg-foreground/8 px-1.5 py-px text-[10px] font-medium tabular-nums text-foreground/50">
                {fileCount}
              </span>
            ) : null}
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowDown01Icon}
              size={11}
              strokeWidth={2}
              className="text-foreground/40"
            />
          </Button>
          <Dropdown.Popover className="min-w-[180px]" placement="bottom start">
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

        {/* Stats summary */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {totalAdditions > 0 || totalDeletions > 0 ? (
            <span className="shrink-0 font-mono text-[11px] tabular-nums">
              {totalAdditions > 0 ? (
                <span className="text-success/70">+{totalAdditions}</span>
              ) : null}
              {totalAdditions > 0 && totalDeletions > 0 ? (
                <span className="text-foreground/15"> </span>
              ) : null}
              {totalDeletions > 0 ? (
                <span className="text-danger/70">-{totalDeletions}</span>
              ) : null}
            </span>
          ) : null}
        </div>

        {/* Right actions: three-dots, layout toggle, git actions */}
        <div className="flex items-center gap-1">
          {/* Three-dots options menu */}
          <Dropdown>
            <Tooltip.Root delay={200}>
              <Button
                aria-label="Diff options"
                className="h-6 w-6 min-h-6 min-w-6 shrink-0 rounded-lg"
                isIconOnly
                size="sm"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={MoreHorizontalIcon}
                  size={16}
                  strokeWidth={1.6}
                />
              </Button>
              <Tooltip.Content className="rounded-lg text-[11px]" offset={8}>
                Options
              </Tooltip.Content>
            </Tooltip.Root>
            <Dropdown.Popover className="min-w-[200px]" placement="bottom end">
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === "refresh") void diffPanelQuery.refetch();
                  if (key === "word-wrap")
                    queuePrefsUpdate({ wordWrap: !prefs.wordWrap });
                  if (key === "word-diffs")
                    queuePrefsUpdate({ wordDiffs: !prefs.wordDiffs });
                  if (key === "expand-all") {
                    if (prefs.expandAll) {
                      queuePrefsUpdate({
                        expandAll: false,
                        collapsedFiles: new Set(
                          filteredDiffFiles.map((f) => f.path),
                        ),
                      });
                    } else {
                      queuePrefsUpdate({
                        expandAll: true,
                        collapsedFiles: new Set(),
                      });
                    }
                  }
                  if (key === "file-list")
                    queuePrefsUpdate({ fileListOpen: !prefs.fileListOpen });
                }}
              >
                <Dropdown.Item id="refresh" textValue="Refresh diff">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={ArrowReloadHorizontalIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Refresh diff</Label>
                </Dropdown.Item>
                <Dropdown.Item id="word-wrap" textValue="Word wrap">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={TextWrapIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>
                    {prefs.wordWrap ? "Disable word wrap" : "Enable word wrap"}
                  </Label>
                  {prefs.wordWrap ? (
                    <span className="ml-auto">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="text-success"
                      />
                    </span>
                  ) : null}
                </Dropdown.Item>
                <Dropdown.Item id="word-diffs" textValue="Word diffs">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitCompareIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>
                    {prefs.wordDiffs
                      ? "Disable word diffs"
                      : "Enable word diffs"}
                  </Label>
                  {prefs.wordDiffs ? (
                    <span className="ml-auto">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="text-success"
                      />
                    </span>
                  ) : null}
                </Dropdown.Item>
                <Dropdown.Item id="expand-all" textValue="Expand/Collapse all">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={prefs.expandAll ? CollapseIcon : UnfoldMoreIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>
                    {prefs.expandAll ? "Collapse all" : "Expand all"}
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="file-list" textValue="File list">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Search01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>
                    {prefs.fileListOpen ? "Hide file list" : "Show file list"}
                  </Label>
                  {prefs.fileListOpen ? (
                    <span className="ml-auto">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="text-success"
                      />
                    </span>
                  ) : null}
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {/* Layout toggle (unified/split) */}
          <Tooltip.Root delay={200}>
            <Button
              aria-label={
                prefs.layout === "unified"
                  ? "Switch to split view"
                  : "Switch to unified view"
              }
              className={`h-6 w-6 min-h-6 min-w-6 shrink-0 rounded-lg transition-all duration-150 ${
                prefs.layout === "split"
                  ? "bg-foreground/8 text-foreground shadow-foreground/10"
                  : ""
              }`}
              isIconOnly
              onPress={() =>
                queuePrefsUpdate({
                  layout: prefs.layout === "unified" ? "split" : "unified",
                })
              }
              size="sm"
              variant={prefs.layout === "split" ? "tertiary" : "ghost"}
            >
              {/* Split view icon using CSS */}
              <div className="flex h-3.5 w-3.5 items-center justify-center gap-px">
                <svg
                  className={`text-foreground ${prefs.layout === "split" ? "" : "rotate-90"}`}
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill="currentColor"
                    d="M9.5 2a.5.5 0 0 1 .5.5v15a.5.5 0 0 1-1 0v-15a.5.5 0 0 1 .5-.5M4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4V4zm11 1a1 1 0 0 1 1 1v.5a.5.5 0 0 0 1 0V6a2 2 0 0 0-2-2h-.5a.5.5 0 0 0 0 1zm0 10a1 1 0 0 0 1-1v-.5a.5.5 0 0 1 1 0v.5a2 2 0 0 1-2 2h-.5a.5.5 0 0 1 0-1zm1.5-7a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3a.5.5 0 0 0-.5-.5m-4-4a.5.5 0 0 1 0 1h-1a.5.5 0 0 1 0-1zm.5 11.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0 0 1h1a.5.5 0 0 0 .5-.5"
                  />
                </svg>
              </div>
            </Button>
            <Tooltip.Content className="rounded-lg text-[11px]" offset={8}>
              {prefs.layout === "unified" ? "Split view" : "Unified view"}
            </Tooltip.Content>
          </Tooltip.Root>

          {/* Git actions */}
          <Dropdown>
            <Tooltip.Root delay={200}>
              <Button
                aria-label="Git actions"
                className="h-6 w-6 min-h-6 min-w-6 shrink-0 rounded-lg"
                isIconOnly
                size="sm"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={GitCommitIcon}
                  size={16}
                  strokeWidth={1.5}
                />
              </Button>
              <Tooltip.Content className="rounded-lg text-[11px]" offset={8}>
                Git actions
              </Tooltip.Content>
            </Tooltip.Root>
            <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
              <Dropdown.Menu
                onAction={(key) => {
                  dispatchDiffSidebarGitAction(
                    key as "commit" | "push" | "pull-request" | "branch",
                  );
                }}
              >
                <Dropdown.Item id="commit" textValue="Commit">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitCommitIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Commit</Label>
                </Dropdown.Item>
                <Dropdown.Item id="push" textValue="Push">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={ArrowUp01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Push</Label>
                </Dropdown.Item>
                <Dropdown.Item id="pull-request" textValue="Pull request">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitPullRequestIcon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <Label>Pull request</Label>
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

          <CloseButton
            aria-label="Close diff sidebar"
            className="h-6 min-h-6 w-6 min-w-6 shrink-0 rounded-lg text-foreground/45 transition-colors hover:bg-foreground/6 hover:text-foreground/75"
            onPress={() => rightSidebar.close()}
          />
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
      <div
        className="min-h-0 flex-1 p-1"
        role="list"
        aria-label="Changed files"
      >
        {!isBodyReady || (diffPanelQuery.isPending && !diff) ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size="sm" className="opacity-50" />
          </div>
        ) : diffPanelQuery.error ? (
          <div className="px-4 py-6">
            <div className="rounded-lg border border-danger/20 bg-danger/5 px-3.5 py-2.5 text-[12px] text-danger/80">
              {formatRepoActionErrorMessage(
                getErrorMessage(
                  diffPanelQuery.error,
                  "Unable to load diff panel.",
                ),
              )}
            </div>
          </div>
        ) : disabledReason ? (
          <div className="px-3 py-4">
            <div className="rounded-lg border border-warning/20 bg-warning/5 px-3.5 py-2.5 text-[12px] text-warning/80">
              {disabledReason}
            </div>
          </div>
        ) : filteredDiffFiles.length === 0 ? (
          prefs.searchFilter && diffFiles.length > 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-[12px] text-foreground/40">
              No files match &ldquo;{prefs.searchFilter}&rdquo;
            </div>
          ) : (
            <EmptyState mode={currentMode} />
          )
        ) : (
          <div
            className="h-full min-h-0 overflow-auto px-1.5 pb-1.5"
            ref={scrollContainerRef}
          >
            {filteredDiffFiles.map((file, index) => {
              const canStage = currentMode === "unstaged";
              const canUnstage = currentMode === "staged";
              const canRevert = currentMode !== "branch";
              const isCollapsed = prefs.expandAll
                ? false
                : prefs.collapsedFiles.has(file.path);
              const shouldRenderDiff =
                isRenderableDiffBatchReady &&
                !isCollapsed &&
                index < effectiveVisibleFileCount;
              const parsedFile = shouldRenderDiff
                ? getCachedRenderableFile({
                    cache: renderableFileCache,
                    file,
                    mode: currentMode,
                  })
                : null;

              const metadata = fileRenderMetadata.get(file.path) ?? {
                changeType: detectFileChangeType(file),
                fileIcon: getFileIcon(file.path),
                splitPath: splitFilePath(file.path),
              };

              return (
                <DiffFileCard
                  canOpenInEditor={canOpenInEditor}
                  canRevert={canRevert}
                  canStage={canStage}
                  canUnstage={canUnstage}
                  changeType={metadata.changeType}
                  file={file}
                  fileIcon={metadata.fileIcon}
                  isBusy={isMutating}
                  isCollapsed={isCollapsed}
                  key={`${currentMode}:${file.path}`}
                  lineDiffType={lineDiffType}
                  onOpenInEditor={handleOpenInEditor}
                  onReveal={revealMoreFiles}
                  onRevert={handleRevertFile}
                  onStage={handleStageFile}
                  onToggleCollapsed={handleToggleFileCollapsed}
                  onUnstage={handleUnstageFile}
                  parsedFile={parsedFile}
                  resolvedTheme={resolvedTheme}
                  shouldRenderDiff={shouldRenderDiff}
                  showRevealTrigger={index === effectiveVisibleFileCount}
                  splitPath={metadata.splitPath}
                  viewOptions={diffViewOptions}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {diff &&
      (currentMode === "unstaged" || currentMode === "staged") &&
      diff.files.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/15 px-3 py-2">
          <span className="font-mono text-[10px] tabular-nums text-foreground/35">
            {fileCount} {fileCount === 1 ? "file" : "files"}
            {totalAdditions > 0 || totalDeletions > 0 ? (
              <>
                <span className="mx-1.5 text-foreground/15">|</span>
                {totalAdditions > 0 ? (
                  <span className="text-success/60">+{totalAdditions}</span>
                ) : null}
                {totalAdditions > 0 && totalDeletions > 0 ? " " : null}
                {totalDeletions > 0 ? (
                  <span className="text-danger/60">-{totalDeletions}</span>
                ) : null}
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-1">
            {currentMode === "unstaged" ? (
              revertAllConfirm ? (
                <div className="flex items-center gap-0.5">
                  <span className="mr-1 text-[10px] text-danger/70">
                    Revert all?
                  </span>
                  <Button
                    className="h-6 rounded-md px-2 text-[10px] font-medium text-danger"
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
                    className="h-6 rounded-md px-2 text-[10px]"
                    onPress={() => setRevertAllConfirm(false)}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  className="h-6 rounded-md px-2 text-[10px] text-danger/80 hover:text-danger"
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
              className="h-6 rounded-md px-2.5 text-[10px] font-medium"
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
      ) : null}
    </div>
  );
}
