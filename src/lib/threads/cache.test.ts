import { describe, expect, it } from "bun:test";

import {
  applyThreadStatusCacheUpdate,
  applyThreadSettingsCacheUpdate,
  applyThreadTitleCacheUpdate,
} from "./cache";

function createUtils() {
  const threadData = {
    messages: [],
    thread: {
      archivedAt: null,
      chatModelId: "openai:gpt-5.2",
      chatReasoningEffort: "medium",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      id: "thread-1",
      mode: "chat" as const,
      pinnedAt: null,
      summary: null,
      title: "Thread",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
    workspace: {
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      description: null,
      id: "workspace-1",
      kind: "project" as const,
      name: "Workspace",
      rootPath: "/tmp/workspace-1",
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    },
  };

  const chronologicalData = {
    items: [
      {
        archivedAt: null,
        chatModelId: "openai:gpt-5.2",
        chatReasoningEffort: "medium",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        id: "thread-1",
        mode: "chat" as const,
        pinnedAt: null,
        summary: null,
        title: "Thread",
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
        workspace: {
          createdAt: new Date("2026-03-12T00:00:00.000Z"),
          description: null,
          id: "workspace-1",
          kind: "project" as const,
          name: "Workspace",
          rootPath: "/tmp/workspace-1",
          updatedAt: new Date("2026-03-12T00:00:00.000Z"),
        },
      },
    ],
    organizeBy: "chronological" as const,
    sortBy: "updated" as const,
  };

  const workspaceData = {
    groups: [
      {
        threads: [
          {
            archivedAt: null,
            chatModelId: "openai:gpt-5.2",
            chatReasoningEffort: "medium",
            createdAt: new Date("2026-03-12T00:00:00.000Z"),
            id: "thread-1",
            mode: "chat" as const,
            pinnedAt: null,
            summary: null,
            title: "Thread",
            updatedAt: new Date("2026-03-12T00:00:00.000Z"),
          },
        ],
        workspace: {
          createdAt: new Date("2026-03-12T00:00:00.000Z"),
          description: null,
          id: "workspace-1",
          kind: "project" as const,
          name: "Workspace",
          rootPath: "/tmp/workspace-1",
          updatedAt: new Date("2026-03-12T00:00:00.000Z"),
        },
      },
    ],
    organizeBy: "workspace" as const,
    sortBy: "updated" as const,
  };

  const threadStore = new Map<string, typeof threadData | undefined>([
    [JSON.stringify({ threadId: "thread-1" }), threadData],
  ]);
  const listStore = new Map<string, any>([
    [
      JSON.stringify({ organizeBy: "chronological", sortBy: "updated" }),
      chronologicalData,
    ],
    [
      JSON.stringify({ organizeBy: "workspace", sortBy: "updated" }),
      workspaceData,
    ],
    [JSON.stringify({ workspaceId: "workspace-1" }), chronologicalData],
  ]);
  const quickChatStore = new Map<string, any>([
    [
      JSON.stringify(null),
      [
        {
          archivedAt: null,
          chatModelId: "openai:gpt-5.2",
          chatReasoningEffort: "medium",
          createdAt: new Date("2026-03-12T00:00:00.000Z"),
          id: "quick-thread-1",
          mode: "chat" as const,
          pinnedAt: null,
          status: "idle" as const,
          summary: null,
          title: "Quick Thread",
          updatedAt: new Date("2026-03-12T00:00:00.000Z"),
          workspace: {
            id: "quick-workspace-1",
            kind: "quick_chat" as const,
            name: "Quick chats",
          },
        },
      ],
    ],
  ]);

  return {
    threads: {
      get: {
        setData(input: unknown, updater: any) {
          const key = JSON.stringify(input);
          const current = threadStore.get(key);
          threadStore.set(
            key,
            typeof updater === "function" ? updater(current) : updater,
          );
        },
        getData(input: unknown) {
          return threadStore.get(JSON.stringify(input));
        },
      },
      list: {
        setData(input: unknown, updater: any) {
          const key = JSON.stringify(input ?? null);
          const current = listStore.get(key);
          listStore.set(
            key,
            typeof updater === "function" ? updater(current) : updater,
          );
        },
        getData(input: unknown) {
          return listStore.get(JSON.stringify(input ?? null));
        },
      },
      listQuickChats: {
        setData(input: unknown, updater: any) {
          const key = JSON.stringify(input ?? null);
          const current = quickChatStore.get(key);
          quickChatStore.set(
            key,
            typeof updater === "function" ? updater(current) : updater,
          );
        },
        getData(input: unknown) {
          return quickChatStore.get(JSON.stringify(input ?? null));
        },
      },
    },
  } as any;
}

describe("applyThreadSettingsCacheUpdate", () => {
  it("updates thread mode and settings across thread and list caches", () => {
    const utils = createUtils();

    applyThreadSettingsCacheUpdate({
      patch: {
        chatModelId: "openai:gpt-5.4",
        chatReasoningEffort: "high",
        mode: "plan",
      },
      threadId: "thread-1",
      utils,
      workspaceId: "workspace-1",
    });

    expect(
      utils.threads.get.getData({ threadId: "thread-1" }).thread,
    ).toMatchObject({
      chatModelId: "openai:gpt-5.4",
      chatReasoningEffort: "high",
      mode: "plan",
    });
    expect(
      utils.threads.list.getData({
        organizeBy: "chronological",
        sortBy: "updated",
      }).items[0],
    ).toMatchObject({
      chatModelId: "openai:gpt-5.4",
      chatReasoningEffort: "high",
      mode: "plan",
    });
    expect(
      utils.threads.list.getData({
        organizeBy: "workspace",
        sortBy: "updated",
      }).groups[0].threads[0],
    ).toMatchObject({
      chatModelId: "openai:gpt-5.4",
      chatReasoningEffort: "high",
      mode: "plan",
    });
  });
});

it("updates thread title across thread and list caches", () => {
  const utils = createUtils();

  applyThreadTitleCacheUpdate({
    threadId: "thread-1",
    title: "Renamed thread",
    utils: utils as never,
    workspaceId: "workspace-1",
  });

  expect(
    utils.threads.get.getData({ threadId: "thread-1" })?.thread.title,
  ).toBe("Renamed thread");
  expect(
    utils.threads.list.getData({
      organizeBy: "chronological",
      sortBy: "updated",
    })?.items[0]?.title,
  ).toBe("Renamed thread");
  expect(
    utils.threads.list.getData({ organizeBy: "workspace", sortBy: "updated" })
      ?.groups[0]?.threads[0]?.title,
  ).toBe("Renamed thread");
});

it("updates thread status across list caches", () => {
  const utils = createUtils();

  applyThreadStatusCacheUpdate({
    status: "streaming",
    threadId: "thread-1",
    utils: utils as never,
    workspaceId: "workspace-1",
  });

  expect(
    utils.threads.list.getData({
      organizeBy: "chronological",
      sortBy: "updated",
    })?.items[0]?.status,
  ).toBe("streaming");
  expect(
    utils.threads.list.getData({ organizeBy: "workspace", sortBy: "updated" })
      ?.groups[0]?.threads[0]?.status,
  ).toBe("streaming");
});

it("updates quick chat titles in the quick chat cache", () => {
  const utils = createUtils();

  applyThreadTitleCacheUpdate({
    threadId: "quick-thread-1",
    title: "Renamed quick chat",
    utils: utils as never,
    workspaceId: "quick-workspace-1",
    workspaceKind: "quick_chat",
  });

  expect(utils.threads.listQuickChats.getData(undefined)?.[0]?.title).toBe(
    "Renamed quick chat",
  );
});
