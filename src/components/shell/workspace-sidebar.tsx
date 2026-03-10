"use client";

import { Button, Spinner } from "@heroui/react";
import {
  AddCircleHalfDotIcon,
  AiIdeaIcon,
  Archive02Icon,
  ArrowDown01Icon,
  Clock01Icon,
  FilterMailIcon,
  Folder01Icon,
  FolderAddIcon,
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
        name: string;
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
    name: workspace.name,
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
}: {
  alwaysVisible?: boolean;
  isPinned: boolean;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  threadId: string;
  updatedAt?: Date;
}) {
  const hasTimestamp = !alwaysVisible && updatedAt != null;

  return (
    <span
      className={`relative flex h-6 shrink-0 items-center justify-end ${
        hasTimestamp ? "w-[3rem]" : "w-[2rem]"
      }`}
    >
      {hasTimestamp ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-xs text-muted transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
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
    title: string;
    updatedAt: Date;
    workspace: { id: string; name: string };
  }>;
}) {
  if (threads.length === 0) return null;

  return (
    <div className="px-3 pt-2">
      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => {
          const isActive = selectedThreadId === thread.id;
          return (
            <div
              className={`group hover:bg-default/60 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm transition-colors ${
                isActive
                  ? "font-medium bg-default text-foreground"
                  : "text-muted"
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
                <HugeiconsIcon
                  className="shrink-0 text-muted"
                  color="currentColor"
                  icon={PinIcon}
                  size={12}
                  strokeWidth={1.5}
                />
                <span className="min-w-0 truncate" title={thread.title}>
                  {thread.title}
                </span>
              </span>
              <ThreadItemTrailing
                alwaysVisible
                isPinned
                onArchive={onArchive}
                onPin={onPin}
                threadId={thread.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ThreadList = memo(function ThreadList({
  onPressThread,
  groups,
  selectedThreadId,
  selectedWorkspaceId,
  expandedWorkspaceIds,
  onPressWorkspace,
  onPin,
  onArchive,
}: {
  expandedWorkspaceIds: Set<string>;
  groups: ThreadGroup;
  onArchive: (threadId: string) => void;
  onPin: (threadId: string) => void;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onPressWorkspace: (workspaceId: string) => void;
  selectedThreadId: string | null;
  selectedWorkspaceId: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      {groups.map((group) => {
        const isExpanded = expandedWorkspaceIds.has(group.workspace.id);
        const isWorkspaceActive = selectedWorkspaceId === group.workspace.id;

        return (
          <section key={group.workspace.id}>
            <Button
              className={`justify-start rounded-xl ${
                isWorkspaceActive
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
              fullWidth
              onPress={() => onPressWorkspace(group.workspace.id)}
              size="sm"
              variant="ghost"
            >
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Folder01Icon}
                    size={18}
                    strokeWidth={1.5}
                  />
                  <span className="truncate">{group.workspace.name}</span>
                </span>
                <HugeiconsIcon
                  className={`shrink-0 transition-transform ${
                    isExpanded ? "rotate-0" : "-rotate-90"
                  }`}
                  color="currentColor"
                  icon={ArrowDown01Icon}
                  size={16}
                  strokeWidth={1.5}
                />
              </div>
            </Button>

            {isExpanded ? (
              <div className="mt-1 flex flex-col gap-0.5 pl-2">
                {group.threads.length > 0 ? (
                  group.threads.map((thread) => {
                    const isActive = selectedThreadId === thread.id;

                    return (
                      <div
                        className={`group hover:bg-default/60 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm transition-colors ${
                          isActive
                            ? "font-medium bg-default text-foreground"
                            : "text-muted"
                        }`}
                        key={thread.id}
                        onClick={() =>
                          onPressThread(group.workspace.id, thread.id)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onPressThread(group.workspace.id, thread.id);
                          }
                        }}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                          {thread.pinnedAt != null && (
                            <HugeiconsIcon
                              className="shrink-0 text-muted"
                              color="currentColor"
                              icon={PinIcon}
                              size={11}
                              strokeWidth={1.5}
                            />
                          )}
                          <span
                            className="min-w-0 truncate text-sm"
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
                          updatedAt={thread.updatedAt}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-muted px-3 py-2 text-xs">
                    No threads yet.
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
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
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {items.map((item) => {
        const isActive = selectedThreadId === item.id;

        return (
          <div
            className={`group hover:bg-default/60 min-w-0 cursor-pointer rounded-xl px-2 py-1 text-sm transition-colors ${
              isActive ? "font-medium bg-default text-foreground" : "text-muted"
            }`}
            key={item.id}
            onClick={() => onPressThread(item.workspace.id, item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPressThread(item.workspace.id, item.id);
              }
            }}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {item.pinnedAt != null && (
                  <HugeiconsIcon
                    className="shrink-0 text-muted"
                    color="currentColor"
                    icon={PinIcon}
                    size={11}
                    strokeWidth={1.5}
                  />
                )}
                <span className="min-w-0 truncate" title={item.title}>
                  {item.title}
                </span>
              </span>
              <ThreadItemTrailing
                isPinned={item.pinnedAt != null}
                onArchive={onArchive}
                onPin={onPin}
                threadId={item.id}
                updatedAt={item.updatedAt}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

function PreferenceMenuItem({
  icon,
  isSelected,
  label,
  onPress,
}: {
  icon: typeof Folder01Icon;
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>("workspace");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(
    new Set(),
  );
  const preferencesRef = useRef<HTMLDivElement | null>(null);
  const pinActionLockRef = useRef(new Set<string>());

  const preferences = api.workspaces.getPreferences.useQuery();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const selectedThreadId = useMemo(() => {
    const match = pathname.match(/\/thread\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const threads = api.threads.list.useQuery({
    organizeBy,
    sortBy,
  });

  const groups: ThreadGroup =
    threads.data && "groups" in threads.data ? (threads.data.groups ?? []) : [];
  const items: ChronologicalThreadItem =
    threads.data && "items" in threads.data ? (threads.data.items ?? []) : [];

  const pinnedThreads = useMemo(() => {
    const pinned: Array<{
      id: string;
      pinnedAt: Date | null;
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
      void archiveThread.mutate({ threadId });
    },
    [archiveThread],
  );

  const createWorkspace = api.workspaces.create.useMutation({
    onSuccess: (workspace) => {
      utils.workspaces.getCurrent.setData(undefined, {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isArchived: workspace.isArchived,
        name: workspace.name,
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
            isSelected: true,
            latestThreadUpdatedAt: null,
            name: workspace.name,
            rootPath: workspace.rootPath,
            threadCount: 0,
            updatedAt: workspace.updatedAt,
          },
          ...withoutWorkspace.map((item) => ({ ...item, isSelected: false })),
        ];
      });
      void utils.threads.list.invalidate();
      setExpandedWorkspaceIds((current) => new Set(current).add(workspace.id));
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

    setOrganizeBy(preferences.data.organizeBy);
    setSortBy(preferences.data.sortBy);
  }, [preferences.data]);

  useEffect(() => {
    if (organizeBy !== "workspace" || groups.length === 0) {
      return;
    }

    setExpandedWorkspaceIds((current) => {
      if (current.size > 0) {
        return current;
      }
      return new Set(groups.map((g) => g.workspace.id));
    });
  }, [groups, organizeBy]);

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

  const handlePreferencesChange = useCallback(
    (
      nextValues: Partial<{
        organizeBy: OrganizeBy;
        sortBy: SortBy;
      }>,
    ) => {
      const nextOrganizeBy = nextValues.organizeBy ?? organizeBy;
      const nextSortBy = nextValues.sortBy ?? sortBy;

      setOrganizeBy(nextOrganizeBy);
      setSortBy(nextSortBy);

      void updatePreferences.mutate({
        organizeBy: nextOrganizeBy,
        sortBy: nextSortBy,
      });
    },
    [organizeBy, sortBy, updatePreferences],
  );

  const handleToggleWorkspace = useCallback((workspaceId: string) => {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  }, []);

  const handlePressWorkspace = useCallback(
    (workspaceId: string) => {
      if (selectedWorkspaceId !== workspaceId) {
        void selectWorkspace.mutate({ workspaceId });
      }
      handleToggleWorkspace(workspaceId);
    },
    [handleToggleWorkspace, selectWorkspace, selectedWorkspaceId],
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
                    : "text-muted hover:text-foreground"
                }`}
                fullWidth
                key={item.href}
                onPress={() => {
                  if (item.href === "/") {
                    if (pathname === "/") {
                      window.dispatchEvent(new Event("sentinel:new-thread"));
                    } else {
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
          <h2 className="text-muted/80 px-2 text-xs font-medium">Threads</h2>
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
                className="absolute top-9 right-0 z-30 w-40 overflow-hidden rounded-2xl border border-border bg-overlay p-1.5 text-foreground shadow-overlay backdrop-blur-xl"
                exit={{ opacity: 0, scale: 0.97, y: -10 }}
                initial={{ opacity: 0, scale: 0.97, y: -10 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-1 px-2 pt-1 pb-2">
                  <p className="text-[11px] font-medium text-muted">Organize</p>
                </div>
                <PreferenceMenuItem
                  icon={Folder01Icon}
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
        <div className="sentinel-scroll-shell h-full">
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
                onPin={handlePin}
                onPressThread={handlePressThread}
                onPressWorkspace={handlePressWorkspace}
                selectedThreadId={selectedThreadId}
                selectedWorkspaceId={selectedWorkspaceId}
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
                  <p className="text-muted mt-1 text-xs leading-5">
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
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <Button
          className="text-muted hover:text-foreground justify-start rounded-lg"
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
    </div>
  );
}
