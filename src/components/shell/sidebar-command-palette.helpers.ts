export type SidebarCommandPaletteAction = {
  id: string;
  keywords?: string[];
  label: string;
  subtitle?: string;
};

export type SidebarCommandPaletteThread = {
  id: string;
  pinnedAt?: Date | null;
  status?: "idle" | "streaming" | "awaiting_approval";
  summary?: string | null;
  title: string;
  updatedAt: Date;
  workspace: {
    id: string;
    name: string;
  };
};

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function getActionMatchScore(
  action: SidebarCommandPaletteAction,
  normalizedQuery: string,
) {
  if (!normalizedQuery) {
    return 0;
  }

  const label = action.label.toLowerCase();
  const subtitle = action.subtitle?.toLowerCase() ?? "";
  const keywords =
    action.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];

  if (label.startsWith(normalizedQuery)) {
    return 0;
  }

  if (label.includes(normalizedQuery)) {
    return 1;
  }

  if (keywords.some((keyword) => keyword.includes(normalizedQuery))) {
    return 2;
  }

  if (subtitle.includes(normalizedQuery)) {
    return 3;
  }

  return null;
}

function getThreadMatchScore(
  thread: SidebarCommandPaletteThread,
  normalizedQuery: string,
) {
  if (!normalizedQuery) {
    return 0;
  }

  const title = thread.title.toLowerCase();
  const summary = thread.summary?.toLowerCase() ?? "";
  const workspaceName = thread.workspace.name.toLowerCase();
  const titleIndex = title.indexOf(normalizedQuery);
  const summaryIndex = summary.indexOf(normalizedQuery);
  const workspaceIndex = workspaceName.indexOf(normalizedQuery);

  if (titleIndex === 0) {
    return 0;
  }

  if (titleIndex > 0) {
    return 1;
  }

  if (summaryIndex === 0) {
    return 2;
  }

  if (summaryIndex > 0) {
    return 3;
  }

  if (workspaceIndex === 0) {
    return 4;
  }

  if (workspaceIndex > 0) {
    return 5;
  }

  return null;
}

export function getCommandPaletteShortcutLabel(
  platform: string | null | undefined,
) {
  return platform === "darwin" ? "⌘K" : "Ctrl K";
}

export function shouldToggleSidebarCommandPaletteShortcut(
  event: Pick<
    KeyboardEvent,
    | "altKey"
    | "ctrlKey"
    | "defaultPrevented"
    | "isComposing"
    | "key"
    | "metaKey"
    | "shiftKey"
  >,
) {
  if (event.defaultPrevented || event.isComposing) {
    return false;
  }

  if (event.altKey || event.shiftKey) {
    return false;
  }

  if (!event.metaKey && !event.ctrlKey) {
    return false;
  }

  return event.key.toLowerCase() === "k";
}

export function buildSidebarCommandPaletteState<
  TAction extends SidebarCommandPaletteAction,
  TThread extends SidebarCommandPaletteThread,
>(input: {
  actions: TAction[];
  maxRecentThreads?: number;
  query: string;
  recentThreads: TThread[];
  searchThreads: TThread[];
}) {
  const normalizedQuery = normalizeQuery(input.query);

  const actions = input.actions
    .map((action) => ({
      action,
      score: getActionMatchScore(action, normalizedQuery),
    }))
    .filter(
      (entry): entry is { action: TAction; score: number } =>
        entry.score != null,
    )
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.action.label.localeCompare(right.action.label);
    })
    .map((entry) => entry.action);

  const sourceThreads = normalizedQuery
    ? input.searchThreads
    : input.recentThreads.slice(0, input.maxRecentThreads ?? 8);

  const dedupedThreads = new Map<string, SidebarCommandPaletteThread>();
  for (const thread of sourceThreads) {
    if (!dedupedThreads.has(thread.id)) {
      dedupedThreads.set(thread.id, thread);
    }
  }

  const threads = [...dedupedThreads.values()]
    .map((thread) => ({
      score: getThreadMatchScore(thread, normalizedQuery),
      thread,
    }))
    .filter((entry): entry is { score: number; thread: TThread } =>
      normalizedQuery ? entry.score != null : true,
    )
    .sort((left, right) => {
      if ((left.score ?? 0) !== (right.score ?? 0)) {
        return (left.score ?? 0) - (right.score ?? 0);
      }

      return right.thread.updatedAt.getTime() - left.thread.updatedAt.getTime();
    })
    .map((entry) => entry.thread);

  return {
    actions,
    hasQuery: normalizedQuery.length > 0,
    threads,
    threadsHeading: normalizedQuery ? "Threads" : "Recent threads",
  };
}
