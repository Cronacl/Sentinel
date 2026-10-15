// Test harness for the Pi runtime: the thread, its stream and the follow-up
// queue are in-memory fakes; everything between them and Pi (the Pi RPC
// mock behind a real `pi` launcher, over stdio) is the real code. Call
// setupPiRunHarness() at the top of a test file, before anything imports
// the runtime. Not a test file itself. (Same fakes as the ACP harness,
// runtime/acp/__tests__/run-harness.ts.)
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { mock } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

type StoredThread = {
  activeStreamId: string | null;
  chatEngine: "pi";
  chatEngineInstanceId: string | null;
  chatEngineState: Record<string, unknown> | null;
  id: string;
  mode: "chat" | "plan";
  status: string;
  title: string;
};

export function toolParts(message: ThreadUIMessage | null) {
  return (message?.parts ?? []).filter(
    (part) => part.type === "dynamic-tool",
  ) as Array<Record<string, any>>;
}

export async function setupPiRunHarness() {
  process.env.SENTINEL_STATE_PATH ??= path.join(
    mkdtempSync(path.join(os.tmpdir(), "sentinel-pi-run-state-")),
    "state.json",
  );
  mock.module("server-only", () => ({}));

  const store = {
    events: new Map<string, unknown[]>(),
    messages: new Map<string, ThreadUIMessage>(),
    order: [] as string[],
    thread: null as StoredThread | null,
  };
  const settings = { permissionMode: "default", workspaceDir: "" };
  const drains: unknown[] = [];

  const { stampThreadState } =
    await import("@/lib/ai/chat/engines/state/registry");

  mock.module("@/lib/ai/chat/persistence", () => ({
    clearActiveStream: () => {
      if (store.thread) store.thread.activeStreamId = null;
    },
    ensureThread: async (
      threadId: string,
      _user: string,
      _workspace: string,
      title: string,
      mode: "chat" | "plan",
      engine: "pi",
      _state: unknown,
      instanceId?: string,
    ) => {
      store.thread ??= {
        activeStreamId: null,
        chatEngine: engine,
        chatEngineInstanceId: instanceId ?? null,
        chatEngineState: null,
        id: threadId,
        mode,
        status: "idle",
        title,
      };
    },
    loadThreadMessages: async () =>
      store.order.map((id, index) => {
        const message = store.messages.get(id)!;
        return {
          createdAt: new Date(1_000 + index),
          id,
          messageId: id,
          metadata: message.metadata ?? {},
          parts: message.parts,
          role: message.role,
          updatedAt: new Date(1_000 + index),
        };
      }),
    setActiveStream: (_threadId: string, runId: string) => {
      if (store.thread) store.thread.activeStreamId = runId;
    },
    setThreadStatus: (_threadId: string, status: string) => {
      if (store.thread) store.thread.status = status;
    },
    updateDriverThreadState: (
      _threadId: string,
      kind: string,
      state: Record<string, unknown>,
      instance: { continuationKey: string; id: string },
    ) => {
      if (store.thread) {
        store.thread.chatEngineState = {
          ...store.thread.chatEngineState,
          [kind]: stampThreadState(state, instance),
        };
      }
    },
    updateThreadChatSettings: () => {},
    updateThreadTitle: () => {},
    upsertMessage: (_threadId: string, message: ThreadUIMessage) => {
      const previous = store.messages.get(message.id);
      const stored = {
        ...message,
        metadata: { ...previous?.metadata, ...message.metadata },
      };
      if (!previous) store.order.push(message.id);
      store.messages.set(message.id, stored);
      return stored;
    },
  }));

  mock.module("@/lib/ai/chat/session/server", () => ({
    loadThreadSessionSnapshot: async () => ({ queuedFollowUps: [] }),
    serializeThreadStreamEvent: (event: unknown) => JSON.stringify(event),
  }));

  mock.module("@/lib/streams", () => ({
    safelyCloseReadableStreamController: (
      controller: ReadableStreamDefaultController | null,
    ) => {
      try {
        controller?.close();
        return true;
      } catch {
        return false;
      }
    },
    safelyEnqueueReadableStreamController: (
      controller: ReadableStreamDefaultController | null,
      chunk: unknown,
    ) => {
      try {
        controller?.enqueue(chunk);
        return true;
      } catch {
        return false;
      }
    },
    streamContext: {
      async createNewResumableStream(
        runId: string,
        factory: () => ReadableStream<string>,
      ) {
        const events: unknown[] = [];
        store.events.set(runId, events);
        void (async () => {
          const reader = factory().getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            events.push(JSON.parse(value));
          }
        })();
      },
      resumeExistingStream: async () => null,
    },
  }));

  mock.module("@/lib/ai/chat/runtime/workspace", () => ({
    getMcpServerRuntime: async () => [],
    getToolPermissionMode: async () => settings.permissionMode,
    getWorkspaceRootPath: async () => settings.workspaceDir,
  }));

  mock.module("@/lib/ai/chat/repo/checkpoints", () => ({
    beginThreadRepoCheckpointRun: async () => true,
    clearThreadRepoCheckpointRun: async () => {},
    finalizeThreadRepoCheckpointRun: async () => null,
    getThreadCheckpointAnchorMessageId: () => null,
  }));

  mock.module("@/lib/uploaded-media", () => ({
    readUploadedMediaUrl: async () => null,
  }));

  mock.module("@/lib/ai/chat/runtime/thread-chat/follow-up-queue", () => ({
    drainFollowUpQueue: async (request: unknown) => {
      drains.push(request);
    },
  }));
  mock.module("@/lib/ai/chat/runtime/thread-chat/orchestrator", () => ({
    runParsedThreadChat: async () => new Response(null),
  }));

  const runtime = await import("../run");
  const state = await import("../state");
  const launch = await import("@/lib/ai/chat/engines/pi/launch");
  const binary = await import("@/lib/ai/chat/engines/pi/binary");
  const support = await import("@/lib/ai/chat/engines/pi/__tests__/mock-pi");

  const dirs: string[] = [];
  let instanceDir = "";

  function instanceFor(scenario: Parameters<typeof support.mockPiInstance>[0]) {
    instanceDir = support.makeTempDir("instance");
    dirs.push(instanceDir);
    return support.mockPiInstance(scenario, instanceDir);
  }

  function request(text: string, extra: Record<string, unknown> = {}) {
    return {
      message: {
        id: `user-${Math.random()}`,
        metadata: {},
        parts: [{ text, type: "text" as const }],
        role: "user" as const,
      },
      modelId: "default",
      threadId: "thread-1",
      trigger: "submit-user-message" as const,
      userId: "user-1",
      workspaceId: "ws-1",
      ...extra,
    };
  }

  function assistant() {
    const id = [...store.order]
      .reverse()
      .find((messageId) => store.messages.get(messageId)?.role === "assistant");
    return id ? store.messages.get(id)! : null;
  }

  return {
    assistant,
    async cleanup() {
      await launch.getPiProcessPool().disposeAll();
    },
    drains,
    eventTypes() {
      return ([...store.events.values()].at(-1) ?? []).map(
        (event) => (event as { type: string }).type,
      );
    },
    finished() {
      const status = assistant()?.metadata?.status;
      return status === "completed" ||
        status === "error" ||
        status === "cancelled"
        ? assistant()
        : null;
    },
    getPiProcessPool: launch.getPiProcessPool,
    instanceDir: () => instanceDir,
    instanceFor,
    piPoolKey: launch.piPoolKey,
    removeDirs() {
      for (const dir of dirs.splice(0)) support.removeTempDir(dir);
    },
    request,
    reset() {
      binary.invalidatePiBinaryResolutions();
      store.events.clear();
      store.messages.clear();
      store.order = [];
      store.thread = null;
      drains.length = 0;
      settings.permissionMode = "default";
      settings.workspaceDir = support.makeTempDir("ws");
      dirs.push(settings.workspaceDir);
    },
    resolveActivePiRunControl: state.resolveActivePiRunControl,
    /** Starts a turn with the instance's mock. */
    async run(
      instance: ReturnType<typeof instanceFor>,
      text: string,
      extra: Record<string, unknown> = {},
    ) {
      await runtime.runPiThreadChat(
        request(text, extra),
        store.thread as never,
        instance,
      );
    },
    settings,
    stop: () =>
      runtime.stopPiThreadRun(request(""), store.thread as never, null),
    store,
    /** Answers the pending approval or question of the latest message. */
    async submit(
      instance: ReturnType<typeof instanceFor>,
      response: { approved: boolean; decision?: string; response?: string },
    ) {
      const pending = toolParts(assistant()).find(
        (part) => part.state === "approval-requested",
      );
      if (!pending) {
        throw new Error("Nothing is waiting for an answer.");
      }
      await runtime.runPiThreadChat(
        {
          ...request(""),
          message: undefined,
          toolApprovalResponse: { ...response, id: pending.approval.id },
          trigger: "submit-tool-approval",
        } as never,
        store.thread as never,
        instance,
      );
      return pending;
    },
    support,
    toolParts,
    waitFor: support.waitUntil,
  };
}
