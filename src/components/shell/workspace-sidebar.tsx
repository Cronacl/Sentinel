"use client";

import { Button, ScrollShadow, Spinner } from "@heroui/react";
import {
  Add01Icon,
  AddCircleHalfDotIcon,
  AiIdeaIcon,
  ArrowDown01Icon,
  ArrowUpDownIcon,
  Clock01Icon,
  FilterMailIcon,
  Folder01Icon,
  FolderAddIcon,
  PencilEdit02Icon,
  Settings01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CreateWorkspaceModal } from "@/components/workspaces/create-workspace-modal";
import { api, type RouterOutputs } from "@/trpc/react";

type OrganizeBy = "chronological" | "workspace";
type SortBy = "created" | "updated";

const PRIMARY_NAV = [
  { href: "/", icon: PencilEdit02Icon, label: "New thread" },
  { href: "/automations", icon: Clock01Icon, label: "Automations" },
  { href: "/skills", icon: AiIdeaIcon, label: "Skills" },
] as const;

function formatRelativeTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const units = [
    { divisor: 60 * 24 * 30, unit: "month" },
    { divisor: 60 * 24 * 7, unit: "week" },
    { divisor: 60 * 24, unit: "day" },
    { divisor: 60, unit: "hour" },
    { divisor: 1, unit: "minute" },
  ] as const;

  for (const { divisor, unit } of units) {
    const value = Math.round(diffMinutes / divisor);
    if (Math.abs(value) >= 1) {
      return formatter.format(value, unit);
    }
  }

  return "now";
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

function ThreadList({
  onPressThread,
  groups,
  selectedThreadId,
  selectedWorkspaceId,
  expandedWorkspaceIds,
  onPressWorkspace,
}: {
  expandedWorkspaceIds: Set<string>;
  groups: ThreadGroup;
  onPressThread: (workspaceId: string, threadId: string) => void;
  onPressWorkspace: (workspaceId: string) => void;
  selectedThreadId: string | null;
  selectedWorkspaceId: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {groups.map((group) => {
        const isExpanded = expandedWorkspaceIds.has(group.workspace.id);
        const isWorkspaceActive = selectedWorkspaceId === group.workspace.id;

        return (
          <section key={group.workspace.id}>
            <Button
              className={`justify-start rounded-lg ${
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
              <div className="mt-1 flex flex-col gap-0.5 pl-7">
                {group.threads.length > 0 ? (
                  group.threads.map((thread) => {
                    const isActive = selectedThreadId === thread.id;

                    return (
                      <button
                        className={`group hover:bg-default/60 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                          isActive ? "bg-default text-foreground" : "text-muted"
                        }`}
                        key={thread.id}
                        onClick={() =>
                          onPressThread(group.workspace.id, thread.id)
                        }
                        type="button"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {thread.title}
                        </span>
                        <span className="text-muted shrink-0 text-xs">
                          {formatRelativeTime(thread.updatedAt)}
                        </span>
                      </button>
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
}

function ChronologicalThreadList({
  items,
  onPressThread,
  selectedThreadId,
}: {
  items: ChronologicalThreadItem;
  onPressThread: (workspaceId: string, threadId: string) => void;
  selectedThreadId: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {items.map((item) => {
        const isActive = selectedThreadId === item.id;

        return (
          <button
            className={`group hover:bg-default/60 rounded-xl px-3 py-2 text-sm transition-colors ${
              isActive ? "bg-default text-foreground" : "text-muted"
            }`}
            key={item.id}
            onClick={() => onPressThread(item.workspace.id, item.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{item.title}</span>
              <span className="text-muted shrink-0 text-xs">
                {formatRelativeTime(item.updatedAt)}
              </span>
            </div>
            <p className="text-muted mt-1 truncate text-[11px]">
              {item.workspace.name}
            </p>
          </button>
        );
      })}
    </div>
  );
}

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

  const createWorkspace = api.workspaces.create.useMutation({
    onSuccess: async (workspace) => {
      await Promise.all([
        utils.workspaces.getCurrent.invalidate(),
        utils.workspaces.list.invalidate(),
        utils.threads.list.invalidate(),
      ]);
      await selectWorkspace.mutateAsync({ workspaceId: workspace.id });
      setExpandedWorkspaceIds((current) => new Set(current).add(workspace.id));
    },
  });

  const selectWorkspace = api.workspaces.select.useMutation();
  const updatePreferences = api.workspaces.updatePreferences.useMutation();

  useEffect(() => {
    if (!preferences.data) {
      return;
    }

    setOrganizeBy(preferences.data.organizeBy);
    setSortBy(preferences.data.sortBy);
  }, [preferences.data]);

  useEffect(() => {
    const selectedWorkspaceId = currentWorkspace.data?.id ?? null;

    if (organizeBy !== "workspace" || groups.length === 0) {
      return;
    }

    setExpandedWorkspaceIds((current) => {
      if (current.size > 0) {
        return current;
      }

      const next = new Set<string>();
      for (const group of groups) {
        if (
          group.workspace.id === selectedWorkspaceId ||
          group.threads.length > 0
        ) {
          next.add(group.workspace.id);
        }
      }

      if (next.size === 0 && groups[0]) {
        next.add(groups[0].workspace.id);
      }

      return next;
    });
  }, [currentWorkspace.data?.id, groups, organizeBy]);

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

  const handlePreferencesChange = async (
    nextValues: Partial<{
      organizeBy: OrganizeBy;
      sortBy: SortBy;
    }>,
  ) => {
    const nextOrganizeBy = nextValues.organizeBy ?? organizeBy;
    const nextSortBy = nextValues.sortBy ?? sortBy;

    setOrganizeBy(nextOrganizeBy);
    setSortBy(nextSortBy);

    void updatePreferences.mutateAsync({
      organizeBy: nextOrganizeBy,
      sortBy: nextSortBy,
    });
  };

  const handleToggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const handlePressWorkspace = async (workspaceId: string) => {
    if (selectedWorkspaceId !== workspaceId) {
      void selectWorkspace.mutateAsync({ workspaceId });
    }
    handleToggleWorkspace(workspaceId);
  };

  const handlePressThread = async (workspaceId: string, threadId: string) => {
    if (selectedWorkspaceId !== workspaceId) {
      await selectWorkspace.mutateAsync({ workspaceId });
    }

    router.push(`/thread/${threadId}`);
  };

  const isEmpty =
    organizeBy === "workspace" ? groups.length === 0 : items.length === 0;

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
                    router.push(`/thread/${crypto.randomUUID()}`);
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
        <ScrollShadow className="h-full">
          {threads.isLoading || preferences.isLoading ? (
            <WorkspaceSidebarLoadingState />
          ) : null}

          {organizeBy === "workspace" && groups.length > 0 ? (
            <ThreadList
              expandedWorkspaceIds={expandedWorkspaceIds}
              groups={groups}
              onPressThread={(workspaceId, threadId) =>
                void handlePressThread(workspaceId, threadId)
              }
              onPressWorkspace={(workspaceId) =>
                void handlePressWorkspace(workspaceId)
              }
              selectedThreadId={selectedThreadId}
              selectedWorkspaceId={selectedWorkspaceId}
            />
          ) : null}

          {organizeBy === "chronological" && items.length > 0 ? (
            <ChronologicalThreadList
              items={items}
              onPressThread={(workspaceId, threadId) =>
                void handlePressThread(workspaceId, threadId)
              }
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
        </ScrollShadow>
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
