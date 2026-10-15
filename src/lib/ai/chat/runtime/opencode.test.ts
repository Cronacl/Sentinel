import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The OpenCode runtime against the scripts/fixtures fake server (both
// generations) through the real pool, HTTP and SSE: only persistence, the
// stream registry and workspace lookups are stubbed.

mock.module("server-only", () => ({}));

const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "sentinel-opencode-run-"),
);
const originalEnv = {
  HOME: process.env.HOME,
  SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
};
process.env.HOME = tempRoot;
process.env.SENTINEL_STATE_PATH = path.join(tempRoot, "state", "state.json");

const ensureThread = mock(async () => ({ created: true }));
const clearActiveStream = mock(() => {});
const loadThread = mock(async () => null);
const loadThreadMessages = mock(async () => [] as unknown[]);
const setActiveStream = mock(() => {});
const setThreadStatus = mock((_threadId: string, _status: string) => {});
const updateOpenCodeThreadState = mock(
  (_threadId: string, _state: unknown, _instance?: unknown) => {},
);
const updateThreadChatSettings = mock(async () => {});
const upsertMessage = mock((_threadId: string, message: unknown) => message);
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: "run-1",
  chatEngine: "opencode" as const,
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: "OpenCode thread",
  threadStatus: "streaming" as const,
}));
const getToolPermissionMode = mock(async () => "default");
const getWorkspaceRootPath = mock(async () => tempRoot);

const persistenceModuleMock = () => ({
  claimNextThreadFollowUp: mock(() => null),
  clearActiveStream,
  deleteThreadFollowUp: mock(() => {}),
  ensureThread,
  loadThread,
  loadThreadMessages,
  requeueThreadFollowUp: mock(() => {}),
  resetProcessingThreadFollowUps: mock(() => {}),
  setActiveStream,
  setThreadStatus,
  updateOpenCodeThreadState,
  updateThreadChatSettings,
  upsertMessage,
});
mock.module("../persistence", persistenceModuleMock);
mock.module("@/lib/ai/chat/persistence", persistenceModuleMock);
mock.module("../repo/checkpoints", () => ({
  beginThreadRepoCheckpointRun: mock(async () => true),
  clearThreadRepoCheckpointRun: mock(async () => {}),
  finalizeThreadRepoCheckpointRun: mock(async () => "checkpoint-1"),
  getThreadCheckpointAnchorMessageId: mock(() => null),
}));
mock.module("../session/server", () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent: (event: unknown) =>
    `event: test\ndata: ${JSON.stringify(event)}\n\n`,
}));
mock.module("@/lib/streams", () => ({
  safelyCloseReadableStreamController: () => true,
  safelyEnqueueReadableStreamController: () => true,
  streamContext: {
    createNewResumableStream: async () => {},
    resumeExistingStream: async () =>
      new ReadableStream<string>({ start: (controller) => controller.close() }),
  },
}));
mock.module("./workspace", () => ({
  getToolApprovalPolicies: async () => ({}),
  getToolPermissionMode,
  getWorkspaceRootPath,
}));

const { runOpenCodeThreadChat, stopOpenCodeThreadRun } =
  await import("./opencode");
const { resolveOpenCodeSessionError } =
  await import("./opencode/event-helpers");
const { disposeAllOpenCodeServers, getOpenCodeServerPool } =
  await import("@/lib/ai/chat/engines/opencode-sdk");
const { stampThreadState } =
  await import("@/lib/ai/chat/engines/state/registry");
const { createFakeOpenCode, waitUntil } =
  await import("@/lib/ai/chat/engines/opencode-sdk/__tests__/fake-opencode");

type Fake = Awaited<ReturnType<typeof createFakeOpenCode>>;

afterEach(async () => {
  await disposeAllOpenCodeServers();
});

afterAll(async () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(tempRoot, { force: true, recursive: true });
});

beforeEach(() => {
  for (const fn of [
    ensureThread,
    clearActiveStream,
    loadThreadMessages,
    setActiveStream,
    setThreadStatus,
    updateOpenCodeThreadState,
    updateThreadChatSettings,
    upsertMessage,
  ]) {
    fn.mockClear();
  }
  getToolPermissionMode.mockImplementation(async () => "default");
  loadThreadMessages.mockImplementation(async () => []);
});

let threadCounter = 0;

function userMessage(threadId: string, text: string, suffix = "user") {
  return {
    id: `${threadId}-${suffix}`,
    metadata: {},
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

function runRequest(
  threadId: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return {
    message: userMessage(threadId, text, (extra.suffix as string) ?? "user"),
    modelId: "anthropic/claude-sonnet-4-5",
    threadId,
    trigger: "submit-user-message",
    userId: "user-1",
    workspaceId: "workspace-1",
    ...extra,
  } as any;
}

function assistantUpserts(threadId: string) {
  return upsertMessage.mock.calls
    .filter((call: unknown[]) => call[0] === threadId)
    .map((call: unknown[]) => call[1] as any)
    .filter((message: any) => message?.role === "assistant");
}

async function waitForFinal(threadId: string, status?: string) {
  return await waitUntil(
    () =>
      assistantUpserts(threadId).findLast((message: any) =>
        status
          ? message.metadata?.status === status
          : ["completed", "error", "cancelled"].includes(
              message.metadata?.status,
            ),
      ),
    `assistant ${status ?? "final"} message`,
  );
}

async function waitForPart(
  threadId: string,
  predicate: (part: any) => boolean,
) {
  return await waitUntil(
    () =>
      assistantUpserts(threadId)
        .flatMap((message: any) => message.parts as any[])
        .findLast(predicate),
    "assistant part",
  );
}

function lastState(threadId: string) {
  return updateOpenCodeThreadState.mock.calls
    .filter((call: unknown[]) => call[0] === threadId)
    .at(-1)?.[1] as any;
}

/** Persisted message rows (a linear thread) as loadThreadMessages returns them. */
function records(messages: any[]) {
  return messages.map((message, index) => ({
    createdAt: new Date(index + 1),
    id: `row-${message.id}`,
    messageId: message.id,
    metadata: {
      ...message.metadata,
      parentMessageId: index === 0 ? null : messages[index - 1].id,
      status: "completed",
    },
    parts: message.parts,
    role: message.role,
    updatedAt: new Date(index + 1),
  }));
}

function threadWithState(fake: Fake, state: unknown, mode = "chat") {
  return {
    activeStreamId: null,
    chatEngineState: {
      opencode: stampThreadState(state as any, fake.instance),
    },
    mode,
    status: "idle",
  } as any;
}

function nextThreadId() {
  threadCounter += 1;
  return `thread-${threadCounter}`;
}

async function promptBodies(fake: Fake, pattern: RegExp) {
  return (await fake.requests())
    .filter(
      (request) => request.method === "POST" && pattern.test(request.path),
    )
    .map((request) => request.body as any);
}

describe("runOpenCodeThreadChat on OpenCode 1.x", () => {
  it("mirrors parts in arrival order, completes on idle and records the session", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        prompts: [
          {
            steps: [
              { text: ["Let me ", "look."], type: "reasoning" },
              { text: ["Checking ", "files."], type: "text" },
              {
                callID: "call_ls",
                input: { command: "ls" },
                output: "a.ts\n",
                tool: "bash",
                type: "tool",
              },
              { text: "Done.", type: "text" },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    const response = await runOpenCodeThreadChat(
      runRequest(threadId, "List files"),
      null,
      fake.instance,
    );
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const final = await waitForFinal(threadId, "completed");
    expect(
      final.parts.map((part: any) => [part.type, part.text ?? part.toolName]),
    ).toEqual([
      ["reasoning", "Let me look."],
      ["text", "Checking files."],
      ["dynamic-tool", "opencode_bash"],
      ["text", "Done."],
    ]);
    expect(final.parts[2]).toEqual(
      expect.objectContaining({
        input: { command: "ls" },
        output: "a.ts\n",
        state: "output-available",
        toolCallId: "call_ls",
      }),
    );
    expect(final.metadata.usage).toEqual(
      expect.objectContaining({ inputTokens: expect.any(Number) }),
    );
    expect(lastState(threadId)).toEqual(
      expect.objectContaining({
        generation: "v1",
        sessionId: expect.stringMatching(/^ses_/),
        syncedMessageId: final.id,
      }),
    );
    expect(setThreadStatus.mock.calls.at(-1)).toEqual([threadId, "idle"]);
  });

  it("keeps one server per instance and resumes the session without replaying the transcript", async () => {
    const fake = await createFakeOpenCode({ generation: 1 });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "First"),
      null,
      fake.instance,
    );
    const first = await waitForFinal(threadId, "completed");
    const state = lastState(threadId);
    const server = getOpenCodeServerPool().peek(fake.instance.id);
    expect(server).not.toBeNull();

    loadThreadMessages.mockImplementation(async () =>
      records([userMessage(threadId, "First"), first]),
    );
    upsertMessage.mockClear();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Second", { suffix: "user-2" }),
      threadWithState(fake, state),
      fake.instance,
    );
    await waitForFinal(threadId, "completed");

    // Same server process, no new session, no transcript in the prompt.
    expect(getOpenCodeServerPool().peek(fake.instance.id)).toBe(server);
    const requests = await fake.requests();
    expect(
      requests.filter((r) => r.method === "POST" && r.path === "/session"),
    ).toHaveLength(1);
    expect(
      requests.filter(
        (r) => r.method === "GET" && r.path === `/session/${state.sessionId}`,
      ),
    ).toHaveLength(1);
    const prompts = await promptBodies(fake, /\/prompt_async$/);
    expect(prompts).toHaveLength(2);
    expect(prompts[1].parts[0].text).toContain("Second");
    expect(prompts[1].parts[0].text).not.toContain("Conversation so far");
    expect(prompts[1].parts[0].text).not.toContain("First");
    expect(lastState(threadId).sessionId).toBe(state.sessionId);
  });

  it("starts a new session with the transcript for state from per-turn builds", async () => {
    const fake = await createFakeOpenCode({ generation: 1 });
    const threadId = nextThreadId();
    loadThreadMessages.mockImplementation(async () =>
      records([
        userMessage(threadId, "Earlier question", "old"),
        {
          id: "old-answer",
          metadata: {},
          parts: [{ text: "Earlier answer", type: "text" }],
          role: "assistant",
        },
      ]),
    );
    await runOpenCodeThreadChat(
      runRequest(threadId, "Next"),
      // Legacy state: no sync mark, a stale plan agent.
      threadWithState(fake, {
        cwd: tempRoot,
        selectedAgent: "plan",
        sessionId: "ses_legacy",
      }),
      fake.instance,
    );
    await waitForFinal(threadId, "completed");

    const requests = await fake.requests();
    expect(requests.some((r) => r.path === "/session/ses_legacy")).toBe(false);
    const [prompt] = await promptBodies(fake, /\/prompt_async$/);
    expect(prompt.parts[0].text).toContain("Earlier answer");
    // The stale plan agent is not reused in chat mode.
    expect(prompt.agent).toBeUndefined();
    expect(lastState(threadId).selectedAgent).toBeNull();
  });

  it("uses the plan agent for plan turns only", async () => {
    const fake = await createFakeOpenCode({ generation: 1 });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Plan it", { threadMode: "plan" }),
      null,
      fake.instance,
    );
    await waitForFinal(threadId, "completed");
    const [prompt] = await promptBodies(fake, /\/prompt_async$/);
    expect(prompt.agent).toBe("plan");
    expect(lastState(threadId).selectedAgent).toBeNull();
  });

  it("puts a tool's permission request on its tool part and replies with the decision", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        prompts: [
          {
            steps: [
              {
                callID: "call_rm",
                input: { command: "rm -rf build" },
                output: "",
                permission: { patterns: ["rm -rf build"], permission: "bash" },
                tool: "bash",
                type: "tool",
              },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Clean"),
      null,
      fake.instance,
    );
    const asked = await waitForPart(
      threadId,
      (part) => part.state === "approval-requested",
    );
    expect(asked).toEqual(
      expect.objectContaining({
        toolCallId: "call_rm",
        toolName: "opencode_bash",
      }),
    );
    expect(
      setThreadStatus.mock.calls.some(
        (call: unknown[]) => call[1] === "awaiting_approval",
      ),
    ).toBe(true);

    await runOpenCodeThreadChat(
      {
        ...runRequest(threadId, ""),
        message: undefined,
        toolApprovalResponse: { approved: true, id: asked.approval.id },
        trigger: "submit-tool-approval",
      },
      null,
      fake.instance,
    );
    const final = await waitForFinal(threadId, "completed");
    expect(final.parts).toEqual([
      expect.objectContaining({
        state: "output-available",
        toolCallId: "call_rm",
      }),
    ]);
    const [reply] = await promptBodies(fake, /^\/permission\/.+\/reply$/);
    expect(reply).toEqual({ reply: "once" });
  });

  it("declines requests at once in unattended runs", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        prompts: [
          {
            steps: [
              {
                callID: "call_edit",
                input: { filePath: "a.ts" },
                permission: { permission: "edit" },
                tool: "edit",
                type: "tool",
              },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Edit", { interactive: false }),
      null,
      fake.instance,
    );
    const final = await waitForFinal(threadId, "completed");
    expect(final.parts[0]).toEqual(
      expect.objectContaining({
        state: "output-denied",
        toolCallId: "call_edit",
      }),
    );
    const [reply] = await promptBodies(fake, /^\/permission\/.+\/reply$/);
    expect(reply).toEqual({ reply: "reject" });
    expect(
      setThreadStatus.mock.calls.some(
        (call: unknown[]) => call[1] === "awaiting_approval",
      ),
    ).toBe(false);
  });

  it("answers questions per question", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        prompts: [
          {
            steps: [
              {
                questions: [
                  {
                    header: "Color",
                    options: [
                      { description: "", label: "Red" },
                      { description: "", label: "Blue" },
                    ],
                    question: "Which color?",
                  },
                ],
                type: "question",
              },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Ask"),
      null,
      fake.instance,
    );
    const asked = await waitForPart(
      threadId,
      (part) => part.toolName === "opencode_ask_question",
    );
    expect(asked.input.questions[0]).toEqual(
      expect.objectContaining({ question: "Which color?" }),
    );
    await runOpenCodeThreadChat(
      {
        ...runRequest(threadId, ""),
        message: undefined,
        toolApprovalResponse: {
          approved: true,
          id: asked.approval.id,
          response: "Blue",
        },
        trigger: "submit-tool-approval",
      },
      null,
      fake.instance,
    );
    await waitForFinal(threadId, "completed");
    const [reply] = await promptBodies(fake, /^\/question\/.+\/reply$/);
    expect(reply).toEqual({ answers: [["Blue"]] });
  });

  it("runs a server command for `/name args`", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        commands: [
          { hints: [], name: "review", template: "Review $ARGUMENTS" },
        ],
        prompts: [
          { match: "/review", steps: [{ text: "Reviewed.", type: "text" }] },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "/review src"),
      null,
      fake.instance,
    );
    const final = await waitForFinal(threadId, "completed");
    expect(final.parts[0]).toEqual(
      expect.objectContaining({ text: "Reviewed." }),
    );
    const [command] = await promptBodies(fake, /\/command$/);
    expect(command).toEqual(
      expect.objectContaining({ arguments: "src", command: "review" }),
    );
    expect(await promptBodies(fake, /\/prompt_async$/)).toHaveLength(0);
  });

  it("surfaces session.error data.message and treats aborts as stops", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: {
        prompts: [
          {
            match: "fail",
            steps: [{ message: "Provider exploded", type: "error" }],
          },
          { steps: [{ type: "hang" }] },
        ],
      },
    });
    const failing = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(failing, "fail"),
      null,
      fake.instance,
    );
    const failed = await waitForFinal(failing, "error");
    expect(failed.metadata.errorMessage).toContain("Provider exploded");

    const hanging = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(hanging, "wait"),
      null,
      fake.instance,
    );
    await waitUntil(
      async () =>
        (await fake.requests()).filter((r) => r.path.endsWith("/prompt_async"))
          .length === 2,
      "second prompt",
    );
    await stopOpenCodeThreadRun(runRequest(hanging, ""), null);
    await waitForFinal(hanging, "cancelled");
    expect((await fake.requests()).some((r) => r.path.endsWith("/abort"))).toBe(
      true,
    );
  });

  it("fails the run when the server exits mid-run and starts a new one next turn", async () => {
    const fake = await createFakeOpenCode({
      generation: 1,
      scenario: { prompts: [{ steps: [{ type: "hang" }] }] },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Hang"),
      null,
      fake.instance,
    );
    await waitUntil(
      async () =>
        (await fake.requests()).some((r) => r.path.endsWith("/prompt_async")),
      "prompt",
    );
    const server = getOpenCodeServerPool().peek(fake.instance.id)!;
    server.close();
    const failed = await waitForFinal(threadId, "error");
    expect(failed.metadata.errorMessage).toMatch(
      /server exited unexpectedly|event stream ended/,
    );
    await waitUntil(
      () => getOpenCodeServerPool().peek(fake.instance.id) === null,
      "pool drop",
    );
  });
});

describe("runOpenCodeThreadChat on OpenCode 2.x", () => {
  it("settles on session.execution.succeeded and records the v2 session", async () => {
    const fake = await createFakeOpenCode({
      generation: 2,
      scenario: {
        prompts: [
          {
            steps: [
              { text: ["Thinking"], type: "reasoning" },
              {
                callID: "call_read",
                input: { filePath: "a.ts" },
                output: "contents",
                tool: "read",
                type: "tool",
              },
              { text: ["All ", "good."], type: "text" },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Read"),
      null,
      fake.instance,
    );
    const final = await waitForFinal(threadId, "completed");
    expect(
      final.parts.map((part: any) => [part.type, part.text ?? part.toolName]),
    ).toEqual([
      ["reasoning", "Thinking"],
      ["dynamic-tool", "opencode_read"],
      ["text", "All good."],
    ]);
    expect(final.parts[1]).toEqual(
      expect.objectContaining({
        output: "contents",
        state: "output-available",
      }),
    );
    expect(final.metadata.model.responseModelId).toBe(
      "anthropic/claude-sonnet-4-5",
    );
    expect(lastState(threadId)).toEqual(
      expect.objectContaining({ generation: "v2", syncedMessageId: final.id }),
    );
    const [created] = await promptBodies(fake, /^\/api\/session$/);
    expect(created).toEqual(
      expect.objectContaining({
        location: { directory: tempRoot },
        model: { id: "claude-sonnet-4-5", providerID: "anthropic" },
      }),
    );
  });

  it("resumes the session, switches the model and restores the agent after a plan turn", async () => {
    const fake = await createFakeOpenCode({ generation: 2 });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "First"),
      null,
      fake.instance,
    );
    const first = await waitForFinal(threadId, "completed");
    const state = lastState(threadId);
    loadThreadMessages.mockImplementation(async () =>
      records([userMessage(threadId, "First"), first]),
    );
    upsertMessage.mockClear();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Plan next", {
        modelId: "anthropic/claude-haiku-4-5",
        suffix: "user-2",
        threadMode: "plan",
      }),
      threadWithState(fake, state),
      fake.instance,
    );
    await waitForFinal(threadId, "completed");

    expect(await promptBodies(fake, /^\/api\/session$/)).toHaveLength(1);
    expect(await promptBodies(fake, /\/model$/)).toEqual([
      { model: { id: "claude-haiku-4-5", providerID: "anthropic" } },
    ]);
    await waitUntil(
      async () => (await promptBodies(fake, /\/agent$/)).length === 2,
      "agent restore",
    );
    expect(await promptBodies(fake, /\/agent$/)).toEqual([
      { agent: "plan" },
      { agent: "build" },
    ]);
    const prompts = await promptBodies(fake, /\/prompt$/);
    expect(prompts[1].text).not.toContain("Conversation so far");
  });

  it("drops a session of the other generation and replays the transcript", async () => {
    const fake = await createFakeOpenCode({ generation: 2 });
    const threadId = nextThreadId();
    loadThreadMessages.mockImplementation(async () =>
      records([
        userMessage(threadId, "Old question", "old"),
        {
          id: "old-answer",
          metadata: {},
          parts: [{ text: "Old answer", type: "text" }],
          role: "assistant",
        },
      ]),
    );
    await runOpenCodeThreadChat(
      runRequest(threadId, "Again"),
      threadWithState(fake, {
        cwd: tempRoot,
        generation: "v1",
        sessionId: "ses_from_v1",
        syncedMessageId: "old-answer",
      }),
      fake.instance,
    );
    await waitForFinal(threadId, "completed");
    const requests = await fake.requests();
    expect(requests.some((r) => r.path.includes("ses_from_v1"))).toBe(false);
    const [prompt] = await promptBodies(fake, /\/prompt$/);
    expect(prompt.text).toContain("Old answer");
  });

  it("turns forms into question cards and replies with the typed answer", async () => {
    const fake = await createFakeOpenCode({
      generation: 2,
      scenario: {
        prompts: [
          {
            steps: [
              {
                fields: [
                  {
                    key: "env",
                    options: [
                      { label: "Staging", value: "staging" },
                      { label: "Production", value: "prod" },
                    ],
                    title: "Environment",
                    type: "string",
                  },
                ],
                title: "Deploy",
                type: "form",
              },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Deploy"),
      null,
      fake.instance,
    );
    const asked = await waitForPart(
      threadId,
      (part) => part.toolName === "opencode_ask_question",
    );
    expect(asked.input).toEqual(
      expect.objectContaining({
        questions: [
          expect.objectContaining({ id: "env", question: "Environment" }),
        ],
        title: "Deploy",
      }),
    );
    await runOpenCodeThreadChat(
      {
        ...runRequest(threadId, ""),
        message: undefined,
        toolApprovalResponse: {
          approved: true,
          id: asked.approval.id,
          response: "Production",
        },
        trigger: "submit-tool-approval",
      },
      null,
      fake.instance,
    );
    await waitForFinal(threadId, "completed");
    const [reply] = await promptBodies(fake, /\/form\/.+\/reply$/);
    expect(reply).toEqual({ answer: { env: "prod" } });
  });

  it("cancels forms and rejects permissions in unattended runs", async () => {
    const fake = await createFakeOpenCode({
      generation: 2,
      scenario: {
        prompts: [
          {
            steps: [
              {
                fields: [{ key: "x", type: "string" }],
                title: "Q",
                type: "form",
              },
              {
                callID: "call_sh",
                input: { command: "make" },
                permission: { permission: "shell" },
                tool: "bash",
                type: "tool",
              },
            ],
          },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Go", { interactive: false }),
      null,
      fake.instance,
    );
    await waitForFinal(threadId);
    const requests = await fake.requests();
    expect(
      requests.some((r) => r.method === "DELETE" && /\/form\//.test(r.path)),
    ).toBe(true);
    const [reply] = await promptBodies(fake, /\/permission\/.+\/reply$/);
    expect(reply).toEqual(
      expect.objectContaining({
        decision: "reject",
        message: expect.any(String),
      }),
    );
  });

  it("interrupts on stop and ends as cancelled", async () => {
    const fake = await createFakeOpenCode({
      generation: 2,
      scenario: {
        prompts: [
          { steps: [{ text: "Working", type: "text" }, { type: "hang" }] },
        ],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Go"),
      null,
      fake.instance,
    );
    await waitForPart(threadId, (part) => part.text === "Working");
    await stopOpenCodeThreadRun(runRequest(threadId, ""), null);
    const final = await waitForFinal(threadId, "cancelled");
    expect(final.parts[0]).toEqual(
      expect.objectContaining({ text: "Working" }),
    );
    expect(
      (await fake.requests()).some((r) => r.path.endsWith("/interrupt")),
    ).toBe(true);
  });

  it("fails with the execution's error", async () => {
    const fake = await createFakeOpenCode({
      generation: 2,
      scenario: {
        prompts: [{ steps: [{ message: "Model overloaded", type: "error" }] }],
      },
    });
    const threadId = nextThreadId();
    await runOpenCodeThreadChat(
      runRequest(threadId, "Go"),
      null,
      fake.instance,
    );
    const final = await waitForFinal(threadId, "error");
    expect(final.metadata.errorMessage).toContain("Model overloaded");
  });
});

describe("resolveOpenCodeSessionError", () => {
  it("reads data.message from the SDK error union and flags aborts", () => {
    expect(
      resolveOpenCodeSessionError({
        error: { data: { message: "Rate limited" }, name: "APIError" },
      }),
    ).toEqual({
      aborted: false,
      contextOverflow: false,
      message: "Rate limited",
    });
    expect(
      resolveOpenCodeSessionError({
        error: { data: { message: "Aborted" }, name: "MessageAbortedError" },
      }).aborted,
    ).toBe(true);
  });

  it("flags ContextOverflowError as possibly recoverable", () => {
    expect(
      resolveOpenCodeSessionError({
        error: { data: { message: "Too long" }, name: "ContextOverflowError" },
      }).contextOverflow,
    ).toBe(true);
  });

  it("falls back to a generic message when there is no error payload", () => {
    expect(resolveOpenCodeSessionError({}).message).toBe(
      "OpenCode run failed.",
    );
  });
});
