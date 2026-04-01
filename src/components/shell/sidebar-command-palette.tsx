"use client";

import { Kbd, Spinner, cn } from "@heroui/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Command } from "cmdk";
import { formatDistanceToNowStrict } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  useShortcutAction,
  useShortcutScope,
  useShortcuts,
} from "@/lib/shortcuts/provider";
import type { ShortcutActionId } from "@/lib/shortcuts/schema";
import { api } from "@/trpc/react";

import {
  buildSidebarCommandPaletteState,
  type SidebarCommandPaletteAction,
  type SidebarCommandPaletteThread,
} from "./sidebar-command-palette.helpers";
import { ThreadPullRequestMeta } from "./thread-pull-request";

type SidebarCommandPaletteActionItem = SidebarCommandPaletteAction & {
  icon: IconSvgElement;
  onSelect: () => void;
  shortcut?: string;
  shortcutActionId?: ShortcutActionId;
};

type SidebarCommandPaletteProps = {
  actions: SidebarCommandPaletteActionItem[];
  onOpenChange: (open: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  open: boolean;
  recentThreads: SidebarCommandPaletteThread[];
  selectedThreadId: string | null;
};

const SHORT_LABELS: Record<string, string> = {
  day: "d",
  days: "d",
  hour: "h",
  hours: "h",
  minute: "m",
  minutes: "m",
  month: "mo",
  months: "mo",
  second: "s",
  seconds: "s",
  year: "y",
  years: "y",
};

function formatRelativeTime(value: Date) {
  const diffMs = Math.abs(Date.now() - value.getTime());
  if (diffMs < 30_000) {
    return "now";
  }

  const result = formatDistanceToNowStrict(value);
  return result.replace(
    /(\d+)\s+(\w+)/,
    (_, amount, unit) => `${amount}${SHORT_LABELS[unit] ?? unit}`,
  );
}

function ShortcutPill({ children }: { children: React.ReactNode }) {
  return (
    <Kbd className="h-5 min-w-5 rounded-md border border-border/40 bg-default/70 px-1.5 text-[10px] font-medium text-foreground/52 shadow-none">
      {children}
    </Kbd>
  );
}

function splitShortcutLabel(label: string | null | undefined) {
  if (!label) {
    return [];
  }

  if (!label.includes(" ")) {
    return [...label];
  }

  return label.split(" ").filter(Boolean);
}

function ShortcutKeys({ label }: { label: string | null | undefined }) {
  const keys = splitShortcutLabel(label);

  if (keys.length === 0) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <ShortcutPill key={`${key}-${index}`}>{key}</ShortcutPill>
      ))}
    </span>
  );
}

function LoadingThreadRows() {
  return (
    <Command.Group
      className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:pt-1 [&>[cmdk-group-heading]]:pb-0.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-medium [&>[cmdk-group-heading]]:text-muted"
      heading="Threads"
    >
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-[7px]"
            key={index}
          >
            <Spinner
              className="size-3.5 min-w-3.5 text-foreground/45"
              color="current"
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block h-3.5 w-[60%] rounded-full bg-default/80" />
              <span className="mt-1 block h-2.5 w-[34%] rounded-full bg-default/55" />
            </span>
          </div>
        ))}
      </div>
    </Command.Group>
  );
}

const PALETTE_ITEM_SELECTED_CLASS =
  "bg-default/58 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";
const PALETTE_ITEM_HOVER_CLASS = "hover:bg-default/70";
const PALETTE_ITEM_SELECTED_DATA_CLASS =
  "data-[selected=true]:bg-default/58 data-[selected=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

export function SidebarCommandPalette({
  actions,
  onOpenChange,
  onSelectThread,
  open,
  recentThreads,
  selectedThreadId,
}: SidebarCommandPaletteProps) {
  const paletteScope = useShortcutScope({
    active: open,
    kind: "commandPalette",
  });
  const { getShortcutLabel } = useShortcuts();
  const shortcutLabel = getShortcutLabel("commandPalette.toggle");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const searchQuery = api.threads.search.useQuery(
    { query: deferredQuery },
    {
      enabled: open && deferredQuery.length > 0,
      staleTime: 15_000,
    },
  );

  const paletteState = useMemo(
    () =>
      buildSidebarCommandPaletteState({
        actions,
        query,
        recentThreads,
        searchThreads: searchQuery.data ?? [],
      }),
    [actions, query, recentThreads, searchQuery.data],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);
  useShortcutAction(
    "overlay.close",
    () => {
      onOpenChange(false);
    },
    {
      enabled: open,
      scopeId: paletteScope.id,
    },
  );

  const isSearching = paletteState.hasQuery && searchQuery.isFetching;
  const isLoadingRemoteThreads =
    isSearching && (searchQuery.data?.length ?? 0) === 0;
  const isEmpty =
    !isLoadingRemoteThreads &&
    paletteState.actions.length === 0 &&
    paletteState.threads.length === 0;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close command palette"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/20"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            type="button"
          />

          <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-4 pt-[min(9vh,4rem)]">
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="pointer-events-auto w-full max-w-[30rem]"
              exit={{ opacity: 0, scale: 0.985, y: -8 }}
              initial={{ opacity: 0, scale: 0.985, y: -10 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-overlay shadow-xl">
                <Command className="w-full" loop shouldFilter={false}>
                  <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
                    <span className="shrink-0 text-muted">
                      {isSearching ? (
                        <Spinner
                          className="size-[15px]"
                          color="current"
                          size="sm"
                        />
                      ) : (
                        <HugeiconsIcon
                          color="currentColor"
                          icon={Search01Icon}
                          size={15}
                          strokeWidth={1.6}
                        />
                      )}
                    </span>

                    <Command.Input
                      autoFocus
                      className="h-6 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                      onValueChange={setQuery}
                      placeholder="Search threads and actions…"
                      value={query}
                    />

                    <ShortcutKeys label={shortcutLabel} />
                  </div>

                  <Command.List className="max-h-[min(52vh,24rem)] overflow-y-auto px-1 py-1">
                    {paletteState.actions.length > 0 ? (
                      <Command.Group
                        className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:pt-1 [&>[cmdk-group-heading]]:pb-0.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-medium [&>[cmdk-group-heading]]:text-muted"
                        heading="Suggested"
                      >
                        <div className="flex flex-col gap-0.5">
                          {paletteState.actions.map((action) => (
                            <Command.Item
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-[1rem] px-2 py-[5px] text-foreground outline-none transition-colors",
                                PALETTE_ITEM_HOVER_CLASS,
                                PALETTE_ITEM_SELECTED_DATA_CLASS,
                              )}
                              key={action.id}
                              keywords={action.keywords}
                              onSelect={() => {
                                onOpenChange(false);
                                action.onSelect();
                              }}
                              value={action.label}
                            >
                              <span className="shrink-0 text-foreground/50">
                                <HugeiconsIcon
                                  color="currentColor"
                                  icon={action.icon}
                                  size={16}
                                  strokeWidth={1.5}
                                />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-foreground/88">
                                {action.label}
                              </span>
                              {action.shortcutActionId || action.shortcut ? (
                                <ShortcutKeys
                                  label={
                                    action.shortcutActionId
                                      ? getShortcutLabel(
                                          action.shortcutActionId,
                                        )
                                      : action.shortcut
                                  }
                                />
                              ) : null}
                            </Command.Item>
                          ))}
                        </div>
                      </Command.Group>
                    ) : null}

                    {paletteState.threads.length > 0 ? (
                      <Command.Group
                        className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:pt-1 [&>[cmdk-group-heading]]:pb-0.5 [&>[cmdk-group-heading]]:text-[11px] [&>[cmdk-group-heading]]:font-medium [&>[cmdk-group-heading]]:text-muted"
                        heading={paletteState.threadsHeading}
                      >
                        <div className="flex flex-col gap-0.5">
                          {paletteState.threads.map((thread) => {
                            const isActiveThread =
                              selectedThreadId === thread.id;

                            return (
                              <Command.Item
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-[1rem] px-2 py-[5px] text-foreground outline-none transition-colors",
                                  PALETTE_ITEM_HOVER_CLASS,
                                  isActiveThread
                                    ? PALETTE_ITEM_SELECTED_CLASS
                                    : PALETTE_ITEM_SELECTED_DATA_CLASS,
                                )}
                                key={thread.id}
                                keywords={[
                                  thread.summary ?? "",
                                  thread.workspace.name,
                                ]}
                                onSelect={() => {
                                  onOpenChange(false);
                                  onSelectThread(
                                    thread.workspace.id,
                                    thread.id,
                                  );
                                }}
                                value={`${thread.title} ${thread.workspace.name} ${thread.summary ?? ""}`}
                              >
                                <span
                                  className={cn(
                                    "shrink-0 pt-0.5 text-foreground/40 transition-colors",
                                    isActiveThread && "text-foreground/65",
                                  )}
                                >
                                  {thread.status && thread.status !== "idle" ? (
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="absolute inset-0 rounded-full bg-current/24" />
                                      <span className="relative h-2.5 w-2.5 rounded-full bg-current" />
                                    </span>
                                  ) : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      "block truncate text-sm text-foreground/88",
                                      isActiveThread && "text-foreground",
                                    )}
                                  >
                                    {thread.title}
                                  </span>
                                  {thread.linkedPullRequest ? (
                                    <span className="mt-0.5 block">
                                      <ThreadPullRequestMeta
                                        pullRequest={thread.linkedPullRequest}
                                      />
                                    </span>
                                  ) : null}
                                  <span
                                    className={cn(
                                      "mt-0.5 flex items-center gap-1.5 text-[11px] text-muted",
                                      isActiveThread && "text-foreground/55",
                                    )}
                                  >
                                    <span className="truncate">
                                      {thread.workspace.name}
                                    </span>
                                    <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-current" />
                                    <span className="shrink-0">
                                      {formatRelativeTime(thread.updatedAt)}
                                    </span>
                                    {isActiveThread ? (
                                      <>
                                        <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-current" />
                                        <span className="shrink-0">
                                          Current
                                        </span>
                                      </>
                                    ) : null}
                                  </span>
                                </span>
                              </Command.Item>
                            );
                          })}
                        </div>
                      </Command.Group>
                    ) : null}

                    {isLoadingRemoteThreads ? <LoadingThreadRows /> : null}

                    {isEmpty ? (
                      <div className="px-2 py-3 text-center text-xs text-muted">
                        No results found
                      </div>
                    ) : null}
                  </Command.List>
                </Command>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
