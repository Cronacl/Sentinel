import type { ThreadListInput } from "@/schemas/workspace-thread.schema";
import { api, type RouterOutputs } from "@/trpc/react";

type TrpcUtils = ReturnType<typeof api.useUtils>;
type ThreadGetData = RouterOutputs["threads"]["get"];
type ThreadListData = RouterOutputs["threads"]["list"];
type ThreadSettingsPatch = {
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

function applyThreadSettingsPatch<
  T extends {
    chatModelId: string | null;
    chatReasoningEffort: string | null;
    mode: "chat" | "plan";
  },
>(thread: T, patch: ThreadSettingsPatch) {
  return {
    ...thread,
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
          thread.id === threadId ? applyThreadSettingsPatch(thread, patch) : thread,
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

export function applyOptimisticThreadPinUpdate({
  pinnedAt,
  threadId,
  utils,
  workspaceId,
}: {
  pinnedAt: Date | null;
  threadId: string;
  utils: TrpcUtils;
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

  for (const input of listInputs) {
    utils.threads.list.setData(input, (current) =>
      updateThreadPinInListData(current, threadId, pinnedAt),
    );
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
}: {
  status: ThreadStatusValue;
  threadId: string;
  utils: TrpcUtils;
  workspaceId?: string;
}) {
  for (const input of getThreadListInputs(workspaceId)) {
    utils.threads.list.setData(input, (current) =>
      updateThreadStatusInListData(current, threadId, status),
    );
  }
}

export function applyThreadSettingsCacheUpdate({
  patch,
  threadId,
  utils,
  workspaceId,
}: {
  patch: ThreadSettingsPatch;
  threadId: string;
  utils: TrpcUtils;
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

  for (const input of getThreadListInputs(workspaceId)) {
    utils.threads.list.setData(input, (current) =>
      updateThreadSettingsInListData(current, threadId, patch),
    );
  }
}
