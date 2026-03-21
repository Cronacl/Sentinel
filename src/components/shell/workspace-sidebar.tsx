"use client";

import {
  AlertDialog,
  Button,
  Dropdown,
  Form,
  Input,
  Label,
  Modal,
  ScrollShadow,
  Spinner,
  TextField,
  useOverlayState,
} from "@heroui/react";
import {
  AddCircleHalfDotIcon,
  AiIdeaIcon,
  Archive02Icon,
  ArrowDown01Icon,
  Clock01Icon,
  FilterMailIcon,
  Folder03Icon,
  FolderAddIcon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Settings01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNowStrict } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateWorkspaceModal } from "@/components/workspaces/create-workspace-modal";
import {
  applyOptimisticThreadPinUpdate,
  restoreOptimisticThreadPinUpdate,
} from "@/lib/threads/cache";
import { api, type RouterOutputs } from "@/trpc/react";

type OrganizeBy = "chronological" | "workspace";
type SortBy = "created" | "updated";

const PRIMARY_NAV = [
  { href: "/", icon: PencilEdit02Icon, label: "New thread" },
  { href: "/automations", icon: Clock01Icon, label: "Automations" },
  { href: "/skills", icon: AiIdeaIcon, label: "Skills" },
] as const;

function toCurrentWorkspace(
  workspace:
    | {
        createdAt: Date;
        description: string | null;
        id: string;
        isExpanded?: boolean;
        name: string;
        permissionModeOverride?: "default" | "full" | null;
        rootPath: string | null;
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
    name: workspace.name,
    permissionModeOverride: workspace.permissionModeOverride ?? null,
    rootPath: workspace.rootPath,
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

type ThreadStatusValue = "idle" | "streaming" | "awaiting_approval";

function ThreadStatusIndicator({ status }: { status: ThreadStatusValue }) {
  if (status === "streaming") {
    return <Spinner className="size-3 min-w-3" color="current" size="sm" />;
  }

  if (status === "awaiting_approval") {
    return (
      <span
        className="relative flex h-2.5 w-2.5 shrink-0"
        title="Awaiting approval"
      >
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }

  return null;
}

function WorkspaceSidebarLoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center px-4 py-6">
      <Spinner color="current" size="sm" />
    </div>
  );
}

type ThreadGroup = NonNullable<
  Extract<RouterOutputs["threads"]["list"], { groups: unknown[] }>["groups"]
>;
type ChronologicalThreadItem = NonNullable<
  Extract<RouterOutputs["threads"]["list"], { items: unknown[] }>["items"]
>;

function findThreadState(
  threadId: string,
  groups: ThreadGroup,
  items: ChronologicalThreadItem,
) {
  for (const group of groups) {
    const thread = group.threads.find((item) => item.id === threadId);
    if (thread) {
      return {
        pinnedAt: thread.pinnedAt,
        workspaceId: group.workspace.id,
      };
    }
  }

  const item = items.find((entry) => entry.id === threadId);
  if (!item) {
    return null;
  }

  return {
    pinnedAt: item.pinnedAt,
    workspaceId: item.workspace.id,
  };
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
      className={`thread-actions absolute inset-y-0 right-0 flex items-center gap-0.5 transition-opacity duration-150 ${
        alwaysVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      }`}
    >
      <button
        aria-label={isPinned ? "Unpin thread" : "Pin thread"}
        className="hover:bg-default flex h-6 w-6 items-center justify-center rounded-lg transition-colors"
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
        className="hover:bg-default flex h-6 w-6 items-center justify-center rounded-lg transition-colors"
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
  const hasTimestamp = !alwaysVisible && !isActive && updatedAt != null;

  return (
    <span
      className={`relative flex h-6 shrink-0 items-center justify-end ${
        hasTimestamp ? "w-10" : "w-8"
      }`}
    >
      {hasTimestamp ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-xs text-foreground/40 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
          {formatRelativeTime(updatedAt)}
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
  onArchive,
  onRename,
  workspaceName,
}: {
  onArchive: () => void;
  onRename: () => void;
  workspaceName: string;
}) {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
      <Dropdown>
        <Button
          aria-label={`Workspace actions for ${workspaceName}`}
          className="h-7 w-7 min-w-7"
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
            size={16}
            strokeWidth={1.5}
          />
        </Button>
        <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "rename") onRename();
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

function PinnedThreadsList({
  threads,
  selectedThreadId,
  onPressThread,
  onPin,
  onArchive,
}: {
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  selectedThreadId: string | null;
  threads: Array<{
    id: string;
    pinnedAt: Date | null;
    status: ThreadStatusValue;
    title: string;
    updatedAt: Date;
    workspace: { id: string; name: string };
  }>;
}) {
  if (threads.length === 0) return null;

  return (
    <div className="px-4 pt-2">
      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => {
          const isActive = selectedThreadId === thread.id;
          return (
            <div
              className={`group hover:bg-default/60 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm transition-colors ${
                isActive
                  ? "font-medium bg-default text-foreground"
                  : "text-foreground/60 hover:text-foreground"
              }`}
              key={thread.id}
              onClick={() => onPressThread(thread.workspace.id, thread.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPressThread(thread.workspace.id, thread.id);
                }
              }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {thread.status !== "idle" ? (
                  <ThreadStatusIndicator status={thread.status} />
                ) : (
                  <HugeiconsIcon
                    className="shrink-0 text-foreground/40"
                    color="currentColor"
                    icon={PinIcon}
                    size={12}
                    strokeWidth={1.5}
                  />
                )}
                <span
                  className="min-w-0 max-w-[9rem] truncate"
                  title={thread.title}
                >
                  {thread.title}
                </span>
              </span>
              <ThreadItemTrailing
                alwaysVisible
                isPinned
                onArchive={onArchive}
                onPin={onPin}
                threadId={thread.id}
                threadStatus={thread.status}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const THREADS_PER_PAGE = 6;
const SIDEBAR_COLLAPSE_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
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

function ThreadRow({
  isPinned,
  onArchive,
  onPin,
  onPressThread,
  selectedThreadId,
  thread,
  workspaceId,
}: {
  isPinned: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  selectedThreadId: string | null;
  thread: {
    id: string;
    pinnedAt: Date | null;
    status: ThreadStatusValue;
    title: string;
    updatedAt: Date;
  };
  workspaceId: string;
}) {
  const isActive = selectedThreadId === thread.id;

  return (
    <div
      className={`group hover:bg-default/60 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm transition-colors ${
        isActive
          ? "font-medium bg-default text-foreground"
          : "text-foreground/60 hover:text-foreground"
      }`}
      onClick={() => onPressThread(workspaceId, thread.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPressThread(workspaceId, thread.id);
        }
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {thread.status !== "idle" ? (
          <ThreadStatusIndicator status={thread.status} />
        ) : thread.pinnedAt != null ? (
          <HugeiconsIcon
            className="shrink-0 text-foreground/40"
            color="currentColor"
            icon={PinIcon}
            size={11}
            strokeWidth={1.5}
          />
        ) : null}
        <span className="min-w-0 truncate text-sm" title={thread.title}>
          {thread.title}
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
}

const WorkspaceThreadSection = memo(function WorkspaceThreadSection({
  group,
  isExpanded,
  onArchive,
  onArchiveWorkspace,
  onPin,
  onPressThread,
  onPressWorkspace,
  onRenameWorkspace,
  onToggleWorkspace,
  selectedThreadId,
}: {
  group: ThreadGroup[number];
  isExpanded: boolean;
  onArchive: (threadId: string) => void;
  onArchiveWorkspace: (workspaceId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onPressWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onToggleWorkspace: (workspaceId: string) => void;
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
    <section>
      <div className="group relative">
        <Button
          className="text-foreground/70 hover:bg-default/60 hover:text-foreground justify-start rounded-xl pr-10"
          fullWidth
          onPress={() => {
            onPressWorkspace(group.workspace.id);
            onToggleWorkspace(group.workspace.id);
          }}
          size="sm"
          variant="ghost"
        >
          <div className="flex w-full min-w-0 items-center gap-2">
            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              <HugeiconsIcon
                className="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
                color="currentColor"
                icon={Folder03Icon}
                size={18}
                strokeWidth={1.5}
              />
              <HugeiconsIcon
                className={`absolute transition-all duration-150 ${
                  isExpanded ? "rotate-0" : "-rotate-90"
                } opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`}
                color="currentColor"
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={1.8}
              />
            </span>
            <span className="truncate">{group.workspace.name}</span>
          </div>
        </Button>
        <WorkspaceItemActions
          onArchive={() => onArchiveWorkspace(group.workspace.id)}
          onRename={() => onRenameWorkspace(group.workspace.id)}
          workspaceName={group.workspace.name}
        />
      </div>

      <SidebarCollapsible isOpen={isExpanded}>
        <div className="mt-1 flex flex-col gap-0.5 pl-2">
          {visibleThreads.length > 0 ? (
            <>
              {visibleThreads.map((thread) => (
                <ThreadRow
                  isPinned={thread.pinnedAt != null}
                  key={thread.id}
                  onArchive={onArchive}
                  onPin={onPin}
                  onPressThread={onPressThread}
                  selectedThreadId={selectedThreadId}
                  thread={thread}
                  workspaceId={group.workspace.id}
                />
              ))}

              {overflowThreads.length > 0 ? (
                <>
                  <button
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs text-foreground/40 transition-colors hover:text-foreground/70"
                    onClick={() =>
                      setShowOverflowThreads((current) => !current)
                    }
                    type="button"
                  >
                    <HugeiconsIcon
                      className={`transition-transform duration-150 ${
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
    </section>
  );
});

const ThreadList = memo(function ThreadList({
  groups,
  onArchiveWorkspace,
  onPressThread,
  onPressWorkspace,
  onRenameWorkspace,
  selectedThreadId,
  expandedWorkspaceIds,
  onPin,
  onArchive,
  onToggleWorkspace,
}: {
  expandedWorkspaceIds: Set<string>;
  groups: ThreadGroup;
  onArchive: (threadId: string) => void;
  onArchiveWorkspace: (workspaceId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onPressWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  selectedThreadId: string | null;
  onToggleWorkspace: (workspaceId: string) => void;
}) {
  return (
    <ScrollShadow className="max-h-full px-3 py-1" orientation="vertical">
      <div className="flex flex-col gap-1">
        {groups.map((group) => (
          <WorkspaceThreadSection
            group={group}
            isExpanded={expandedWorkspaceIds.has(group.workspace.id)}
            key={group.workspace.id}
            onArchive={onArchive}
            onArchiveWorkspace={onArchiveWorkspace}
            onPin={onPin}
            onPressThread={onPressThread}
            onPressWorkspace={onPressWorkspace}
            onRenameWorkspace={onRenameWorkspace}
            onToggleWorkspace={onToggleWorkspace}
            selectedThreadId={selectedThreadId}
          />
        ))}
      </div>
    </ScrollShadow>
  );
});

const ChronologicalThreadList = memo(function ChronologicalThreadList({
  items,
  onPressThread,
  selectedThreadId,
  onPin,
  onArchive,
}: {
  items: ChronologicalThreadItem;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  selectedThreadId: string | null;
}) {
  const [showOverflowThreads, setShowOverflowThreads] = useState(false);
  const visibleItems = items.slice(0, THREADS_PER_PAGE);
  const overflowItems = items.slice(THREADS_PER_PAGE);

  return (
    <ScrollShadow className="max-h-full px-4 py-1" orientation="vertical">
      <div className="flex flex-col gap-1">
        {visibleItems.map((item) => (
          <ThreadRow
            isPinned={item.pinnedAt != null}
            key={item.id}
            onArchive={onArchive}
            onPin={onPin}
            onPressThread={onPressThread}
            selectedThreadId={selectedThreadId}
            thread={item}
            workspaceId={item.workspace.id}
          />
        ))}
        {overflowItems.length > 0 ? (
          <>
            <button
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-foreground/40 transition-colors hover:text-foreground/70"
              onClick={() => setShowOverflowThreads((current) => !current)}
              type="button"
            >
              <HugeiconsIcon
                className={`transition-transform duration-150 ${
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
    </ScrollShadow>
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
      className="hover:bg-default/60 flex w-full items-center cursor-pointer justify-between gap-3 rounded-xl px-2 py-2 text-left text-xs transition-colors"
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
  const pathname = usePathname();
  const router = useRouter();
  const utils = api.useUtils();
  const cachedPreferences = utils.workspaces.getPreferences.getData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(
    null,
  );
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(
    null,
  );
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>(
    () => cachedPreferences?.organizeBy ?? "workspace",
  );
  const [sortBy, setSortBy] = useState<SortBy>(
    () => cachedPreferences?.sortBy ?? "updated",
  );
  const preferencesRef = useRef<HTMLDivElement | null>(null);
  const pinActionLockRef = useRef(new Set<string>());
  const renameWorkspaceState = useOverlayState({
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setRenameWorkspaceId(null);
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

  const preferences = api.workspaces.getPreferences.useQuery();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const workspaces = api.workspaces.list.useQuery();

  const expandedWorkspaceIds = useMemo(
    () =>
      new Set(
        (workspaces.data ?? []).filter((w) => w.isExpanded).map((w) => w.id),
      ),
    [workspaces.data],
  );

  const selectedThreadId = useMemo(() => {
    const match = pathname.match(/\/thread\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
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

  const groups: ThreadGroup =
    threads.data && "groups" in threads.data ? (threads.data.groups ?? []) : [];
  const items: ChronologicalThreadItem =
    threads.data && "items" in threads.data ? (threads.data.items ?? []) : [];

  const pinnedThreads = useMemo(() => {
    const pinned: Array<{
      id: string;
      pinnedAt: Date | null;
      status: ThreadStatusValue;
      title: string;
      updatedAt: Date;
      workspace: { id: string; name: string };
    }> = [];

    if (organizeBy === "workspace") {
      for (const group of groups) {
        for (const thread of group.threads) {
          if (thread.pinnedAt) {
            pinned.push({
              ...thread,
              workspace: { id: group.workspace.id, name: group.workspace.name },
            });
          }
        }
      }
    } else {
      for (const item of items) {
        if (item.pinnedAt) {
          pinned.push({
            ...item,
            workspace: { id: item.workspace.id, name: item.workspace.name },
          });
        }
      }
    }

    return pinned.sort(
      (a, b) =>
        new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime(),
    );
  }, [groups, items, organizeBy]);

  const togglePin = api.threads.togglePin.useMutation({
    onMutate: async ({ pinned, threadId }) => {
      const currentThread =
        findThreadState(threadId, groups, items) ??
        (() => {
          const thread = utils.threads.get.getData({ threadId })?.thread;

          if (!thread) {
            return null;
          }

          return {
            pinnedAt: thread.pinnedAt,
            workspaceId: currentWorkspace.data?.id,
          };
        })();

      return applyOptimisticThreadPinUpdate({
        pinnedAt: pinned ? (currentThread?.pinnedAt ?? new Date()) : null,
        threadId,
        utils,
        workspaceId: currentThread?.workspaceId,
      });
    },
    onSuccess: (updatedThread, variables) => {
      const currentThread = findThreadState(variables.threadId, groups, items);

      applyOptimisticThreadPinUpdate({
        pinnedAt: updatedThread.pinnedAt,
        threadId: variables.threadId,
        utils,
        workspaceId: currentThread?.workspaceId ?? currentWorkspace.data?.id,
      });
    },
    onError: (_error, variables, context) => {
      restoreOptimisticThreadPinUpdate(utils, context, variables.threadId);
    },
    onSettled: (_data, _error, variables) => {
      pinActionLockRef.current.delete(variables.threadId);
      void utils.threads.list.invalidate();
      void utils.threads.get.invalidate({ threadId: variables.threadId });
    },
  });

  const archiveThread = api.threads.archive.useMutation({
    onSuccess: (_data, variables) => {
      void utils.threads.list.invalidate();
      if (variables.threadId === selectedThreadId) {
        router.push("/");
      }
    },
  });

  const handlePin = useCallback(
    (threadId: string) => {
      if (pinActionLockRef.current.has(threadId)) {
        return;
      }

      const currentThread =
        findThreadState(threadId, groups, items) ??
        (() => {
          const thread = utils.threads.get.getData({ threadId })?.thread;

          if (!thread) {
            return null;
          }

          return {
            pinnedAt: thread.pinnedAt,
            workspaceId: currentWorkspace.data?.id,
          };
        })();

      pinActionLockRef.current.add(threadId);
      void togglePin.mutate({
        pinned: currentThread?.pinnedAt == null,
        threadId,
      });
    },
    [currentWorkspace.data?.id, groups, items, togglePin, utils.threads.get],
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
    return null;
  }, [archiveThreadId, groups, items]);

  const handleConfirmArchiveThread = useCallback(() => {
    if (!archiveThreadId) return;
    void archiveThread.mutate({ threadId: archiveThreadId });
    archiveThreadState.close();
  }, [archiveThread, archiveThreadId, archiveThreadState]);

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
    },
  });

  const renameWorkspace = api.workspaces.update.useMutation({
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
      renameWorkspaceState.close();
    },
  });

  const archiveWorkspace = api.workspaces.archive.useMutation({
    onSuccess: ({ selectedWorkspaceId, workspaceId }) => {
      const selectedThreadState = selectedThreadId
        ? findThreadState(selectedThreadId, groups, items)
        : null;
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

      if (
        (selectedThreadState?.workspaceId === workspaceId ||
          selectedWorkspaceId == null) &&
        pathname !== "/"
      ) {
        router.push("/");
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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPreferencesOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPreferencesOpen]);

  const selectedWorkspaceId = currentWorkspace.data?.id ?? null;
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

  const handlePressWorkspace = useCallback(
    (workspaceId: string) => {
      if (selectedWorkspaceId !== workspaceId) {
        void selectWorkspace.mutate({ workspaceId });
      }
    },
    [selectWorkspace, selectedWorkspaceId],
  );

  const handleToggleWorkspace = useCallback(
    (workspaceId: string) => {
      void toggleExpanded.mutate({ workspaceId });
    },
    [toggleExpanded],
  );

  const handlePressThread = useCallback(
    (workspaceId: string, threadId: string) => {
      if (selectedWorkspaceId !== workspaceId) {
        void selectWorkspace.mutate({ workspaceId });
      }

      void utils.threads.get.prefetch({ threadId });
      router.push(`/thread/${threadId}`);
    },
    [router, selectWorkspace, selectedWorkspaceId, utils.threads.get],
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

      void renameWorkspace.mutate({
        description: renameTargetWorkspace.description ?? "",
        name,
        rootPath: renameTargetWorkspace.rootPath ?? undefined,
        workspaceId: renameTargetWorkspace.id,
      });
    },
    [renameTargetWorkspace, renameWorkspace],
  );

  const handleConfirmDeleteWorkspace = useCallback(() => {
    if (!deleteTargetWorkspace) {
      return;
    }

    void archiveWorkspace.mutate({ workspaceId: deleteTargetWorkspace.id });
  }, [archiveWorkspace, deleteTargetWorkspace]);

  const isEmpty =
    organizeBy === "workspace" ? groups.length === 0 : items.length === 0;
  const showSidebarLoading =
    (!threads.data && threads.isPending) ||
    (!preferences.data && preferences.isPending);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-1 pb-3">
        <nav className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Button
                className={`justify-start rounded-lg ${
                  isActive
                    ? "text-foreground"
                    : "text-foreground/60 hover:text-foreground"
                }`}
                fullWidth
                key={item.href}
                onPress={() => {
                  if (item.href === "/") {
                    window.dispatchEvent(new Event("sentinel:new-thread"));
                    if (pathname !== "/") {
                      router.push("/");
                    }
                  } else {
                    router.push(item.href);
                  }
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

      <div className="flex shrink-0 items-center gap-1 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground/45 px-2 text-xs font-medium">
            Threads
          </h2>
        </div>

        <Button
          isIconOnly
          onPress={() => setIsCreateOpen(true)}
          size="sm"
          className="h-6 w-6 min-w-6"
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
            className="h-6 w-6 min-w-6"
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
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-1 px-2 pt-1 pb-2">
                  <p className="text-[11px] font-medium text-muted">Organize</p>
                </div>
                <PreferenceMenuItem
                  icon={Folder03Icon}
                  isSelected={organizeBy === "workspace"}
                  label="By project"
                  onPress={() =>
                    void handlePreferencesChange({ organizeBy: "workspace" })
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
                  <p className="text-[11px] font-medium text-muted">Sort by</p>
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

      <div className="min-h-0 flex-1">
        <ScrollShadow
          className="sentinel-scroll-shell h-full"
          orientation="vertical"
        >
          <div className="sentinel-scroll-area h-full">
            {showSidebarLoading ? <WorkspaceSidebarLoadingState /> : null}

            {pinnedThreads.length > 0 ? (
              <PinnedThreadsList
                onArchive={handleArchiveThread}
                onPin={handlePin}
                onPressThread={handlePressThread}
                selectedThreadId={selectedThreadId}
                threads={pinnedThreads}
              />
            ) : null}

            {organizeBy === "workspace" && groups.length > 0 ? (
              <ThreadList
                expandedWorkspaceIds={expandedWorkspaceIds}
                groups={groups}
                onArchive={handleArchiveThread}
                onArchiveWorkspace={handleOpenDeleteWorkspace}
                onPin={handlePin}
                onPressThread={handlePressThread}
                onPressWorkspace={handlePressWorkspace}
                onRenameWorkspace={handleOpenRenameWorkspace}
                selectedThreadId={selectedThreadId}
                onToggleWorkspace={handleToggleWorkspace}
              />
            ) : null}

            {organizeBy === "chronological" && items.length > 0 ? (
              <ChronologicalThreadList
                items={items}
                onArchive={handleArchiveThread}
                onPin={handlePin}
                onPressThread={handlePressThread}
                selectedThreadId={selectedThreadId}
              />
            ) : null}

            {!threads.isLoading && !preferences.isLoading && isEmpty ? (
              <div className="px-6 py-4">
                <div className="border-separator bg-background rounded-2xl border p-4">
                  <p className="text-foreground text-sm font-medium">
                    {organizeBy === "workspace"
                      ? "No workspaces yet"
                      : "No threads found"}
                  </p>
                  <p className="text-foreground/45 mt-1 text-xs">
                    {organizeBy === "workspace"
                      ? "Create a workspace to start grouping threads by project root."
                      : "No threads match the current sidebar filters yet."}
                  </p>
                  {organizeBy === "workspace" ? (
                    <Button
                      className="mt-4"
                      onPress={() => setIsCreateOpen(true)}
                      size="sm"
                      variant="secondary"
                    >
                      Create Workspace
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </ScrollShadow>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <Button
          className="text-foreground/60 hover:text-foreground justify-start rounded-lg"
          fullWidth
          onPress={() => router.push("/settings")}
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

      <CreateWorkspaceModal
        isOpen={isCreateOpen}
        onCreate={(values) => createWorkspace.mutateAsync(values)}
        onOpenChange={setIsCreateOpen}
      />

      <Modal.Root state={renameWorkspaceState}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="border-separator w-full border sm:max-w-[400px]">
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
                  <Button isPending={renameWorkspace.isPending} type="submit">
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
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[420px]">
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
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[420px]">
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
