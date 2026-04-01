type SearchableThread = {
  archivedAt: Date | null;
  summary: string | null;
  title: string;
  updatedAt: Date;
  workspace: {
    id: string;
    name: string;
  };
};

function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function getThreadSearchRank(thread: SearchableThread, query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
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

  return 6;
}

export function escapeThreadSearchLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function sortThreadSearchResults<T extends SearchableThread>(
  threads: T[],
  query: string,
) {
  return threads
    .filter((thread) => thread.archivedAt == null)
    .sort((left, right) => {
      const leftRank = getThreadSearchRank(left, query);
      const rightRank = getThreadSearchRank(right, query);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });
}
