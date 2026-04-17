import type { ThreadListInput } from "@/schemas/workspace-thread.schema";
import { api, type RouterOutputs } from "@/trpc/react";
import type { ChatEngine } from "@/server/db/enums";

type TrpcUtils = ReturnType<typeof api.useUtils>;
type ThreadGetData = RouterOutputs["threads"]["get"];
type ThreadListData = RouterOutputs["threads"]["list"];
type QuickChatListData = RouterOutputs["threads"]["listQuickChats"];
type ThreadGetThread = ThreadGetData["thread"];
type ThreadGetWorkspace = ThreadGetData["workspace"];
type ThreadSettingsPatch = {
  chatEngine?: ChatEngine;
  chatModelId?: string | null;
  chatReasoningEffort?: string | null;
  mode?: "chat" | "plan";
};

type ThreadPinCacheSnapshot = {
  lists: Array<{
    data: ThreadListData | undefined;
    input: ThreadListInput;
  }>;
  thread: ThreadGetData | undefined;
};

const BASE_THREAD_LIST_INPUTS: ThreadListInput[] = [
  undefined,
  { organizeBy: "workspace", sortBy: "updated" },
  { organizeBy: "workspace", sortBy: "created" },
  { organizeBy: "chronological", sortBy: "updated" },
  { organizeBy: "chronological", sortBy: "created" },
];

function dedupeThreadListInputs(inputs: ThreadListInput[]) {
  const seen = new Set<string>();

  return inputs.filter((input) => {
    const key = JSON.stringify(input ?? null);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getThreadListInputs(workspaceId?: string) {
  if (!workspaceId) {
    return BASE_THREAD_LIST_INPUTS;
  }

  return dedupeThreadListInputs([
    ...BASE_THREAD_LIST_INPUTS,
    { workspaceId },
    ...BASE_THREAD_LIST_INPUTS.filter(
      (input): input is Exclude<ThreadListInput, undefined> => !!input,
    ).map((input) => ({ ...input, workspaceId })),
  ]);
}

function updateThreadPinInListData<T extends ThreadListData | undefined>(
  data: T,
  threadId: string,
  pinnedAt: Date | null,
): T {
  if (!data) {
    return data;
  }

  if ("groups" in data) {
    return {
      ...data,
      groups: (data.groups ?? []).map((group) => ({
        ...group,
        threads: group.threads.map((thread) =>
          thread.id === threadId ? { ...thread, pinnedAt } : thread,
        ),
      })),
    } as T;
  }

  return {
    ...data,
    items: (data.items ?? []).map((item) =>
      item.id === threadId ? { ...item, pinnedAt } : item,
    ),
  } as T;
}

function updateThreadPinInQuickChatListData(
  data: QuickChatListData | undefined,
  threadId: string,
  pinnedAt: Date | null,
) {
  return data?.map((item) =>
    item.id === threadId ? { ...item, pinnedAt } : item,
  );
}

function applyThreadSettingsPatch<
  T extends {
    chatModelId: string | null;
    chatReasoningEffort: string | null;
    mode: "chat" | "plan";
  },
>(thread: T, patch: ThreadSettingsPatch) {
  return {
    ...thread,
    ...(patch.chatEngine === undefined ? {} : { chatEngine: patch.chatEngine }),
    ...(patch.chatModelId === undefined
      ? {}
      : { chatModelId: patch.chatModelId }),
    ...(patch.chatReasoningEffort === undefined
      ? {}
      : { chatReasoningEffort: patch.chatReasoningEffort }),
    ...(patch.mode === undefined ? {} : { mode: patch.mode }),
  };
}

function updateThreadSettingsInListData<T extends ThreadListData | undefined>(
  data: T,
  threadId: string,
  patch: ThreadSettingsPatch,
): T {
  if (!data) {
    return data;
  }

  if ("groups" in data) {
    return {
      ...data,
      groups: (data.groups ?? []).map((group) => ({
        ...group,
        threads: group.threads.map((thread) =>
          thread.id === threadId
            ? applyThreadSettingsPatch(thread, patch)
            : thread,
        ),
      })),
    } as T;
  }

  return {
    ...data,
    items: (data.items ?? []).map((item) =>
      item.id === threadId ? applyThreadSettingsPatch(item, patch) : item,
    ),
  } as T;
}

function updateThreadTitleInListData<T extends ThreadListData | undefined>(
  data: T,
  threadId: string,
  title: string,
): T {
  if (!data) {
    return data;
  }

  if ("groups" in data) {
    return {
      ...data,
      groups: (data.groups ?? []).map((group) => ({
        ...group,
        threads: group.threads.map((thread) =>
          thread.id === threadId ? { ...thread, title } : thread,
        ),
      })),
    } as T;
  }

  return {
    ...data,
    items: (data.items ?? []).map((item) =>
      item.id === threadId ? { ...item, title } : item,
    ),
  } as T;
}

function upsertThreadInQuickChatListData(
  data: QuickChatListData | undefined,
  thread: ThreadGetThread,
  workspace?: ThreadGetWorkspace,
) {
  if (!data || workspace?.kind !== "quick_chat") {
    return data;
  }

  const existingIndex = data.findIndex((item) => item.id === thread.id);
  const nextItem: QuickChatListData[number] = {
    ...(buildThreadListItem(thread) as Omit<
      QuickChatListData[number],
      "workspace"
    >),
    workspace: {
      createdAt: workspace.createdAt,
      description: workspace.description,
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      permissionModeOverride: workspace.permissionModeOverride,
      rootPath: workspace.rootPath,
      updatedAt: workspace.updatedAt,
    },
  };

  if (existingIndex === -1) {
    return [nextItem, ...data];
  }

  return data.map((item) => (item.id === thread.id ? nextItem : item));
}

function updateThreadStatusInQuickChatListData(
  data: QuickChatListData | undefined,
  threadId: string,
  status: ThreadStatusValue,
) {
  return data?.map((item) =>
    item.id === threadId ? { ...item, status } : item,
  );
}

function updateThreadSettingsInQuickChatListData(
  data: QuickChatListData | undefined,
  threadId: string,
  patch: ThreadSettingsPatch,
) {
  return data?.map((item) =>
    item.id === threadId ? applyThreadSettingsPatch(item, patch) : item,
  );
}

function updateThreadTitleInQuickChatListData(
  data: QuickChatListData | undefined,
  threadId: string,
  title: string,
) {
  return data?.map((item) =>
    item.id === threadId ? { ...item, title } : item,
  );
}

export function applyOptimisticThreadPinUpdate({
  pinnedAt,
  threadId,
  utils,
  workspaceId,
  workspaceKind,
}: {
  pinnedAt: Date | null;
  threadId: string;
  utils: TrpcUtils;
  workspaceKind?: ThreadGetWorkspace["kind"];
  workspaceId?: string;
}) {
  const threadInput = { threadId };
  const listInputs = getThreadListInputs(workspaceId);
  const snapshot: ThreadPinCacheSnapshot = {
    lists: listInputs.map((input) => ({
      data: utils.threads.list.getData(input),
      input,
    })),
    thread: utils.threads.get.getData(threadInput),
  };

  utils.threads.get.setData(threadInput, (current) =>
    current
      ? {
          ...current,
          thread: {
            ...current.thread,
            pinnedAt,
          },
        }
      : current,
  );

  if (
    workspaceKind === "quick_chat" ||
    snapshot.thread?.workspace.kind === "quick_chat"
  ) {
    utils.threads.listQuickChats.setData(undefined, (current) =>
      updateThreadPinInQuickChatListData(current, threadId, pinnedAt),
    );
  } else {
    for (const input of listInputs) {
      utils.threads.list.setData(input, (current) =>
        updateThreadPinInListData(current, threadId, pinnedAt),
      );
    }
  }

  return snapshot;
}

export function restoreOptimisticThreadPinUpdate(
  utils: TrpcUtils,
  snapshot: ThreadPinCacheSnapshot | undefined,
  threadId: string,
) {
  if (!snapshot) {
    return;
  }

  utils.threads.get.setData({ threadId }, snapshot.thread);

  for (const entry of snapshot.lists) {
    utils.threads.list.setData(entry.input, entry.data);
  }
}

type ThreadStatusValue = "idle" | "streaming" | "awaiting_approval";

function buildThreadListItem(
  thread: ThreadGetThread,
): ThreadListData extends { items: infer T }
  ? T extends Array<infer U>
    ? U
    : never
  : never {
  return {
    archivedAt: thread.archivedAt,
    chatEngine: thread.chatEngine,
    chatModelId: thread.chatModelId,
    chatReasoningEffort: thread.chatReasoningEffort,
    createdAt: thread.createdAt,
    id: thread.id,
    linkedPullRequest:
      "linkedPullRequest" in thread ? (thread.linkedPullRequest ?? null) : null,
    mode: thread.mode,
    pinnedAt: thread.pinnedAt,
    status: thread.status,
    summary: thread.summary,
    title: thread.title,
    updatedAt: thread.updatedAt,
  } as ThreadListData extends { items: infer T }
    ? T extends Array<infer U>
      ? U
      : never
    : never;
}

function upsertThreadInListData<T extends ThreadListData | undefined>(
  data: T,
  thread: ThreadGetThread,
  workspace?: ThreadGetWorkspace,
): T {
  if (!data) {
    return data;
  }

  const listItem = buildThreadListItem(thread);

  if ("groups" in data) {
    const matchesWorkspace = (groupWorkspaceId?: string) =>
      !workspace || groupWorkspaceId === workspace.id;
    let inserted = false;
    const groups = (data.groups ?? []).map((group) => {
      if (!matchesWorkspace(group.workspace.id)) {
        return group;
      }

      const existingIndex = group.threads.findIndex(
        (item) => item.id === thread.id,
      );
      if (existingIndex === -1) {
        if (!workspace || group.workspace.id !== workspace.id) {
          return group;
        }
        inserted = true;
        return {
          ...group,
          threads: [listItem, ...group.threads],
        };
      }

      inserted = true;
      return {
        ...group,
        threads: group.threads.map((item) =>
          item.id === thread.id ? { ...item, ...(listItem as object) } : item,
        ),
      };
    });

    if (!inserted || !workspace) {
      return {
        ...data,
        groups,
      } as T;
    }

    return {
      ...data,
      groups,
    } as T;
  }

  const existingIndex = (data.items ?? []).findIndex(
    (item) => item.id === thread.id,
  );
  if (existingIndex === -1) {
    return {
      ...data,
      items: [listItem, ...(data.items ?? [])],
    } as T;
  }

  return {
    ...data,
    items: (data.items ?? []).map((item) =>
      item.id === thread.id ? { ...item, ...(listItem as object) } : item,
    ),
  } as T;
}

function updateThreadStatusInListData<T extends ThreadListData | undefined>(
  data: T,
  threadId: string,
  status: ThreadStatusValue,
): T {
  if (!data) {
    return data;
  }

  if ("groups" in data) {
    return {
      ...data,
      groups: (data.groups ?? []).map((group) => ({
        ...group,
        threads: group.threads.map((thread) =>
          thread.id === threadId ? { ...thread, status } : thread,
        ),
      })),
    } as T;
  }

  return {
    ...data,
    items: (data.items ?? []).map((item) =>
      item.id === threadId ? { ...item, status } : item,
    ),
  } as T;
}

export function applyThreadStatusCacheUpdate({
  status,
  threadId,
  utils,
  workspaceId,
  workspaceKind,
}: {
  status: ThreadStatusValue;
  threadId: string;
  utils: TrpcUtils;
  workspaceKind?: ThreadGetWorkspace["kind"];
  workspaceId?: string;
}) {
  if (workspaceKind === "quick_chat") {
    utils.threads.listQuickChats.setData(undefined, (current) =>
      updateThreadStatusInQuickChatListData(current, threadId, status),
    );
    return;
  }

  for (const input of getThreadListInputs(workspaceId)) {
    utils.threads.list.setData(input, (current) =>
      updateThreadStatusInListData(current, threadId, status),
    );
  }
}

export function applyThreadSnapshotCacheUpdate({
  snapshot,
  thread,
  threadId,
  utils,
  workspace,
  workspaceId,
}: {
  snapshot: Pick<ThreadGetData, "messages" | "queuedFollowUps"> & {
    thread: Pick<ThreadGetThread, "activeRunId" | "status" | "title"> & {
      mode?: "chat" | "plan";
    };
  };
  thread?: ThreadGetThread;
  threadId: string;
  utils: TrpcUtils;
  workspace?: ThreadGetWorkspace;
  workspaceId?: string;
}) {
  utils.threads.get.setData({ threadId }, (current) => {
    if (current) {
      return {
        ...current,
        messages: snapshot.messages,
        queuedFollowUps: snapshot.queuedFollowUps,
        thread: {
          ...current.thread,
          activeRunId: snapshot.thread.activeRunId,
          ...(snapshot.thread.mode ? { mode: snapshot.thread.mode } : {}),
          status: snapshot.thread.status,
          title: snapshot.thread.title,
        },
      };
    }

    if (!thread || !workspace) {
      return current;
    }

    return {
      messages: snapshot.messages,
      queuedFollowUps: snapshot.queuedFollowUps,
      thread: {
        ...thread,
        activeRunId: snapshot.thread.activeRunId,
        ...(snapshot.thread.mode ? { mode: snapshot.thread.mode } : {}),
        status: snapshot.thread.status,
        title: snapshot.thread.title,
      },
      workspace,
    };
  });

  if (!thread) {
    return;
  }

  const nextThread = {
    ...thread,
    activeRunId: snapshot.thread.activeRunId,
    status: snapshot.thread.status,
    title: snapshot.thread.title,
  };

  if (workspace?.kind === "quick_chat") {
    utils.threads.listQuickChats.setData(undefined, (current) =>
      upsertThreadInQuickChatListData(current, nextThread, workspace),
    );
    return;
  }

  for (const input of getThreadListInputs(workspaceId ?? workspace?.id)) {
    utils.threads.list.setData(input, (current) =>
      upsertThreadInListData(current, nextThread, workspace),
    );
  }
}

export function applyThreadSettingsCacheUpdate({
  patch,
  threadId,
  utils,
  workspaceId,
  workspaceKind,
}: {
  patch: ThreadSettingsPatch;
  threadId: string;
  utils: TrpcUtils;
  workspaceKind?: ThreadGetWorkspace["kind"];
  workspaceId?: string;
}) {
  utils.threads.get.setData({ threadId }, (current) =>
    current
      ? {
          ...current,
          thread: applyThreadSettingsPatch(current.thread, patch),
        }
      : current,
  );

  if (workspaceKind === "quick_chat") {
    utils.threads.listQuickChats.setData(undefined, (current) =>
      updateThreadSettingsInQuickChatListData(current, threadId, patch),
    );
    return;
  }

  for (const input of getThreadListInputs(workspaceId)) {
    utils.threads.list.setData(input, (current) =>
      updateThreadSettingsInListData(current, threadId, patch),
    );
  }
}

export function applyThreadTitleCacheUpdate({
  threadId,
  title,
  utils,
  workspaceId,
  workspaceKind,
}: {
  threadId: string;
  title: string;
  utils: TrpcUtils;
  workspaceKind?: ThreadGetWorkspace["kind"];
  workspaceId?: string;
}) {
  utils.threads.get.setData({ threadId }, (current) =>
    current
      ? {
          ...current,
          thread: {
            ...current.thread,
            title,
          },
        }
      : current,
  );

  if (workspaceKind === "quick_chat") {
    utils.threads.listQuickChats.setData(undefined, (current) =>
      updateThreadTitleInQuickChatListData(current, threadId, title),
    );
    return;
  }

  for (const input of getThreadListInputs(workspaceId)) {
    utils.threads.list.setData(input, (current) =>
      updateThreadTitleInListData(current, threadId, title),
    );
  }
}
