"use client";

import {
  AlertDialog,
  Button,
  cn,
  Dropdown,
  Form,
  Input,
  Kbd,
  Label,
  Modal,
  ScrollShadow,
  Spinner,
  TextField,
  Tooltip,
  useOverlayState,
} from "@heroui/react";
import {
  AddCircleHalfDotIcon,
  AiIdeaIcon,
  Archive02Icon,
  ArrowDown01Icon,
  BrushIcon,
  CheckListIcon,
  Clock01Icon,
  ComputerIcon,
  DiagonalScrollPoint01Icon,
  FilterMailIcon,
  Folder03Icon,
  FolderAddIcon,
  FolderOpenIcon,
  GitPullRequestIcon,
  LayoutLeftIcon,
  MoreHorizontalIcon,
  Moon02Icon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Search01Icon,
  Settings01Icon,
  Sun03Icon,
  Tick02Icon,
  ExpandIcon,
  CollapseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNowStrict } from "date-fns";
import { FolderGit2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import { getErrorMessage } from "@/lib/errors";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  applyAppearanceSettings,
  resolveThemePreference,
  type ThemePreference,
} from "@/lib/appearance";
import type { RepoLastPullRequest } from "@/lib/ai/chat/engines/types";
import {
  useShortcutAction,
  useShortcutLabel,
  useShortcutScope,
} from "@/lib/shortcuts/provider";
import {
  applyThreadTitleCacheUpdate,
  applyOptimisticThreadPinUpdate,
  restoreOptimisticThreadPinUpdate,
} from "@/lib/threads/cache";
import {
  normalizeWorkspaceDirectoryPath,
  pickWorkspaceDirectory,
} from "@/lib/workspaces/picker";
import { api, type RouterOutputs } from "@/trpc/react";
import {
  collectRepoDiffPreloadCandidates,
  REPO_DIFF_PRELOAD_MODES,
} from "@/components/chat/thread-repo-actions.helpers";
import {
  BACKGROUND_REPO_WARMUP_INTERVAL_MS,
  queueRepoBackgroundWarmup,
  warmRepoDiffBundleCandidate,
} from "@/components/chat/repo-background-warmup";

import { SidebarCommandPalette } from "./sidebar-command-palette";
import { shouldInspectWorkspaceThreadSwitch } from "./workspace-sidebar.helpers";
import {
  ThreadStatusIndicator,
  type ThreadStatusValue,
} from "./thread-status-indicator";
import {
  formatThreadPullRequestLabel,
  getPullRequestMemoKey,
  threadPullRequestIconClass,
  threadPullRequestToneClass,
} from "./thread-pull-request";
import { useShell } from "./shell-context";
import { openSettingsRoute } from "./settings-navigation";
import { useAppShortcutActions } from "./use-app-shortcut-actions";

type OrganizeBy = "chronological" | "workspace";
type SortBy = "created" | "updated";

const PRIMARY_NAV = [
  { href: "/", icon: PencilEdit02Icon, label: "New thread" },
  { href: "/automations", icon: Clock01Icon, label: "Automations" },
  { href: "/scratchpad", icon: CheckListIcon, label: "Scratchpad" },
  { href: "/skills", icon: AiIdeaIcon, label: "Skills" },
] as const;

const SIDEBAR_SECTION_INSET = "px-2.5";
const SIDEBAR_ITEM_INSET = "px-2.5";
const SIDEBAR_ITEM_ROW =
  "rounded-xl px-2 py-1 transition-[color,background-color] duration-120 ease-[cubic-bezier(0.25,0.1,0.25,1)]";
const SIDEBAR_ICON_BTN = "h-6 w-6 min-w-6 rounded-lg";

const WORKSPACE_TOOLTIP_CLASSNAME = "max-w-[320px]";
const THEME_ACTION_ICONS = {
  dark: Moon02Icon,
  light: Sun03Icon,
  system: ComputerIcon,
} as const;

function toCurrentWorkspace(
  workspace:
    | {
        createdAt: Date;
        description: string | null;
        id: string;
        isExpanded?: boolean;
        kind?: "project" | "quick_chat";
        name: string;
        permissionModeOverride?: "default" | "full" | null;
        rootPath: string | null;
        sortOrder?: number;
        updatedAt: Date;
      }
    | null
    | undefined,
) {
  if (!workspace) {
    return null;
  }

  return {
    createdAt: workspace.createdAt,
    description: workspace.description,
    id: workspace.id,
    isArchived: false,
    isExpanded: workspace.isExpanded ?? false,
    kind: workspace.kind ?? "project",
    name: workspace.name,
    permissionModeOverride: workspace.permissionModeOverride ?? null,
    rootPath: workspace.rootPath,
    sortOrder: workspace.sortOrder ?? 0,
    updatedAt: workspace.updatedAt,
    userId: "",
  };
}

const SHORT_LABELS: Record<string, string> = {
  second: "s",
  seconds: "s",
  minute: "m",
  minutes: "m",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  month: "mo",
  months: "mo",
  year: "y",
  years: "y",
};

function formatRelativeTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Math.abs(Date.now() - date.getTime());
  if (diffMs < 30_000) {
    return "now";
  }

  const result = formatDistanceToNowStrict(date);
  return result.replace(
    /(\d+)\s+(\w+)/,
    (_, num, unit) => `${num}${SHORT_LABELS[unit] ?? unit}`,
  );
}

function dispatchAppearanceEvents() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("sentinel-appearance-change"));
  window.dispatchEvent(new Event("sentinel-theme-change"));
}

function getToggledThemePreference(themePreference: ThemePreference) {
  return resolveThemePreference(themePreference) === "dark" ? "light" : "dark";
}

type ThreadWarmStrategy = "hover" | "focus" | "press";

type ThreadGroup = NonNullable<
  Extract<RouterOutputs["threads"]["list"], { groups: unknown[] }>["groups"]
>;
type ChronologicalThreadItem = NonNullable<
  Extract<RouterOutputs["threads"]["list"], { items: unknown[] }>["items"]
>;
type QuickChatThreadItem = RouterOutputs["threads"]["listQuickChats"];
type PendingThreadSwitch = RouterOutputs["repo"]["inspectThreadSwitch"] & {
  workspaceId: string;
};

function findThreadState(
  threadId: string,
  groups: ThreadGroup,
  items: ChronologicalThreadItem,
  quickChats: QuickChatThreadItem = [],
) {
  for (const group of groups) {
    const thread = group.threads.find((item) => item.id === threadId);
    if (thread) {
      return {
        pinnedAt: thread.pinnedAt,
        workspaceKind: "project" as const,
        workspaceId: group.workspace.id,
      };
    }
  }

  const item = items.find((entry) => entry.id === threadId);
  if (item) {
    return {
      pinnedAt: item.pinnedAt,
      workspaceKind: "project" as const,
      workspaceId: item.workspace.id,
    };
  }

  const quickChat = quickChats.find((entry) => entry.id === threadId);
  return quickChat
    ? {
        pinnedAt: quickChat.pinnedAt,
        workspaceKind: "quick_chat" as const,
        workspaceId: quickChat.workspace.id,
      }
    : null;
}

function findThreadListItem(
  threadId: string,
  groups: ThreadGroup,
  items: ChronologicalThreadItem,
  quickChats: QuickChatThreadItem = [],
) {
  for (const group of groups) {
    const thread = group.threads.find((item) => item.id === threadId);
    if (thread) {
      return {
        title: thread.title,
        workspaceId: group.workspace.id,
      };
    }
  }

  const item = items.find((entry) => entry.id === threadId);
  if (item) {
    return {
      title: item.title,
      workspaceId: item.workspace.id,
    };
  }

  const quickChat = quickChats.find((entry) => entry.id === threadId);
  return quickChat
    ? {
        title: quickChat.title,
        workspaceId: quickChat.workspace.id,
      }
    : null;
}

function ThreadItemActions({
  threadId,
  isPinned,
  onPin,
  onArchive,
  alwaysVisible = false,
}: {
  alwaysVisible?: boolean;
  isPinned: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  threadId: string;
}) {
  return (
    <span
      className={`thread-actions flex items-center gap-0.5 transition-opacity duration-120 ease-out ${
        alwaysVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none absolute inset-y-0 right-0 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
      }`}
    >
      <button
        aria-label={isPinned ? "Unpin thread" : "Pin thread"}
        className="hover:bg-default/60 flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-120 ease-out"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onPin(threadId);
        }}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={isPinned ? PinOffIcon : PinIcon}
          size={14}
          strokeWidth={1.5}
        />
      </button>
      <button
        aria-label="Archive thread"
        className="hover:bg-default/60 flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-120 ease-out"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onArchive(threadId);
        }}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={Archive02Icon}
          size={14}
          strokeWidth={1.5}
        />
      </button>
    </span>
  );
}

function ThreadItemTrailing({
  threadId,
  isPinned,
  onPin,
  onArchive,
  updatedAt,
  alwaysVisible = false,
  threadStatus = "idle",
}: {
  alwaysVisible?: boolean;
  isPinned: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  threadId: string;
  threadStatus?: ThreadStatusValue;
  updatedAt?: Date;
}) {
  const isActive = threadStatus !== "idle";
  const indicator = isActive ? (
    <ThreadStatusIndicator size="compact" status={threadStatus} />
  ) : isPinned ? (
    <HugeiconsIcon
      className="shrink-0 text-foreground/40"
      color="currentColor"
      icon={PinIcon}
      size={11}
      strokeWidth={1.5}
    />
  ) : null;
  const showStatusIndicator = !alwaysVisible && isActive;
  const showPinnedIndicator = !alwaysVisible && !isActive && isPinned;
  const hasTimestamp =
    !alwaysVisible && !isActive && !isPinned && updatedAt != null;

  if (alwaysVisible) {
    return (
      <span className="flex h-6 shrink-0 items-center gap-1.5 pl-1 text-foreground/60">
        {indicator ? (
          <span className="flex items-center">{indicator}</span>
        ) : null}
        <ThreadItemActions
          alwaysVisible={alwaysVisible}
          isPinned={isPinned}
          onArchive={onArchive}
          onPin={onPin}
          threadId={threadId}
        />
      </span>
    );
  }

  return (
    <span
      className={`relative flex h-6 shrink-0 items-center justify-end ${
        hasTimestamp ? "w-10" : "w-8"
      }`}
    >
      {hasTimestamp ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-xs text-foreground/40 transition-opacity duration-120 ease-out group-hover:opacity-0">
          {formatRelativeTime(updatedAt)}
        </span>
      ) : null}
      {showStatusIndicator || showPinnedIndicator ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-foreground/60 transition-opacity duration-120 ease-out group-hover:opacity-0">
          {indicator}
        </span>
      ) : null}
      <ThreadItemActions
        alwaysVisible={alwaysVisible}
        isPinned={isPinned}
        onArchive={onArchive}
        onPin={onPin}
        threadId={threadId}
      />
    </span>
  );
}

function WorkspaceItemActions({
  hasLinkedFolder,
  onArchive,
  onCreateThread,
  onRelocate,
  onRename,
  workspaceName,
}: {
  hasLinkedFolder: boolean;
  onArchive: () => void;
  onCreateThread: () => void;
  onRelocate: () => void;
  onRename: () => void;
  workspaceName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const relocateLabel = hasLinkedFolder
    ? "Relocate workspace path"
    : "Link workspace path";

  return (
    <span
      className={`absolute inset-y-0 right-1 flex items-center transition-opacity duration-120 ease-out ${
        menuOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
      }`}
    >
      <Button
        aria-label={`New thread in ${workspaceName}`}
        className="h-6 w-6 min-w-6 rounded-md"
        isIconOnly
        size="sm"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onCreateThread();
        }}
      >
        <HugeiconsIcon
          color="currentColor"
          icon={PencilEdit02Icon}
          size={13}
          strokeWidth={1.5}
        />
      </Button>
      <Dropdown>
        <Button
          aria-label={`Workspace actions for ${workspaceName}`}
          className="h-6 w-6 min-w-6 rounded-md"
          isIconOnly
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <HugeiconsIcon
            color="currentColor"
            icon={MoreHorizontalIcon}
            size={13}
            strokeWidth={1.5}
          />
        </Button>
        <Dropdown.Popover
          className="min-w-[180px]"
          onOpenChange={setMenuOpen}
          placement="bottom end"
        >
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "rename") onRename();
              if (key === "relocate") onRelocate();
              if (key === "archive") onArchive();
            }}
          >
            <Dropdown.Item id="rename" textValue="Rename workspace">
              <HugeiconsIcon
                color="currentColor"
                icon={PencilEdit02Icon}
                size={16}
                strokeWidth={1.5}
              />
              <Label>Rename workspace</Label>
            </Dropdown.Item>
            <Dropdown.Item id="relocate" textValue={relocateLabel}>
              <HugeiconsIcon
                color="currentColor"
                icon={FolderOpenIcon}
                size={16}
                strokeWidth={1.5}
              />
              <Label>{relocateLabel}</Label>
            </Dropdown.Item>
            <Dropdown.Item id="archive" textValue="Delete workspace">
              <HugeiconsIcon
                color="currentColor"
                icon={Archive02Icon}
                size={16}
                strokeWidth={1.5}
              />
              <Label>Delete workspace</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </span>
  );
}

type WarmThreadHandler = (
  workspaceId: string,
  threadId: string,
  strategy?: ThreadWarmStrategy,
) => void;

const QuickChatsList = memo(function QuickChatsList({
  threads,
  selectedThreadId,
  onPressThread,
  onRenameThread,
  onWarmThread,
  onPin,
  onArchive,
}: {
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (threadId: string) => void;
  onRenameThread: (threadId: string) => void;
  onWarmThread: (threadId: string, strategy?: ThreadWarmStrategy) => void;
  selectedThreadId: string | null;
  threads: QuickChatThreadItem;
}) {
  if (threads.length === 0) return null;

  return (
    <div className={`${SIDEBAR_SECTION_INSET} pt-2`}>
      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => {
          const isActive = selectedThreadId === thread.id;
          return (
            <div
              className={`group flex min-w-0 cursor-pointer items-center justify-between gap-2 text-sm ${SIDEBAR_ITEM_ROW} ${
                isActive
                  ? "bg-default/70 text-foreground"
                  : "text-foreground/80 hover:bg-default/40 hover:text-foreground focus-visible:bg-default/40 focus-visible:text-foreground"
              }`}
              key={thread.id}
              onFocus={() => onWarmThread(thread.id, "focus")}
              onMouseEnter={() => onWarmThread(thread.id, "hover")}
              onClick={() => onPressThread(thread.id)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRenameThread(thread.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPressThread(thread.id);
                }
              }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <span
                  className="min-w-0 max-w-[9rem] truncate"
                  title={thread.title}
                >
                  {thread.title}
                </span>
              </span>
              <ThreadItemTrailing
                isPinned={thread.pinnedAt != null}
                onArchive={onArchive}
                onPin={onPin}
                threadId={thread.id}
                threadStatus={thread.status}
                updatedAt={thread.updatedAt}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

const THREADS_PER_PAGE = 6;
const THREAD_WARM_HOVER_DELAY_MS = 120;
const MAX_WARMED_THREAD_ENTRIES = 48;
const SIDEBAR_COLLAPSE_TRANSITION = {
  duration: 0.15,
  ease: [0.25, 0.1, 0.25, 1],
} as const;

const SidebarCollapsible = memo(function SidebarCollapsible({
  children,
  isOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={SIDEBAR_COLLAPSE_TRANSITION}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});

type ThreadRowProps = {
  isPinned: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onRenameThread: (threadId: string) => void;
  onWarmThread: WarmThreadHandler;
  selectedThreadId: string | null;
  thread: {
    id: string;
    linkedPullRequest?: RepoLastPullRequest | null;
    pinnedAt: Date | null;
    status: ThreadStatusValue;
    title: string;
    updatedAt: Date;
  };
  workspaceId: string;
};

const ThreadRow = memo(function ThreadRow({
  isPinned,
  onArchive,
  onPin,
  onPressThread,
  onRenameThread,
  onWarmThread,
  selectedThreadId,
  thread,
  workspaceId,
}: ThreadRowProps) {
  const isActive = selectedThreadId === thread.id;
  const pullRequestLabel = formatThreadPullRequestLabel(
    thread.linkedPullRequest ?? null,
  );
  const handleWarmOnFocus = useCallback(() => {
    onWarmThread(workspaceId, thread.id, "focus");
  }, [onWarmThread, thread.id, workspaceId]);
  const handleWarmOnHover = useCallback(() => {
    onWarmThread(workspaceId, thread.id, "hover");
  }, [onWarmThread, thread.id, workspaceId]);
  const handlePress = useCallback(() => {
    onPressThread(workspaceId, thread.id);
  }, [onPressThread, thread.id, workspaceId]);
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onRenameThread(thread.id);
    },
    [onRenameThread, thread.id],
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPressThread(workspaceId, thread.id);
      }
    },
    [onPressThread, thread.id, workspaceId],
  );

  return (
    <div
      className={`group flex min-w-0 cursor-pointer items-center justify-between gap-2 text-xs ${SIDEBAR_ITEM_ROW} ${
        isActive
          ? "bg-default/70 text-foreground"
          : "text-foreground/80 hover:bg-default/40 hover:text-foreground focus-visible:bg-default/40 focus-visible:text-foreground"
      }`}
      onFocus={handleWarmOnFocus}
      onMouseEnter={handleWarmOnHover}
      onClick={handlePress}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span className="flex min-w-0 flex-1 items-start gap-1.5 overflow-hidden">
        <span className="min-w-0">
          <span className="block min-w-0 truncate text-sm" title={thread.title}>
            {thread.title}
          </span>
          {pullRequestLabel ? (
            <span
              className={`mt-0.5 flex items-center gap-1 text-[11px] ${threadPullRequestToneClass(thread.linkedPullRequest)}`}
            >
              <span className={`flex shrink-0 items-center `}>
                <HugeiconsIcon
                  className={cn(
                    "shrink-0",
                    threadPullRequestIconClass(thread.linkedPullRequest),
                  )}
                  icon={GitPullRequestIcon}
                  size={10}
                  strokeWidth={1.5}
                />
              </span>
              <span className="truncate">{pullRequestLabel}</span>
            </span>
          ) : null}
        </span>
      </span>
      <ThreadItemTrailing
        isPinned={isPinned}
        onArchive={onArchive}
        onPin={onPin}
        threadId={thread.id}
        threadStatus={thread.status}
        updatedAt={thread.updatedAt}
      />
    </div>
  );
}, areThreadRowsEqual);

function areThreadRowsEqual(
  previous: Readonly<ThreadRowProps>,
  next: Readonly<ThreadRowProps>,
) {
  return (
    previous.isPinned === next.isPinned &&
    previous.selectedThreadId === next.selectedThreadId &&
    previous.workspaceId === next.workspaceId &&
    previous.thread.id === next.thread.id &&
    previous.thread.title === next.thread.title &&
    previous.thread.status === next.thread.status &&
    previous.thread.updatedAt.getTime() === next.thread.updatedAt.getTime() &&
    (previous.thread.pinnedAt?.getTime() ?? 0) ===
      (next.thread.pinnedAt?.getTime() ?? 0) &&
    getPullRequestMemoKey(previous.thread.linkedPullRequest) ===
      getPullRequestMemoKey(next.thread.linkedPullRequest) &&
    previous.onArchive === next.onArchive &&
    previous.onPin === next.onPin &&
    previous.onPressThread === next.onPressThread &&
    previous.onRenameThread === next.onRenameThread &&
    previous.onWarmThread === next.onWarmThread
  );
}

const WorkspaceHeader = memo(function WorkspaceHeader({
  group,
  isExpanded,
  onArchiveWorkspace,
  onCreateThread,
  onRelocateWorkspace,
  onRenameWorkspace,
  onToggleWorkspace,
}: {
  group: ThreadGroup[number];
  isExpanded: boolean;
  onArchiveWorkspace: (workspaceId: string) => void;
  onCreateThread: (workspaceId: string) => void;
  onRelocateWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onToggleWorkspace: (workspaceId: string) => void;
}) {
  const hasLinkedFolder = Boolean(group.workspace.rootPath);

  const handleClick = useCallback(() => {
    onToggleWorkspace(group.workspace.id);
  }, [group.workspace.id, onToggleWorkspace]);

  const workspaceRow = (
    <button
      className="text-foreground/60 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none group/ws flex h-7 w-full cursor-pointer items-center justify-start gap-0 rounded-xl pr-18 pl-2 text-left text-sm font-normal transition-colors duration-120 ease-out"
      onClick={handleClick}
      type="button"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {hasLinkedFolder ? (
          <FolderGit2
            className="shrink-0 transition-opacity duration-120 ease-out group-hover/ws:opacity-0"
            size={16}
            strokeWidth={1.5}
          />
        ) : (
          <HugeiconsIcon
            className="transition-opacity duration-120 ease-out group-hover/ws:opacity-0"
            color="currentColor"
            icon={Folder03Icon}
            size={18}
            strokeWidth={1.5}
          />
        )}
        <HugeiconsIcon
          className={`absolute transition-all duration-120 ease-out ${
            isExpanded ? "rotate-0" : "-rotate-90"
          } opacity-0 group-hover/ws:opacity-100`}
          color="currentColor"
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={1.8}
        />
      </span>
      <span className="ml-1 min-w-0 truncate">{group.workspace.name}</span>
    </button>
  );

  return (
    <div className="group relative">
      {hasLinkedFolder ? (
        <Tooltip.Root delay={1200}>
          <Tooltip.Trigger>{workspaceRow}</Tooltip.Trigger>
          <Tooltip.Content
            className={WORKSPACE_TOOLTIP_CLASSNAME}
            offset={12}
            placement="right"
          >
            <p className="text-xs font-medium text-muted">Linked folder</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">
              {group.workspace.rootPath}
            </p>
          </Tooltip.Content>
        </Tooltip.Root>
      ) : (
        workspaceRow
      )}
      <WorkspaceItemActions
        hasLinkedFolder={hasLinkedFolder}
        onArchive={() => onArchiveWorkspace(group.workspace.id)}
        onCreateThread={() => onCreateThread(group.workspace.id)}
        onRelocate={() => onRelocateWorkspace(group.workspace.id)}
        onRename={() => onRenameWorkspace(group.workspace.id)}
        workspaceName={group.workspace.name}
      />
    </div>
  );
});

const WorkspaceThreadsDisclosure = memo(function WorkspaceThreadsDisclosure({
  group,
  isExpanded,
  onArchive,
  onPin,
  onPressThread,
  onRenameThread,
  onWarmThread,
  selectedThreadId,
}: {
  group: ThreadGroup[number];
  isExpanded: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onRenameThread: (threadId: string) => void;
  onWarmThread: WarmThreadHandler;
  selectedThreadId: string | null;
}) {
  const [showOverflowThreads, setShowOverflowThreads] = useState(false);
  const allThreads = useMemo(
    () => group.threads.filter((thread) => thread.pinnedAt == null),
    [group.threads],
  );
  const visibleThreads = allThreads.slice(0, THREADS_PER_PAGE);
  const overflowThreads = allThreads.slice(THREADS_PER_PAGE);

  useEffect(() => {
    if (!isExpanded) {
      setShowOverflowThreads(false);
    }
  }, [isExpanded]);

  return (
    <SidebarCollapsible isOpen={isExpanded}>
      <div className="mt-1 flex flex-col gap-0.5 pl-1">
        {visibleThreads.length > 0 ? (
          <>
            {visibleThreads.map((thread) => (
              <ThreadRow
                isPinned={thread.pinnedAt != null}
                key={thread.id}
                onArchive={onArchive}
                onPin={onPin}
                onPressThread={onPressThread}
                onRenameThread={onRenameThread}
                onWarmThread={onWarmThread}
                selectedThreadId={selectedThreadId}
                thread={thread}
                workspaceId={group.workspace.id}
              />
            ))}

            {overflowThreads.length > 0 ? (
              <>
                <button
                  className={`flex w-full items-center gap-1 text-left text-sm text-foreground/30 hover:text-foreground/60 ${SIDEBAR_ITEM_INSET} py-1.5 transition-colors duration-120 ease-out`}
                  onClick={() => setShowOverflowThreads((current) => !current)}
                  type="button"
                >
                  <HugeiconsIcon
                    className={`transition-transform duration-120 ease-out ${
                      showOverflowThreads ? "rotate-0" : "-rotate-90"
                    }`}
                    color="currentColor"
                    icon={ArrowDown01Icon}
                    size={12}
                    strokeWidth={1.8}
                  />
                  <span>
                    {showOverflowThreads
                      ? "Hide extra threads"
                      : `Show ${overflowThreads.length} more`}
                  </span>
                </button>
                <SidebarCollapsible isOpen={showOverflowThreads}>
                  <div className="flex flex-col gap-0.5">
                    {overflowThreads.map((thread) => (
                      <ThreadRow
                        isPinned={thread.pinnedAt != null}
                        key={thread.id}
                        onArchive={onArchive}
                        onPin={onPin}
                        onPressThread={onPressThread}
                        onRenameThread={onRenameThread}
                        onWarmThread={onWarmThread}
                        selectedThreadId={selectedThreadId}
                        thread={thread}
                        workspaceId={group.workspace.id}
                      />
                    ))}
                  </div>
                </SidebarCollapsible>
              </>
            ) : null}
          </>
        ) : (
          <div className="text-foreground/40 px-3 py-2 text-xs">
            No threads yet.
          </div>
        )}
      </div>
    </SidebarCollapsible>
  );
});

const SortableWorkspaceSection = memo(function SortableWorkspaceSection({
  group,
  isExpanded,
  onArchive,
  onArchiveWorkspace,
  onCreateThread,
  onPin,
  onPressThread,
  onRelocateWorkspace,
  onRenameThread,
  onRenameWorkspace,
  onToggleWorkspace,
  onWarmThread,
  selectedThreadId,
}: {
  group: ThreadGroup[number];
  isExpanded: boolean;
  onArchive: (threadId: string) => void;
  onArchiveWorkspace: (workspaceId: string) => void;
  onCreateThread: (workspaceId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onRelocateWorkspace: (workspaceId: string) => void;
  onRenameThread: (threadId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onToggleWorkspace: (workspaceId: string) => void;
  onWarmThread: WarmThreadHandler;
  selectedThreadId: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.workspace.id });

  const sectionStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? "opacity 150ms ease" : transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <section ref={setNodeRef} style={sectionStyle}>
      <div {...attributes} {...listeners}>
        <WorkspaceHeader
          group={group}
          isExpanded={isExpanded}
          onArchiveWorkspace={onArchiveWorkspace}
          onCreateThread={onCreateThread}
          onRelocateWorkspace={onRelocateWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onToggleWorkspace={onToggleWorkspace}
        />
      </div>
      <WorkspaceThreadsDisclosure
        group={group}
        isExpanded={isExpanded}
        onArchive={onArchive}
        onPin={onPin}
        onPressThread={onPressThread}
        onRenameThread={onRenameThread}
        onWarmThread={onWarmThread}
        selectedThreadId={selectedThreadId}
      />
    </section>
  );
});

const ThreadList = memo(function ThreadList({
  groups,
  onArchiveWorkspace,
  onCreateThread,
  onPressThread,
  onRelocateWorkspace,
  onRenameThread,
  onRenameWorkspace,
  expandedWorkspaceIds,
  onPin,
  onArchive,
  onReorderWorkspaces,
  onToggleWorkspace,
  onWarmThread,
  selectedThreadId,
}: {
  expandedWorkspaceIds: Set<string>;
  groups: ThreadGroup;
  onArchive: (threadId: string) => void;
  onArchiveWorkspace: (workspaceId: string) => void;
  onCreateThread: (workspaceId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onRelocateWorkspace: (workspaceId: string) => void;
  onRenameThread: (threadId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onReorderWorkspaces: (orderedIds: string[]) => void;
  selectedThreadId: string | null;
  onToggleWorkspace: (workspaceId: string) => void;
  onWarmThread: WarmThreadHandler;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [orderedGroups, setOrderedGroups] = useState(groups);
  useEffect(() => {
    setOrderedGroups(groups);
  }, [groups]);

  const workspaceIds = useMemo(
    () => orderedGroups.map((g) => g.workspace.id),
    [orderedGroups],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setOrderedGroups((prev) => {
        const oldIndex = prev.findIndex(
          (g) => g.workspace.id === String(active.id),
        );
        const newIndex = prev.findIndex(
          (g) => g.workspace.id === String(over.id),
        );
        if (oldIndex < 0 || newIndex < 0) return prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        onReorderWorkspaces(next.map((g) => g.workspace.id));
        return next;
      });
    },
    [onReorderWorkspaces],
  );

  return (
    <div className="px-2.5 py-1 pb-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={workspaceIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1">
            {orderedGroups.map((group) => (
              <SortableWorkspaceSection
                group={group}
                isExpanded={expandedWorkspaceIds.has(group.workspace.id)}
                key={group.workspace.id}
                onArchive={onArchive}
                onArchiveWorkspace={onArchiveWorkspace}
                onCreateThread={onCreateThread}
                onPin={onPin}
                onPressThread={onPressThread}
                onRelocateWorkspace={onRelocateWorkspace}
                onRenameThread={onRenameThread}
                onRenameWorkspace={onRenameWorkspace}
                onToggleWorkspace={onToggleWorkspace}
                onWarmThread={onWarmThread}
                selectedThreadId={selectedThreadId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
});

const ChronologicalThreadList = memo(function ChronologicalThreadList({
  items,
  onPressThread,
  onRenameThread,
  onWarmThread,
  selectedThreadId,
  onPin,
  onArchive,
}: {
  items: ChronologicalThreadItem;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onRenameThread: (threadId: string) => void;
  onWarmThread: WarmThreadHandler;
  selectedThreadId: string | null;
}) {
  const [showOverflowThreads, setShowOverflowThreads] = useState(false);
  const visibleItems = items.slice(0, THREADS_PER_PAGE);
  const overflowItems = items.slice(THREADS_PER_PAGE);

  return (
    <div className="px-2.5 py-1">
      <div className="flex flex-col gap-1">
        {visibleItems.map((item) => (
          <ThreadRow
            isPinned={item.pinnedAt != null}
            key={item.id}
            onArchive={onArchive}
            onPin={onPin}
            onPressThread={onPressThread}
            onRenameThread={onRenameThread}
            onWarmThread={onWarmThread}
            selectedThreadId={selectedThreadId}
            thread={item}
            workspaceId={item.workspace.id}
          />
        ))}
        {overflowItems.length > 0 ? (
          <>
            <button
              className={`flex w-full items-center gap-1 text-left text-sm text-foreground/30 hover:text-foreground/60 ${SIDEBAR_ITEM_INSET} py-1.5 transition-colors duration-120 ease-out`}
              onClick={() => setShowOverflowThreads((current) => !current)}
              type="button"
            >
              <HugeiconsIcon
                className={`transition-transform duration-120 ease-out ${
                  showOverflowThreads ? "rotate-0" : "-rotate-90"
                }`}
                color="currentColor"
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={1.8}
              />
              <span>
                {showOverflowThreads
                  ? "Hide extra threads"
                  : `Show ${overflowItems.length} more`}
              </span>
            </button>
            <SidebarCollapsible isOpen={showOverflowThreads}>
              <div className="flex flex-col gap-1">
                {overflowItems.map((item) => (
                  <ThreadRow
                    isPinned={item.pinnedAt != null}
                    key={item.id}
                    onArchive={onArchive}
                    onPin={onPin}
                    onPressThread={onPressThread}
                    onRenameThread={onRenameThread}
                    onWarmThread={onWarmThread}
                    selectedThreadId={selectedThreadId}
                    thread={item}
                    workspaceId={item.workspace.id}
                  />
                ))}
              </div>
            </SidebarCollapsible>
          </>
        ) : null}
      </div>
    </div>
  );
});

function PreferenceMenuItem({
  icon,
  isSelected,
  label,
  onPress,
}: {
  icon: typeof Folder03Icon;
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      className="hover:bg-default/40 flex w-full items-center cursor-pointer justify-between gap-3 rounded-xl px-2 py-2 text-left text-xs transition-colors duration-120 ease-out"
      onClick={onPress}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <HugeiconsIcon
          color="currentColor"
          icon={icon}
          size={18}
          strokeWidth={1.5}
        />
        <span className="truncate">{label}</span>
      </span>
      {isSelected ? (
        <HugeiconsIcon
          color="currentColor"
          icon={Tick02Icon}
          size={15}
          strokeWidth={1.5}
        />
      ) : null}
    </button>
  );
}

export function WorkspaceSidebar() {
  const {
    leftSidebarOpen,
    navigateHome,
    navigateToThread: navigateToShellThread,
    pathname,
    selectedThreadId,
    toggleLeftSidebar,
  } = useShell();
  const commandShortcutLabel = useShortcutLabel("commandPalette.toggle");
  const router = useRouter();
  const utils = api.useUtils();
  const cachedPreferences = utils.workspaces.getPreferences.getData();
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(
    null,
  );
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(
    null,
  );
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>(
    () => cachedPreferences?.organizeBy ?? "workspace",
  );
  const [sortBy, setSortBy] = useState<SortBy>(
    () => cachedPreferences?.sortBy ?? "updated",
  );
  const preferencesRef = useRef<HTMLDivElement | null>(null);
  const preferencesScope = useShortcutScope({
    active: isPreferencesOpen,
    kind: "overlay",
  });
  const pinActionLockRef = useRef(new Set<string>());
  const warmedThreadIdsRef = useRef(new Set<string>());
  const hoverWarmTimeoutRef = useRef<number | null>(null);
  const pendingHoverWarmRef = useRef<string | null>(null);
  const {
    handleCreateWorkspace,
    handleOpenAutomations,
    handleOpenScratchpad,
    handleOpenSettings,
    handleOpenSkills,
    handleStartQuickChat,
    handleStartNewProjectThread,
    handleStartNewThread,
    isCreatingWorkspace,
  } = useAppShortcutActions();
  const renameWorkspaceState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setRenameWorkspaceId(null);
      }
    },
  });
  const renameThreadState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setRenameThreadId(null);
      }
    },
  });
  const deleteWorkspaceState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setDeleteWorkspaceId(null);
      }
    },
  });
  const [archiveThreadId, setArchiveThreadId] = useState<string | null>(null);
  const archiveThreadState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setArchiveThreadId(null);
      }
    },
  });
  const [pendingThreadSwitch, setPendingThreadSwitch] =
    useState<PendingThreadSwitch | null>(null);
  const [threadSwitchAction, setThreadSwitchAction] = useState<
    "migrate" | "stash" | null
  >(null);
  const [threadSwitchStashName, setThreadSwitchStashName] = useState("");
  const [threadSwitchError, setThreadSwitchError] = useState("");
  const threadSwitchState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setPendingThreadSwitch(null);
        setThreadSwitchAction(null);
        setThreadSwitchStashName("");
        setThreadSwitchError("");
      }
    },
  });

  const preferences = api.workspaces.getPreferences.useQuery();
  const appearance = api.appearance.get.useQuery();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const workspaces = api.workspaces.list.useQuery();
  const updateAppearance = api.appearance.update.useMutation();

  useShortcutAction("commandPalette.toggle", () => {
    setIsCommandPaletteOpen((current) => !current);
  });
  useShortcutAction(
    "overlay.close",
    () => {
      setIsPreferencesOpen(false);
    },
    {
      enabled: isPreferencesOpen,
      scopeId: preferencesScope.id,
    },
  );

  const expandedWorkspaceIds = useMemo(
    () =>
      new Set(
        (workspaces.data ?? []).filter((w) => w.isExpanded).map((w) => w.id),
      ),
    [workspaces.data],
  );

  const effectiveOrganizeBy = preferences.data?.organizeBy ?? organizeBy;
  const effectiveSortBy = preferences.data?.sortBy ?? sortBy;

  const threads = api.threads.list.useQuery(
    { organizeBy: effectiveOrganizeBy, sortBy: effectiveSortBy },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return false;
        const hasActive =
          "groups" in data
            ? data.groups?.some((g) =>
                g.threads.some((t) => t.status !== "idle"),
              )
            : "items" in data
              ? data.items?.some((t) => t.status !== "idle")
              : false;
        return hasActive ? 2_000 : false;
      },
    },
  );
  const quickChats = api.threads.listQuickChats.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.some((thread) => thread.status !== "idle")
        ? 2_000
        : false,
  });

  const groups: ThreadGroup =
    threads.data && "groups" in threads.data ? (threads.data.groups ?? []) : [];
  const items: ChronologicalThreadItem =
    threads.data && "items" in threads.data ? (threads.data.items ?? []) : [];
  const quickChatItems = useMemo(
    () =>
      [...(quickChats.data ?? [])].sort((left, right) => {
        if (left.pinnedAt && right.pinnedAt) {
          return right.pinnedAt.getTime() - left.pinnedAt.getTime();
        }
        if (left.pinnedAt) return -1;
        if (right.pinnedAt) return 1;
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      }),
    [quickChats.data],
  );

  const commandPaletteRecentThreads = useMemo(() => {
    const recent = new Map<
      string,
      {
        id: string;
        pinnedAt: Date | null;
        status: ThreadStatusValue;
        summary?: string | null;
        title: string;
        updatedAt: Date;
        workspace: { id: string; name: string };
      }
    >();

    for (const group of groups) {
      for (const thread of group.threads) {
        recent.set(thread.id, {
          ...thread,
          workspace: { id: group.workspace.id, name: group.workspace.name },
        });
      }
    }

    for (const item of items) {
      recent.set(item.id, {
        ...item,
        workspace: { id: item.workspace.id, name: item.workspace.name },
      });
    }

    return [...recent.values()].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  }, [groups, items]);
  const backgroundRepoPreloadCandidates = useMemo(
    () =>
      collectRepoDiffPreloadCandidates({
        groups,
        items,
        maxCandidates: Number.MAX_SAFE_INTEGER,
        selectedThreadId,
      }),
    [groups, items, selectedThreadId],
  );
  const backgroundRepoPreloadKey = useMemo(
    () =>
      backgroundRepoPreloadCandidates
        .map((candidate) => `${candidate.threadId}:${candidate.workspaceId}`)
        .join("|"),
    [backgroundRepoPreloadCandidates],
  );
  const backgroundRepoPreloadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!backgroundRepoPreloadCandidates.length) {
      backgroundRepoPreloadKeyRef.current = null;
      return;
    }

    if (backgroundRepoPreloadKeyRef.current === backgroundRepoPreloadKey) {
      return;
    }

    backgroundRepoPreloadKeyRef.current = backgroundRepoPreloadKey;
    queueRepoBackgroundWarmup({
      candidates: backgroundRepoPreloadCandidates,
      modes: REPO_DIFF_PRELOAD_MODES,
      strategy: "prefetch",
      utils,
    });
  }, [backgroundRepoPreloadCandidates, backgroundRepoPreloadKey, utils]);

  useEffect(() => {
    if (!backgroundRepoPreloadCandidates.length) {
      return;
    }

    const intervalId = window.setInterval(() => {
      queueRepoBackgroundWarmup({
        candidates: backgroundRepoPreloadCandidates,
        minIntervalMs: BACKGROUND_REPO_WARMUP_INTERVAL_MS,
        modes: REPO_DIFF_PRELOAD_MODES,
        strategy: "fetch",
        utils,
      });
    }, BACKGROUND_REPO_WARMUP_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [backgroundRepoPreloadCandidates, backgroundRepoPreloadKey, utils]);

  const togglePin = api.threads.togglePin.useMutation({
    onMutate: async ({ pinned, threadId }) => {
      const currentThread =
        findThreadState(threadId, groups, items, quickChatItems) ??
        (() => {
          const threadDetails = utils.threads.get.getData({ threadId });
          const thread = threadDetails?.thread;
          const workspace = threadDetails?.workspace;

          if (!thread || !workspace) {
            return null;
          }

          return {
            pinnedAt: thread.pinnedAt,
            workspaceId: workspace.id,
            workspaceKind: workspace.kind,
          };
        })();

      return applyOptimisticThreadPinUpdate({
        pinnedAt: pinned ? (currentThread?.pinnedAt ?? new Date()) : null,
        threadId,
        utils,
        workspaceKind: currentThread?.workspaceKind,
        workspaceId: currentThread?.workspaceId,
      });
    },
    onSuccess: (updatedThread, variables) => {
      const currentThread = findThreadState(
        variables.threadId,
        groups,
        items,
        quickChatItems,
      );

      applyOptimisticThreadPinUpdate({
        pinnedAt: updatedThread.pinnedAt,
        threadId: variables.threadId,
        utils,
        workspaceKind: currentThread?.workspaceKind,
        workspaceId: currentThread?.workspaceId ?? currentWorkspace.data?.id,
      });
    },
    onError: (_error, variables, context) => {
      restoreOptimisticThreadPinUpdate(utils, context, variables.threadId);
    },
    onSettled: (_data, _error, variables) => {
      pinActionLockRef.current.delete(variables.threadId);
      void utils.threads.list.invalidate();
      void utils.threads.listQuickChats.invalidate();
      void utils.threads.get.invalidate({ threadId: variables.threadId });
    },
  });

  const archiveThread = api.threads.archive.useMutation({
    onSuccess: (_data, variables) => {
      void utils.threads.list.invalidate();
      void utils.threads.listQuickChats.invalidate();
      if (variables.threadId === selectedThreadId) {
        navigateHome();
      }
    },
  });
  const renameThread = api.threads.rename.useMutation({
    onSuccess: (nextThread) => {
      const threadState =
        findThreadState(nextThread.id, groups, items, quickChatItems) ??
        (() => {
          const threadDetails = utils.threads.get.getData({
            threadId: nextThread.id,
          });
          const thread = threadDetails?.thread;
          const workspace = threadDetails?.workspace;
          return thread && workspace
            ? {
                pinnedAt: thread.pinnedAt,
                workspaceId: workspace.id,
                workspaceKind: workspace.kind,
              }
            : null;
        })();

      applyThreadTitleCacheUpdate({
        threadId: nextThread.id,
        title: nextThread.title,
        utils,
        workspaceKind: threadState?.workspaceKind,
        workspaceId: threadState?.workspaceId,
      });
      void utils.threads.list.invalidate();
      void utils.threads.listQuickChats.invalidate();
      void utils.threads.get.invalidate({ threadId: nextThread.id });
      renameThreadState.close();
    },
  });

  const handlePin = useCallback(
    (threadId: string) => {
      if (pinActionLockRef.current.has(threadId)) {
        return;
      }

      const currentThread =
        findThreadState(threadId, groups, items, quickChatItems) ??
        (() => {
          const threadDetails = utils.threads.get.getData({ threadId });
          const thread = threadDetails?.thread;
          const workspace = threadDetails?.workspace;

          if (!thread || !workspace) {
            return null;
          }

          return {
            pinnedAt: thread.pinnedAt,
            workspaceId: workspace.id,
            workspaceKind: workspace.kind,
          };
        })();

      pinActionLockRef.current.add(threadId);
      void togglePin.mutate({
        pinned: currentThread?.pinnedAt == null,
        threadId,
      });
    },
    [
      currentWorkspace.data?.id,
      groups,
      items,
      quickChatItems,
      togglePin,
      utils.threads.get,
    ],
  );

  const handleArchiveThread = useCallback(
    (threadId: string) => {
      setArchiveThreadId(threadId);
      archiveThreadState.open();
    },
    [archiveThreadState],
  );

  const archiveTargetTitle = useMemo(() => {
    if (!archiveThreadId) return null;
    for (const group of groups) {
      const thread = group.threads.find((t) => t.id === archiveThreadId);
      if (thread) return thread.title;
    }
    for (const item of items) {
      if (item.id === archiveThreadId) return item.title;
    }
    for (const item of quickChatItems) {
      if (item.id === archiveThreadId) return item.title;
    }
    return null;
  }, [archiveThreadId, groups, items, quickChatItems]);

  const renameTargetThread = useMemo(() => {
    if (!renameThreadId) return null;
    for (const group of groups) {
      const thread = group.threads.find((t) => t.id === renameThreadId);
      if (thread) {
        return {
          id: thread.id,
          title: thread.title,
          workspaceId: group.workspace.id,
        };
      }
    }
    for (const item of items) {
      if (item.id === renameThreadId) {
        return {
          id: item.id,
          title: item.title,
          workspaceId: item.workspace.id,
        };
      }
    }
    for (const item of quickChatItems) {
      if (item.id === renameThreadId) {
        return {
          id: item.id,
          title: item.title,
          workspaceId: item.workspace.id,
        };
      }
    }
    const thread = renameThreadId
      ? utils.threads.get.getData({ threadId: renameThreadId })
      : null;
    if (!thread) return null;
    return {
      id: thread.thread.id,
      title: thread.thread.title,
      workspaceId: thread.workspace.id,
    };
  }, [groups, items, quickChatItems, renameThreadId, utils.threads.get]);

  const handleConfirmArchiveThread = useCallback(() => {
    if (!archiveThreadId) return;
    void archiveThread.mutate({ threadId: archiveThreadId });
    archiveThreadState.close();
  }, [archiveThread, archiveThreadId, archiveThreadState]);

  const handleOpenRenameThread = useCallback(
    (threadId: string) => {
      setRenameThreadId(threadId);
      renameThreadState.open();
    },
    [renameThreadState],
  );

  const updateWorkspace = api.workspaces.update.useMutation({
    onSuccess: (workspace) => {
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((item) =>
          item.id === workspace.id
            ? {
                ...item,
                description: workspace.description,
                name: workspace.name,
                rootPath: workspace.rootPath,
                updatedAt: workspace.updatedAt,
              }
            : item,
        ),
      );
      utils.workspaces.getCurrent.setData(undefined, (current) =>
        current?.id === workspace.id
          ? {
              ...current,
              description: workspace.description,
              name: workspace.name,
              rootPath: workspace.rootPath,
              updatedAt: workspace.updatedAt,
            }
          : current,
      );
      void utils.threads.list.invalidate();
      void utils.repo.listWorkspaceStatuses.invalidate();
    },
  });

  const archiveWorkspace = api.workspaces.archive.useMutation({
    onSuccess: ({ selectedWorkspaceId, workspaceId }) => {
      const knownWorkspaces = utils.workspaces.list.getData() ?? [];
      const nextSelectedWorkspace =
        knownWorkspaces.find(
          (workspace) => workspace.id === selectedWorkspaceId,
        ) ?? null;

      utils.workspaces.list.setData(
        undefined,
        (current) =>
          current
            ?.filter((workspace) => workspace.id !== workspaceId)
            .map((workspace) => ({
              ...workspace,
              isSelected: workspace.id === selectedWorkspaceId,
            })) ?? [],
      );
      utils.workspaces.getCurrent.setData(
        undefined,
        toCurrentWorkspace(nextSelectedWorkspace),
      );
      void utils.threads.list.invalidate();
      void utils.repo.listWorkspaceStatuses.invalidate();

      if (
        (selectedThreadState?.workspaceId === workspaceId ||
          selectedWorkspaceId == null) &&
        pathname !== "/"
      ) {
        navigateHome();
      }

      deleteWorkspaceState.close();
    },
  });

  const selectWorkspace = api.workspaces.select.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previousCurrentWorkspace = utils.workspaces.getCurrent.getData();
      const previousWorkspaces = utils.workspaces.list.getData();

      utils.workspaces.getCurrent.setData(undefined, () => {
        const nextWorkspace = previousWorkspaces?.find(
          (workspace) => workspace.id === workspaceId,
        );
        return (
          toCurrentWorkspace(nextWorkspace) ?? previousCurrentWorkspace ?? null
        );
      });
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((workspace) => ({
          ...workspace,
          isSelected: workspace.id === workspaceId,
        })),
      );

      return {
        previousCurrentWorkspace,
        previousWorkspaces,
      };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.getCurrent.setData(
        undefined,
        context?.previousCurrentWorkspace ?? null,
      );
      utils.workspaces.list.setData(
        undefined,
        context?.previousWorkspaces ?? [],
      );
    },
  });
  const updatePreferences = api.workspaces.updatePreferences.useMutation({
    onMutate: async (nextValues) => {
      const previousPreferences = utils.workspaces.getPreferences.getData();

      utils.workspaces.getPreferences.setData(undefined, {
        organizeBy: nextValues.organizeBy,
        sortBy: nextValues.sortBy,
      });

      return { previousPreferences };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.getPreferences.setData(
        undefined,
        context?.previousPreferences,
      );
    },
  });
  const handoffThreadSwitch = api.repo.handoffThreadSwitch.useMutation();

  useEffect(() => {
    if (!preferences.data) {
      return;
    }

    if (preferences.data.organizeBy !== organizeBy) {
      setOrganizeBy(preferences.data.organizeBy);
    }
    if (preferences.data.sortBy !== sortBy) {
      setSortBy(preferences.data.sortBy);
    }
  }, [preferences.data]);

  useEffect(() => {
    return () => {
      if (hoverWarmTimeoutRef.current != null) {
        window.clearTimeout(hoverWarmTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPreferencesOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        preferencesRef.current &&
        event.target instanceof Node &&
        !preferencesRef.current.contains(event.target)
      ) {
        setIsPreferencesOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isPreferencesOpen]);

  const selectedWorkspaceId = currentWorkspace.data?.id ?? null;
  const selectedThreadState = useMemo(
    () =>
      selectedThreadId
        ? findThreadState(selectedThreadId, groups, items, quickChatItems)
        : null,
    [groups, items, quickChatItems, selectedThreadId],
  );
  const renameTargetWorkspace = useMemo(
    () =>
      (workspaces.data ?? []).find(
        (workspace) => workspace.id === renameWorkspaceId,
      ) ?? null,
    [renameWorkspaceId, workspaces.data],
  );
  const deleteTargetWorkspace = useMemo(
    () =>
      (workspaces.data ?? []).find(
        (workspace) => workspace.id === deleteWorkspaceId,
      ) ?? null,
    [deleteWorkspaceId, workspaces.data],
  );

  const handlePreferencesChange = useCallback(
    (
      nextValues: Partial<{
        organizeBy: OrganizeBy;
        sortBy: SortBy;
      }>,
    ) => {
      const nextOrganizeBy = nextValues.organizeBy ?? effectiveOrganizeBy;
      const nextSortBy = nextValues.sortBy ?? effectiveSortBy;

      setOrganizeBy(nextOrganizeBy);
      setSortBy(nextSortBy);

      void updatePreferences.mutate({
        organizeBy: nextOrganizeBy,
        sortBy: nextSortBy,
      });
    },
    [effectiveOrganizeBy, effectiveSortBy, updatePreferences],
  );

  const currentAppearance =
    appearance.data ??
    utils.appearance.get.getData() ??
    DEFAULT_APPEARANCE_SETTINGS;
  const currentThemePreference = currentAppearance.themePreference;
  const resolvedTheme = resolveThemePreference(currentThemePreference);

  const handleSetThemePreference = useCallback(
    async (nextThemePreference: ThemePreference) => {
      if (
        nextThemePreference === currentThemePreference ||
        updateAppearance.isPending
      ) {
        return;
      }

      const previousAppearance = currentAppearance;
      const nextAppearance = {
        ...currentAppearance,
        themePreference: nextThemePreference,
      };

      utils.appearance.get.setData(undefined, nextAppearance);
      applyAppearanceSettings(nextAppearance);
      dispatchAppearanceEvents();

      try {
        const savedAppearance =
          await updateAppearance.mutateAsync(nextAppearance);
        utils.appearance.get.setData(undefined, savedAppearance);
        applyAppearanceSettings(savedAppearance);
        dispatchAppearanceEvents();
      } catch (error) {
        utils.appearance.get.setData(undefined, previousAppearance);
        applyAppearanceSettings(previousAppearance);
        dispatchAppearanceEvents();
        sileo.error({
          description: getErrorMessage(
            error,
            "Unable to update the theme right now.",
          ),
          title: "Theme update failed",
        });
      }
    },
    [
      currentAppearance,
      currentThemePreference,
      updateAppearance,
      utils.appearance.get,
    ],
  );

  const handleToggleTheme = useCallback(() => {
    void handleSetThemePreference(
      getToggledThemePreference(currentThemePreference),
    );
  }, [currentThemePreference, handleSetThemePreference]);

  const toggleExpanded = api.workspaces.toggleExpanded.useMutation({
    onMutate: async ({ workspaceId }) => {
      const previous = utils.workspaces.list.getData();
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((w) =>
          w.id === workspaceId ? { ...w, isExpanded: !w.isExpanded } : w,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.list.setData(undefined, context?.previous ?? []);
    },
  });

  const setAllExpanded = api.workspaces.setAllExpanded.useMutation({
    onMutate: async ({ expanded }) => {
      const previous = utils.workspaces.list.getData();
      utils.workspaces.list.setData(undefined, (current) =>
        current?.map((w) => ({ ...w, isExpanded: expanded })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      utils.workspaces.list.setData(undefined, context?.previous ?? []);
    },
  });

  const reorderWorkspaces = api.workspaces.reorder.useMutation({
    onError: () => {
      void utils.workspaces.list.invalidate();
      void utils.threads.list.invalidate();
    },
  });

  const handleToggleWorkspace = useCallback(
    (workspaceId: string) => {
      void toggleExpanded.mutate({ workspaceId });
    },
    [toggleExpanded],
  );

  const allWorkspacesExpanded = useMemo(
    () =>
      (workspaces.data ?? []).length > 0 &&
      (workspaces.data ?? []).every((w) => w.isExpanded),
    [workspaces.data],
  );

  const handleToggleAllExpanded = useCallback(() => {
    void setAllExpanded.mutate({ expanded: !allWorkspacesExpanded });
  }, [allWorkspacesExpanded, setAllExpanded]);

  const handleStartWorkspaceProjectThread = useCallback(
    async (workspaceId: string) => {
      try {
        await selectWorkspace.mutateAsync({ workspaceId });
      } finally {
        router.push("/project-thread");
      }
    },
    [router, selectWorkspace],
  );

  const handleReorderWorkspaces = useCallback(
    (orderedIds: string[]) => {
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));

      utils.workspaces.list.setData(undefined, (current) => {
        if (!current) return current;
        const sorted = [...current];
        sorted.sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );
        return sorted.map((w, i) => ({ ...w, sortOrder: i }));
      });

      utils.threads.list.setData(
        { organizeBy: effectiveOrganizeBy, sortBy: effectiveSortBy },
        (current) => {
          if (!current || !("groups" in current) || !current.groups)
            return current;
          const reordered = [...current.groups];
          reordered.sort(
            (a, b) =>
              (orderMap.get(a.workspace.id) ?? 0) -
              (orderMap.get(b.workspace.id) ?? 0),
          );
          return { ...current, groups: reordered };
        },
      );

      void reorderWorkspaces.mutateAsync({ workspaceIds: orderedIds }).then(
        () => {
          void utils.threads.list.invalidate();
        },
        () => {
          void utils.workspaces.list.invalidate();
          void utils.threads.list.invalidate();
        },
      );
    },
    [
      effectiveOrganizeBy,
      effectiveSortBy,
      reorderWorkspaces,
      utils.threads.list,
      utils.workspaces.list,
    ],
  );

  const warmThreadNow = useCallback(
    (workspaceId: string, threadId: string) => {
      if (selectedThreadId === threadId) {
        return;
      }

      if (warmedThreadIdsRef.current.has(threadId)) {
        return;
      }

      warmedThreadIdsRef.current.add(threadId);
      if (warmedThreadIdsRef.current.size > MAX_WARMED_THREAD_ENTRIES) {
        const oldestThreadId = warmedThreadIdsRef.current.values().next().value;
        if (oldestThreadId) {
          warmedThreadIdsRef.current.delete(oldestThreadId);
        }
      }

      void utils.threads.get.prefetch({ threadId });
      void router.prefetch(`/thread/${threadId}`);
      void warmRepoDiffBundleCandidate({
        candidate: { threadId, workspaceId },
        modes: REPO_DIFF_PRELOAD_MODES,
        strategy: "prefetch",
        utils,
      });
    },
    [router, selectedThreadId, utils],
  );

  const handleWarmThread = useCallback<WarmThreadHandler>(
    (_workspaceId, threadId, strategy = "hover") => {
      if (selectedThreadId === threadId) {
        return;
      }

      if (strategy !== "hover") {
        pendingHoverWarmRef.current = null;
        if (hoverWarmTimeoutRef.current != null) {
          window.clearTimeout(hoverWarmTimeoutRef.current);
          hoverWarmTimeoutRef.current = null;
        }
        warmThreadNow(_workspaceId, threadId);
        return;
      }

      if (
        warmedThreadIdsRef.current.has(threadId) ||
        pendingHoverWarmRef.current === threadId
      ) {
        return;
      }

      pendingHoverWarmRef.current = threadId;
      if (hoverWarmTimeoutRef.current != null) {
        window.clearTimeout(hoverWarmTimeoutRef.current);
      }

      hoverWarmTimeoutRef.current = window.setTimeout(() => {
        hoverWarmTimeoutRef.current = null;
        if (pendingHoverWarmRef.current !== threadId) {
          return;
        }
        pendingHoverWarmRef.current = null;
        warmThreadNow(_workspaceId, threadId);
      }, THREAD_WARM_HOVER_DELAY_MS);
    },
    [selectedThreadId, warmThreadNow],
  );

  const warmQuickChatNow = useCallback(
    (threadId: string) => {
      if (selectedThreadId === threadId) {
        return;
      }

      if (warmedThreadIdsRef.current.has(threadId)) {
        return;
      }

      warmedThreadIdsRef.current.add(threadId);
      if (warmedThreadIdsRef.current.size > MAX_WARMED_THREAD_ENTRIES) {
        const oldestThreadId = warmedThreadIdsRef.current.values().next().value;
        if (oldestThreadId) {
          warmedThreadIdsRef.current.delete(oldestThreadId);
        }
      }

      void utils.threads.get.prefetch({ threadId });
      void router.prefetch(`/thread/${threadId}`);
    },
    [router, selectedThreadId, utils],
  );

  const handleWarmQuickChat = useCallback(
    (threadId: string, strategy: ThreadWarmStrategy = "hover") => {
      if (selectedThreadId === threadId) {
        return;
      }

      if (strategy !== "hover") {
        pendingHoverWarmRef.current = null;
        if (hoverWarmTimeoutRef.current != null) {
          window.clearTimeout(hoverWarmTimeoutRef.current);
          hoverWarmTimeoutRef.current = null;
        }
        warmQuickChatNow(threadId);
        return;
      }

      if (
        warmedThreadIdsRef.current.has(threadId) ||
        pendingHoverWarmRef.current === threadId
      ) {
        return;
      }

      pendingHoverWarmRef.current = threadId;
      if (hoverWarmTimeoutRef.current != null) {
        window.clearTimeout(hoverWarmTimeoutRef.current);
      }

      hoverWarmTimeoutRef.current = window.setTimeout(() => {
        hoverWarmTimeoutRef.current = null;
        if (pendingHoverWarmRef.current !== threadId) {
          return;
        }
        pendingHoverWarmRef.current = null;
        warmQuickChatNow(threadId);
      }, THREAD_WARM_HOVER_DELAY_MS);
    },
    [selectedThreadId, warmQuickChatNow],
  );

  const navigateToThread = useCallback(
    (workspaceId: string, threadId: string) => {
      if (selectedWorkspaceId !== workspaceId) {
        void selectWorkspace.mutate({ workspaceId });
      }

      handleWarmThread(workspaceId, threadId, "press");
      navigateToShellThread(threadId);
    },
    [
      handleWarmThread,
      navigateToShellThread,
      selectWorkspace,
      selectedWorkspaceId,
    ],
  );

  const navigateToQuickChat = useCallback(
    (threadId: string) => {
      handleWarmQuickChat(threadId, "press");
      navigateToShellThread(threadId);
    },
    [handleWarmQuickChat, navigateToShellThread],
  );

  const finalizeThreadSwitch = useCallback(
    async (
      switchState: PendingThreadSwitch,
      input?: { stashName?: string; strategy?: "migrate" | "stash" },
    ) => {
      setThreadSwitchError("");
      setThreadSwitchAction(input?.strategy ?? null);
      const result = await handoffThreadSwitch.mutateAsync({
        sourceThreadId: switchState.sourceThreadId,
        targetThreadId: switchState.targetThreadId,
        workspaceId: switchState.workspaceId,
        ...(input?.stashName ? { stashName: input.stashName } : {}),
        ...(input?.strategy ? { strategy: input.strategy } : {}),
      });
      utils.repo.getContext.setData(
        {
          threadId: switchState.targetThreadId,
          workspaceId: switchState.workspaceId,
        },
        result.repoContext as never,
      );
      await Promise.all([
        utils.repo.listWorkspaceStatuses.invalidate(),
        utils.threads.get.invalidate({ threadId: switchState.targetThreadId }),
        selectedThreadId
          ? utils.threads.get.invalidate({ threadId: selectedThreadId })
          : Promise.resolve(),
        utils.threads.list.invalidate(),
      ]);
      threadSwitchState.close();
      navigateToThread(switchState.workspaceId, switchState.targetThreadId);

      sileo.success({
        description:
          result.action === "migrate"
            ? `Moved the current changes into ${switchState.targetBranch ?? result.branch ?? "the target thread"}.`
            : result.action === "stash"
              ? `Stashed the current changes and switched to ${result.branch ?? switchState.targetBranch ?? "the target thread"}.`
              : result.action === "checkout"
                ? `Switched to ${result.branch ?? switchState.targetBranch ?? "the target thread"}.`
                : "Opened the target thread.",
        title: "Thread switched",
      });
    },
    [
      handoffThreadSwitch,
      navigateToThread,
      selectedThreadId,
      threadSwitchState,
      utils.repo.getContext,
      utils.repo.listWorkspaceStatuses,
      utils.threads.get,
      utils.threads.list,
    ],
  );

  const handlePressThread = useCallback(
    (workspaceId: string, threadId: string) => {
      void (async () => {
        if (selectedThreadId === threadId) {
          return;
        }

        navigateToThread(workspaceId, threadId);

        const sourceThreadId = selectedThreadId;
        const effectiveSelectedThreadState =
          selectedThreadState ??
          (() => {
            const cachedThread = utils.threads.get.getData({
              threadId: sourceThreadId ?? "",
            });
            return cachedThread?.workspace
              ? {
                  pinnedAt: cachedThread.thread.pinnedAt,
                  workspaceId: cachedThread.workspace.id,
                  workspaceKind: cachedThread.workspace.kind,
                }
              : null;
          })();

        if (
          !sourceThreadId ||
          !shouldInspectWorkspaceThreadSwitch({
            selectedThreadId: sourceThreadId,
            selectedThreadState: effectiveSelectedThreadState,
            targetWorkspaceId: workspaceId,
          })
        ) {
          return;
        }

        try {
          await utils.repo.inspectThreadSwitch.fetch({
            sourceThreadId,
            targetThreadId: threadId,
            workspaceId,
          });
          await utils.repo.getContext.invalidate({ threadId, workspaceId });
        } catch (error) {
          console.debug("Unable to inspect thread switch after navigation.", {
            error,
            sourceThreadId,
            targetThreadId: threadId,
            workspaceId,
          });
        }
      })();
    },
    [
      navigateToThread,
      selectedThreadState,
      selectedThreadId,
      utils.repo.getContext,
      utils.repo.inspectThreadSwitch,
      utils.threads.get,
    ],
  );

  const handlePressQuickChat = useCallback(
    (threadId: string) => {
      if (selectedThreadId === threadId) {
        return;
      }

      navigateToQuickChat(threadId);
    },
    [navigateToQuickChat, selectedThreadId],
  );

  const pendingThreadSwitchSource = useMemo(
    () =>
      pendingThreadSwitch
        ? findThreadListItem(
            pendingThreadSwitch.sourceThreadId,
            groups,
            items,
            quickChatItems,
          )
        : null,
    [groups, items, pendingThreadSwitch, quickChatItems],
  );
  const pendingThreadSwitchTarget = useMemo(
    () =>
      pendingThreadSwitch
        ? findThreadListItem(
            pendingThreadSwitch.targetThreadId,
            groups,
            items,
            quickChatItems,
          )
        : null,
    [groups, items, pendingThreadSwitch, quickChatItems],
  );
  const handleConfirmThreadMigration = useCallback(() => {
    if (!pendingThreadSwitch) {
      return;
    }

    void finalizeThreadSwitch(pendingThreadSwitch, {
      strategy: "migrate",
    }).catch((error) => {
      setThreadSwitchAction(null);
      setThreadSwitchError(
        getErrorMessage(error, "Unable to move the current changes."),
      );
    });
  }, [finalizeThreadSwitch, pendingThreadSwitch]);
  const handleConfirmThreadStash = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!pendingThreadSwitch) {
        return;
      }

      const stashName = threadSwitchStashName.trim();
      if (!stashName) {
        setThreadSwitchError("Enter a stash name before switching threads.");
        return;
      }

      void finalizeThreadSwitch(pendingThreadSwitch, {
        stashName,
        strategy: "stash",
      }).catch((error) => {
        setThreadSwitchAction(null);
        setThreadSwitchError(
          getErrorMessage(error, "Unable to stash the current changes."),
        );
      });
    },
    [finalizeThreadSwitch, pendingThreadSwitch, threadSwitchStashName],
  );

  const handleOpenRenameWorkspace = useCallback(
    (workspaceId: string) => {
      setRenameWorkspaceId(workspaceId);
      renameWorkspaceState.open();
    },
    [renameWorkspaceState],
  );

  const handleOpenDeleteWorkspace = useCallback(
    (workspaceId: string) => {
      setDeleteWorkspaceId(workspaceId);
      deleteWorkspaceState.open();
    },
    [deleteWorkspaceState],
  );

  const handleRenameWorkspaceSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!renameTargetWorkspace) {
        return;
      }

      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name") ?? "").trim();
      if (!name) {
        return;
      }

      void (async () => {
        try {
          await updateWorkspace.mutateAsync({
            description: renameTargetWorkspace.description ?? "",
            name,
            rootPath: renameTargetWorkspace.rootPath ?? undefined,
            workspaceId: renameTargetWorkspace.id,
          });
          renameWorkspaceState.close();
        } catch (error) {
          sileo.error({
            description: getErrorMessage(
              error,
              "Unable to rename that workspace.",
            ),
            title: "Workspace rename failed",
          });
        }
      })();
    },
    [renameTargetWorkspace, renameWorkspaceState, updateWorkspace],
  );

  const handleRelocateWorkspace = useCallback(
    (workspaceId: string) => {
      const targetWorkspace = (workspaces.data ?? []).find(
        (workspace) => workspace.id === workspaceId,
      );
      if (!targetWorkspace) {
        return;
      }

      void (async () => {
        try {
          const directory = await pickWorkspaceDirectory();
          if (!directory) {
            return;
          }

          const nextRootPath = normalizeWorkspaceDirectoryPath(directory.path);
          const currentRootPath = normalizeWorkspaceDirectoryPath(
            targetWorkspace.rootPath ?? "",
          );

          if (nextRootPath === currentRootPath) {
            return;
          }

          await updateWorkspace.mutateAsync({
            description: targetWorkspace.description ?? "",
            name: targetWorkspace.name,
            rootPath: directory.path,
            workspaceId: targetWorkspace.id,
          });
        } catch (error) {
          sileo.error({
            description: getErrorMessage(
              error,
              "Unable to update that workspace path.",
            ),
            title: "Workspace path update failed",
          });
        }
      })();
    },
    [updateWorkspace, workspaces.data],
  );

  const handleRenameThreadSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!renameTargetThread) {
        return;
      }

      const formData = new FormData(event.currentTarget);
      const title = String(formData.get("title") ?? "").trim();
      if (!title) {
        return;
      }

      void renameThread.mutate({
        threadId: renameTargetThread.id,
        title,
      });
    },
    [renameTargetThread, renameThread],
  );

  const handleConfirmDeleteWorkspace = useCallback(() => {
    if (!deleteTargetWorkspace) {
      return;
    }

    void archiveWorkspace.mutate({ workspaceId: deleteTargetWorkspace.id });
  }, [archiveWorkspace, deleteTargetWorkspace]);

  const commandPaletteActions = useMemo(
    () => [
      {
        icon: PencilEdit02Icon,
        id: "new-thread",
        keywords: ["create", "compose", "chat", "quick"],
        label: "New quick chat",
        onSelect: handleStartQuickChat,
        subtitle: "Start a fresh conversation outside any project",
      },
      {
        icon: PencilEdit02Icon,
        id: "new-project-thread",
        keywords: ["project", "workspace", "thread"],
        label: "New project thread",
        onSelect: handleStartNewThread,
        shortcutActionId: "thread.new" as const,
        subtitle: "Start a thread tied to one of your projects",
      },
      {
        icon: FolderAddIcon,
        id: "create-workspace",
        keywords: ["project", "folder", "workspace"],
        label: "Create workspace",
        onSelect: handleCreateWorkspace,
        shortcutActionId: "workspace.create" as const,
        subtitle: "Pick a project directory and add it to Sentinel",
      },
      {
        icon: Clock01Icon,
        id: "open-automations",
        keywords: ["scheduled", "tasks", "automation"],
        label: "Automations",
        onSelect: handleOpenAutomations,
        shortcutActionId: "automations.open" as const,
        subtitle: "Jump to recurring tasks and run history",
      },
      {
        icon: CheckListIcon,
        id: "open-scratchpad",
        keywords: ["scratchpad", "quick tasks", "checklist", "todo"],
        label: "Scratchpad",
        onSelect: handleOpenScratchpad,
        shortcutActionId: "scratchpad.open" as const,
        subtitle:
          "Capture quick tasks and let agents run them in the background",
      },
      {
        icon: AiIdeaIcon,
        id: "open-skills",
        keywords: ["agents", "skills", "capabilities"],
        label: "Skills",
        onSelect: handleOpenSkills,
        shortcutActionId: "skills.open" as const,
        subtitle: "Browse installed skills and add new ones",
      },
      {
        icon: Settings01Icon,
        id: "open-settings",
        keywords: ["preferences", "models", "appearance"],
        label: "Settings",
        onSelect: handleOpenSettings,
        shortcutActionId: "settings.open" as const,
        subtitle: "Open Sentinel preferences",
      },
      {
        icon: BrushIcon,
        id: "open-appearance-settings",
        keywords: ["theme", "appearance", "fonts", "display"],
        label: "Appearance",
        onSelect: () => {
          openSettingsRoute(router, "/settings/appearance", pathname);
        },
        subtitle: "Open theme, font, and display settings",
      },
      {
        icon: LayoutLeftIcon,
        id: "toggle-sidebar",
        keywords: ["sidebar", "panel", "left", "show", "hide"],
        label: leftSidebarOpen ? "Hide sidebar" : "Show sidebar",
        onSelect: toggleLeftSidebar,
        shortcutActionId: "sidebar.left.toggle" as const,
        subtitle: leftSidebarOpen
          ? "Collapse the left sidebar"
          : "Expand the left sidebar",
      },
      {
        icon: THEME_ACTION_ICONS[currentThemePreference],
        id: "toggle-theme",
        keywords: ["theme", "dark", "light", "appearance", "mode"],
        label: "Toggle theme",
        onSelect: handleToggleTheme,
        subtitle:
          currentThemePreference === "system"
            ? `Following system appearance (${resolvedTheme})`
            : `Currently using the ${currentThemePreference} theme`,
      },
      {
        icon: Sun03Icon,
        id: "theme-light",
        keywords: ["theme", "appearance", "light", "day"],
        label: "Light theme",
        onSelect: () => {
          void handleSetThemePreference("light");
        },
        subtitle: "Switch Sentinel to the light theme",
      },
      {
        icon: Moon02Icon,
        id: "theme-dark",
        keywords: ["theme", "appearance", "dark", "night"],
        label: "Dark theme",
        onSelect: () => {
          void handleSetThemePreference("dark");
        },
        subtitle: "Switch Sentinel to the dark theme",
      },
      {
        icon: ComputerIcon,
        id: "theme-system",
        keywords: ["theme", "appearance", "system", "auto"],
        label: "System theme",
        onSelect: () => {
          void handleSetThemePreference("system");
        },
        subtitle: "Match your device appearance automatically",
      },
    ],
    [
      currentThemePreference,
      handleCreateWorkspace,
      handleOpenAutomations,
      handleOpenScratchpad,
      handleOpenSettings,
      handleOpenSkills,
      handleStartQuickChat,
      handleStartNewProjectThread,
      handleSetThemePreference,
      handleStartNewThread,
      handleToggleTheme,
      leftSidebarOpen,
      resolvedTheme,
      router,
      toggleLeftSidebar,
    ],
  );

  const projectListIsEmpty =
    organizeBy === "workspace" ? groups.length === 0 : items.length === 0;
  const quickChatListIsEmpty = quickChatItems.length === 0;
  const showSidebarLoading = threads.isPending || preferences.isPending;
  const showQuickChatsLoading = quickChats.isPending;
  const showSidebarRefreshing =
    !showSidebarLoading && (threads.isFetching || preferences.isFetching);

  return (
    <div className="flex h-full flex-col select-none">
      <div className={`shrink-0 ${SIDEBAR_SECTION_INSET} pt-1 pb-3`}>
        <nav className="flex flex-col">
          <Button
            className={`justify-start rounded-xl ${SIDEBAR_ITEM_INSET} ${
              pathname === "/" || pathname === "/project-thread"
                ? "bg-default/70 text-foreground"
                : "text-foreground/80 hover:bg-default/40 hover:text-foreground"
            }`}
            fullWidth
            onPress={handleStartNewThread}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={PencilEdit02Icon}
              size={16}
              strokeWidth={1.5}
            />
            New thread
          </Button>

          <Button
            className={`justify-start rounded-xl ${SIDEBAR_ITEM_INSET} text-foreground/80 hover:bg-default/40 hover:text-foreground`}
            fullWidth
            onPress={() => setIsCommandPaletteOpen(true)}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Search01Icon}
              size={16}
              strokeWidth={1.5}
            />
            <span className="truncate">Search</span>
            <span className="flex-1" />
            <Kbd className="h-5 rounded-md border-none bg-default px-1.5 text-[10px] font-medium text-foreground/55 shadow-none">
              {commandShortcutLabel}
            </Kbd>
          </Button>

          {PRIMARY_NAV.slice(1).map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Button
                className={`justify-start rounded-xl ${SIDEBAR_ITEM_INSET} ${
                  isActive
                    ? "bg-default/70 text-foreground"
                    : "text-foreground/80 hover:bg-default/40 hover:text-foreground"
                }`}
                fullWidth
                key={item.href}
                onPress={() => {
                  router.push(item.href);
                }}
                size="sm"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={item.icon}
                  size={16}
                  strokeWidth={1.5}
                />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollShadow
          className="h-full min-h-0 pb-4"
          hideScrollBar
          orientation="vertical"
          size={56}
        >
          <div className="flex min-h-full flex-col">
            <div
              className={`flex shrink-0 items-center gap-1 ${SIDEBAR_SECTION_INSET}`}
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-foreground/40 flex items-center gap-1.5 px-1 text-xs font-medium">
                  Projects
                </h2>
              </div>

              {organizeBy === "workspace" && groups.length > 0 ? (
                <Tooltip.Root delay={450}>
                  <Tooltip.Trigger>
                    <Button
                      isIconOnly
                      onPress={handleToggleAllExpanded}
                      size="sm"
                      className={SIDEBAR_ICON_BTN}
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        className={`transition-transform duration-120 ease-out`}
                        color="currentColor"
                        icon={allWorkspacesExpanded ? CollapseIcon : ExpandIcon}
                        size={8}
                        strokeWidth={1.5}
                      />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content offset={8} placement="bottom">
                    {allWorkspacesExpanded
                      ? "Collapse all projects"
                      : "Expand all projects"}
                  </Tooltip.Content>
                </Tooltip.Root>
              ) : null}

              <Button
                isIconOnly
                isDisabled={isCreatingWorkspace}
                onPress={handleCreateWorkspace}
                size="sm"
                className={SIDEBAR_ICON_BTN}
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={FolderAddIcon}
                  size={8}
                  strokeWidth={1.5}
                />
              </Button>

              <div className="relative" ref={preferencesRef}>
                <Button
                  isIconOnly
                  onPress={() => setIsPreferencesOpen((open) => !open)}
                  size="sm"
                  className={SIDEBAR_ICON_BTN}
                  variant="ghost"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={FilterMailIcon}
                    size={8}
                    strokeWidth={1.5}
                  />
                </Button>

                <AnimatePresence>
                  {isPreferencesOpen ? (
                    <motion.div
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="absolute top-9 right-0 z-30 w-40 overflow-hidden rounded-2xl border border-border bg-overlay p-1.5 text-foreground shadow-overlay"
                      exit={{ opacity: 0, scale: 0.97, y: -10 }}
                      initial={{ opacity: 0, scale: 0.97, y: -10 }}
                      transition={{
                        duration: 0.15,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                    >
                      <div className="space-y-1 px-2 pt-1 pb-2">
                        <p className="text-[11px] font-medium text-muted">
                          Organize
                        </p>
                      </div>
                      <PreferenceMenuItem
                        icon={Folder03Icon}
                        isSelected={organizeBy === "workspace"}
                        label="By project"
                        onPress={() =>
                          void handlePreferencesChange({
                            organizeBy: "workspace",
                          })
                        }
                      />
                      <PreferenceMenuItem
                        icon={Clock01Icon}
                        isSelected={organizeBy === "chronological"}
                        label="Chronologically"
                        onPress={() =>
                          void handlePreferencesChange({
                            organizeBy: "chronological",
                          })
                        }
                      />

                      <div className="mx-2 my-3 h-px bg-separator" />

                      <div className="space-y-1 px-2 pb-2">
                        <p className="text-[11px] font-medium text-muted">
                          Sort by
                        </p>
                      </div>
                      <PreferenceMenuItem
                        icon={AddCircleHalfDotIcon}
                        isSelected={sortBy === "created"}
                        label="Created"
                        onPress={() =>
                          void handlePreferencesChange({ sortBy: "created" })
                        }
                      />
                      <PreferenceMenuItem
                        icon={PencilEdit02Icon}
                        isSelected={sortBy === "updated"}
                        label="Updated"
                        onPress={() =>
                          void handlePreferencesChange({ sortBy: "updated" })
                        }
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>

            {!showSidebarLoading &&
            organizeBy === "workspace" &&
            groups.length > 0 ? (
              <ThreadList
                expandedWorkspaceIds={expandedWorkspaceIds}
                groups={groups}
                onArchive={handleArchiveThread}
                onArchiveWorkspace={handleOpenDeleteWorkspace}
                onCreateThread={handleStartWorkspaceProjectThread}
                onPin={handlePin}
                onPressThread={handlePressThread}
                onRelocateWorkspace={handleRelocateWorkspace}
                onRenameThread={handleOpenRenameThread}
                onRenameWorkspace={handleOpenRenameWorkspace}
                onReorderWorkspaces={handleReorderWorkspaces}
                onWarmThread={handleWarmThread}
                selectedThreadId={selectedThreadId}
                onToggleWorkspace={handleToggleWorkspace}
              />
            ) : null}

            {!showSidebarLoading &&
            organizeBy === "chronological" &&
            items.length > 0 ? (
              <ChronologicalThreadList
                items={items}
                onArchive={handleArchiveThread}
                onPin={handlePin}
                onPressThread={handlePressThread}
                onRenameThread={handleOpenRenameThread}
                onWarmThread={handleWarmThread}
                selectedThreadId={selectedThreadId}
              />
            ) : null}

            <div
              className={`flex shrink-0 items-center gap-1 ${SIDEBAR_SECTION_INSET}`}
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-foreground/40 flex items-center gap-1.5 px-1 text-xs font-medium">
                  Chats
                </h2>
              </div>

              <Button
                isIconOnly
                onPress={handleStartQuickChat}
                size="sm"
                className={SIDEBAR_ICON_BTN}
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={PencilEdit02Icon}
                  size={8}
                  strokeWidth={1.5}
                />
              </Button>
            </div>

            {!showQuickChatsLoading && !quickChatListIsEmpty ? (
              <QuickChatsList
                onArchive={handleArchiveThread}
                onPin={handlePin}
                onPressThread={handlePressQuickChat}
                onRenameThread={handleOpenRenameThread}
                onWarmThread={handleWarmQuickChat}
                selectedThreadId={selectedThreadId}
                threads={quickChatItems}
              />
            ) : null}

            {!showQuickChatsLoading && quickChatListIsEmpty ? (
              <p className="px-4 pt-2 text-sm text-foreground/30">No chats</p>
            ) : null}
          </div>
        </ScrollShadow>
      </div>

      <div className={`shrink-0 ${SIDEBAR_SECTION_INSET} pb-3`}>
        <Button
          className={`text-foreground/80 hover:bg-default/40 hover:text-foreground justify-start rounded-xl ${SIDEBAR_ITEM_INSET}`}
          fullWidth
          onPress={handleOpenSettings}
          size="sm"
          variant="ghost"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Settings01Icon}
            size={15}
            strokeWidth={1.5}
          />
          Settings
        </Button>
      </div>

      <SidebarCommandPalette
        actions={commandPaletteActions}
        isThreadsLoading={showSidebarLoading}
        isThreadsRefreshing={showSidebarRefreshing}
        onOpenChange={setIsCommandPaletteOpen}
        onSelectThread={handlePressThread}
        open={isCommandPaletteOpen}
        recentThreads={commandPaletteRecentThreads}
        selectedThreadId={selectedThreadId}
      />

      <Modal.Root state={threadSwitchState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className=" sm:max-w-[460px]">
              <Modal.Header className="items-start justify-between gap-4">
                <Modal.Heading className="text-base">
                  Move or stash changes
                </Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3 p-2">
                <p className="text-sm text-foreground">
                  Switching from{" "}
                  <span className="font-medium">
                    {pendingThreadSwitchSource?.title ?? "this thread"}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {pendingThreadSwitchTarget?.title ?? "the selected thread"}
                  </span>{" "}
                  needs a branch change from{" "}
                  <span className="font-medium">
                    {pendingThreadSwitch?.currentBranch ?? "the current branch"}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {pendingThreadSwitch?.targetBranch ?? "the target branch"}
                  </span>
                  .
                </p>
                <p className="text-xs text-muted">
                  The shared local checkout has uncommitted changes. Move them
                  to the target thread, or stash them on the current thread
                  before switching.
                </p>
                {threadSwitchError ? (
                  <p className="text-xs text-danger">{threadSwitchError}</p>
                ) : null}

                <div className="rounded-xl border border-border/60 bg-default/40 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Move changes to target thread
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Keep the current branch and working tree exactly as-is, and
                    reassign that work to the thread you are opening.
                  </p>
                  <Button
                    className="mt-3"
                    isPending={
                      handoffThreadSwitch.isPending &&
                      threadSwitchAction === "migrate"
                    }
                    onPress={() => handleConfirmThreadMigration()}
                    size="sm"
                    variant="secondary"
                  >
                    Move changes
                  </Button>
                </div>

                <Form
                  className="rounded-xl border border-border/60 bg-default/40 p-3"
                  onSubmit={handleConfirmThreadStash}
                >
                  <p className="text-sm font-medium text-foreground">
                    Stash on current thread
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Save the current work with a name, switch to the target
                    thread branch, and leave those changes behind.
                  </p>
                  <TextField.Root className="mt-3" isRequired>
                    <Label>Stash name</Label>
                    <Input.Root
                      autoFocus
                      onChange={(event) =>
                        setThreadSwitchStashName(event.currentTarget.value)
                      }
                      placeholder="main-handoff"
                      value={threadSwitchStashName}
                    />
                  </TextField.Root>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      onPress={() => threadSwitchState.close()}
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      isPending={
                        handoffThreadSwitch.isPending &&
                        threadSwitchAction === "stash"
                      }
                      type="submit"
                    >
                      Stash and switch
                    </Button>
                  </div>
                </Form>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={renameWorkspaceState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className=" sm:max-w-[400px]">
              <Form className="contents" onSubmit={handleRenameWorkspaceSubmit}>
                <Modal.Header className="items-start justify-between gap-4">
                  <Modal.Heading className="text-base">
                    Rename workspace
                  </Modal.Heading>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body className="p-2">
                  <TextField.Root
                    autoFocus
                    defaultValue={renameTargetWorkspace?.name ?? ""}
                    isRequired
                    key={renameTargetWorkspace?.id ?? "workspace-rename"}
                    name="name"
                  >
                    <Label>Workspace name</Label>
                    <Input.Root />
                  </TextField.Root>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    onPress={() => renameWorkspaceState.close()}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button isPending={updateWorkspace.isPending} type="submit">
                    Rename
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={renameThreadState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className=" sm:max-w-[400px]">
              <Form className="contents" onSubmit={handleRenameThreadSubmit}>
                <Modal.Header className="items-start justify-between gap-4">
                  <Modal.Heading className="text-base">
                    Rename thread
                  </Modal.Heading>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body className="p-2">
                  <TextField.Root
                    autoFocus
                    defaultValue={renameTargetThread?.title ?? ""}
                    isRequired
                    key={renameTargetThread?.id ?? "thread-rename"}
                    name="title"
                  >
                    <Label>Thread title</Label>
                    <Input.Root />
                  </TextField.Root>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    onPress={() => renameThreadState.close()}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button isPending={renameThread.isPending} type="submit">
                    Rename
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <AlertDialog.Backdrop
        isOpen={deleteWorkspaceState.isOpen}
        onOpenChange={deleteWorkspaceState.setOpen}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className=" sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete workspace</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Delete{" "}
                <span className="font-medium">
                  {deleteTargetWorkspace?.name ?? "this workspace"}
                </span>
                ?
              </p>
              <p className="text-muted mt-1 text-xs">
                This archives the workspace and also archives{" "}
                <span className="font-medium text-foreground">
                  {deleteTargetWorkspace?.threadCount ?? 0}{" "}
                  {(deleteTargetWorkspace?.threadCount ?? 0) === 1
                    ? "thread"
                    : "threads"}
                </span>{" "}
                inside it. This action removes them from active lists.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => deleteWorkspaceState.close()}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={archiveWorkspace.isPending}
                onPress={handleConfirmDeleteWorkspace}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <AlertDialog.Backdrop
        isOpen={archiveThreadState.isOpen}
        onOpenChange={archiveThreadState.setOpen}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className=" sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Archive thread</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Archive{" "}
                <span className="font-medium">
                  {archiveTargetTitle ?? "this thread"}
                </span>
                ?
              </p>
              <p className="mt-1 text-xs text-muted">
                The thread will be removed from your active list. You can
                restore it later from the archived threads view.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => archiveThreadState.close()}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={archiveThread.isPending}
                onPress={handleConfirmArchiveThread}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Archive
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
