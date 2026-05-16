import { describe, expect, it } from "bun:test";

import type { ThreadSessionSnapshot } from "@/lib/ai/chat/session/types";
import type { RouterOutputs } from "@/trpc/react";

import {
  THREAD_ROUTE_HANDOFF_MAX_AGE_MS,
  type ThreadRouteHandoffState,
} from "./thread-route-handoff";
import {
  resolveThreadRouteComposerUiState,
  resolveThreadRouteData,
  shouldRefreshThreadRouteData,
} from "./thread-route-screen.helpers";

type ThreadDetails = RouterOutputs["threads"]["get"];

function createThreadDetails(): ThreadDetails {
  return {
    messages: [],
    queuedFollowUps: [],
    thread: {
      activeRunId: null,
      archivedAt: null,
      chatEngine: "sentinel",
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "medium",
      createdAt: new Date("2026-04-21T10:00:00Z"),
      hasCodexThread: false,
      id: "thread-1",
      linkedPullRequest: null,
      mode: "chat",
      pinnedAt: null,
      status: "idle",
      summary: null,
      title: "Draft thread",
      updatedAt: new Date("2026-04-21T10:00:00Z"),
    },
    workspace: {
      createdAt: new Date("2026-04-21T09:00:00Z"),
      description: null,
      id: "workspace-1",
      kind: "project",
      name: "Workspace",
      permissionModeOverride: null,
      rootPath: "/repo",
      updatedAt: new Date("2026-04-21T09:00:00Z"),
    },
  };
}

function createLiveSnapshot(): ThreadSessionSnapshot {
  return {
    activeRunId: "run-1",
    chatEngine: "cursor",
    messages: [
      {
        id: "message-1",
        metadata: {
          status: "pending",
          statusLabel: "Sending...",
        },
        parts: [{ text: "Ship it", type: "text" }],
        role: "user",
      },
    ],
    queuedFollowUps: [],
    threadId: "thread-1",
    threadTitle: "Ship it",
    threadStatus: "streaming",
  };
}

function createActiveThreadDetails(): ThreadDetails {
  const baseThread = createThreadDetails();

  return {
    ...baseThread,
    messages: [
      {
        id: "assistant-1",
        metadata: {
          status: "pending" as const,
          statusLabel: "Working...",
        },
        parts: [{ text: " ", type: "text" as const }],
        role: "assistant" as const,
      },
    ],
    thread: {
      ...baseThread.thread,
      activeRunId: "run-1",
      status: "streaming" as const,
    },
  };
}

function createHandoffState(
  overrides: Partial<ThreadRouteHandoffState> = {},
): ThreadRouteHandoffState {
  return {
    draftPreparedWorktree: {
      branch: "thread/feature",
      path: "/repo/.worktrees/thread-1",
    },
    draftProjectMode: "worktree",
    openCodeSelection: {
      agent: "builder",
      variant: "max",
    },
    threadId: "thread-1",
    threadSelection: {
      engine: "opencode",
      modelId: "opencode-model",
      mode: "plan",
      reasoningEffort: "high",
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("resolveThreadRouteData", () => {
  it("returns null when no cached thread exists", () => {
    expect(
      resolveThreadRouteData(undefined, createLiveSnapshot()),
    ).toBeUndefined();
  });

  it("returns the base thread when no live snapshot exists", () => {
    const baseThread = createThreadDetails();

    expect(resolveThreadRouteData(baseThread, null)).toEqual(baseThread);
  });

  it("renders active-looking cached thread data immediately", () => {
    const baseThread = createActiveThreadDetails();

    expect(resolveThreadRouteData(baseThread, null)).toEqual(baseThread);
  });

  it("requests a background refresh for active-looking cached thread data", () => {
    const baseThread = createActiveThreadDetails();

    expect(shouldRefreshThreadRouteData(baseThread, null)).toBeTrue();
    expect(
      shouldRefreshThreadRouteData(baseThread, createLiveSnapshot()),
    ).toBeFalse();
  });

  it("returns the base thread when the live snapshot is not ahead", () => {
    const baseThread = createThreadDetails();
    const liveSnapshot: ThreadSessionSnapshot = {
      ...createLiveSnapshot(),
      activeRunId: null,
      chatEngine: "sentinel",
      messages: [],
      threadStatus: "idle",
      threadTitle: "Draft thread",
    };

    expect(resolveThreadRouteData(baseThread, liveSnapshot)).toEqual(
      baseThread,
    );
  });

  it("merges the live thread session into base thread metadata when it is ahead", () => {
    const baseThread = createThreadDetails();
    const liveSnapshot = createLiveSnapshot();

    expect(resolveThreadRouteData(baseThread, liveSnapshot)).toEqual({
      ...baseThread,
      messages: liveSnapshot.messages,
      queuedFollowUps: liveSnapshot.queuedFollowUps,
      thread: {
        ...baseThread.thread,
        activeRunId: "run-1",
        chatEngine: "cursor",
        status: "streaming",
        title: "Ship it",
      },
    });
  });
});

describe("resolveThreadRouteComposerUiState", () => {
  it("returns null when no handoff state exists", () => {
    expect(
      resolveThreadRouteComposerUiState(createThreadDetails(), null),
    ).toBeNull();
  });

  it("prefers a fresh handoff snapshot for composer UI state", () => {
    const handoff = createHandoffState();

    expect(
      resolveThreadRouteComposerUiState(
        createThreadDetails(),
        handoff,
        handoff.updatedAt + 1,
      ),
    ).toEqual(handoff);
  });

  it("ignores stale handoff snapshots", () => {
    const handoff = createHandoffState({
      updatedAt: Date.now() - THREAD_ROUTE_HANDOFF_MAX_AGE_MS - 1,
    });

    expect(
      resolveThreadRouteComposerUiState(createThreadDetails(), handoff),
    ).toBeNull();
  });
});
