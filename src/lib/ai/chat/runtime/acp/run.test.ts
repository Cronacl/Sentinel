import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { setupAcpRunHarness, toolParts } from "./__tests__/run-harness";

// The ACP runtime end to end against the mock ACP agent over real stdio
// (approvals, stop, crashes, session continuity, client fs, terminals and
// elicitations). Cursor's own extensions are tested in runtime/cursor.

const h = await setupAcpRunHarness();
const { UNATTENDED_DECLINE_MESSAGE } = await import("../unattended");

type Scenario = Parameters<typeof h.instanceFor>[0];

const descriptor = h.support.mockDescriptor({ cancelGraceMs: 1_000 });

beforeEach(() => h.reset());
afterEach(() => h.cleanup());
afterAll(() => h.removeDirs());

const run = (
  scenario: Scenario,
  text: string,
  extra: Record<string, unknown> = {},
  instance = h.instanceFor(scenario),
) => h.run(descriptor, scenario, text, extra, instance);

const signedIn = (): Scenario => ({ ...h.cursorProfile(), auth: undefined });

const awaitingUser = () =>
  h.waitFor(() => h.store.thread?.status === "awaiting_approval", "a question");

describe("runAcpThreadChat", () => {
  it("streams thoughts, text and tools in order and finishes the turn", async () => {
    await run(
      {
        prompts: [
          {
            steps: [
              { text: "Looking.", type: "thought" },
              { text: "Let me read it. ", type: "text" },
              {
                kind: "read",
                locations: [{ path: "/w/README.md" }],
                status: "pending",
                title: "Read README.md",
                toolCallId: "r1",
                type: "toolCall",
              },
              { status: "completed", toolCallId: "r1", type: "toolCallUpdate" },
              { text: "Done.", type: "text" },
            ],
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ],
      },
      "hello",
    );
    const message = await h.waitFor(h.finished, "the turn to finish");

    expect(message.metadata?.status).toBe("completed");
    expect(message.metadata?.finishReason).toBe("stop");
    expect(message.parts.map((part) => part.type)).toEqual([
      "reasoning",
      "text",
      "dynamic-tool",
      "text",
    ]);
    expect(toolParts(message)[0]).toEqual(
      expect.objectContaining({
        state: "output-available",
        toolName: "cursor_read",
      }),
    );
    expect(message.metadata?.usage).toEqual(
      expect.objectContaining({ outputTokens: 5, totalTokens: 15 }),
    );
    expect(h.store.thread?.status).toBe("idle");
    expect(h.store.thread?.activeStreamId).toBeNull();
    await h.waitFor(() => h.drains.length > 0, "the follow-up queue drain");
    const events = h.eventTypes();
    expect(events[0]).toBe("thread.snapshot");
    expect(events).toContain("run.started");
    expect(events.at(-1)).toBe("run.finished");
  });

  it("maps the stop reason (max_tokens → length)", async () => {
    await run(
      {
        prompts: [
          { stopReason: "max_tokens", steps: [{ text: "x", type: "text" }] },
        ],
      },
      "go",
    );
    expect((await h.waitFor(h.finished, "finish")).metadata?.finishReason).toBe(
      "length",
    );
  });

  it("asks for approval and answers with the option the user's decision selects", async () => {
    const instance = await run(h.cursorProfile(), "edit please");
    await awaitingUser();
    const pending = h
      .toolParts(h.assistant())
      .find((part) => part.state === "approval-requested");
    expect(pending?.callProviderMetadata.sentinel.permissionOptions).toEqual([
      { kind: "allow_once", name: "Allow", optionId: "allow-once" },
      { kind: "allow_always", name: "Always allow", optionId: "allow-always" },
      { kind: "reject_once", name: "Reject", optionId: "reject-once" },
    ]);

    await h.submit(descriptor, instance, {
      approved: true,
      decision: "acceptForSession",
    });
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("completed");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "allow-always", outcome: "selected" },
    });
    expect(
      toolParts(message).find((part) => part.toolCallId === "cursor-edit-1")
        ?.state,
    ).toBe("output-available");
  });

  it("declining keeps the call denied even when the agent reports it failed", async () => {
    const instance = await run(h.cursorProfile(), "edit please");
    await awaitingUser();
    await h.submit(descriptor, instance, { approved: false });
    const message = await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "reject-once", outcome: "selected" },
    });
    expect(
      toolParts(message).find((part) => part.toolCallId === "cursor-edit-1")
        ?.state,
    ).toBe("output-denied");
  });

  it("approves on its own under full access", async () => {
    h.settings.permissionMode = "full";
    const instance = await run(h.cursorProfile(), "edit please");
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "allow-once", outcome: "selected" },
    });
  });

  const editPermission = (toolCall: Record<string, unknown>): Scenario => ({
    prompts: [{ steps: [{ toolCall, type: "requestPermission" }] }],
  });

  it("approves an edit inside the workspace on its own under accept_edits", async () => {
    h.settings.permissionMode = "accept_edits";
    const instance = await run(
      editPermission({
        content: [
          {
            newText: "b",
            oldText: "a",
            path: path.join(h.settings.workspaceDir, "a.md"),
            type: "diff",
          },
        ],
        kind: "edit",
        title: "Edit a.md",
        toolCallId: "w1",
      }),
      "edit",
    );
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "allow-once", outcome: "selected" },
    });
  });

  it("asks under accept_edits before an edit outside the workspace", async () => {
    h.settings.permissionMode = "accept_edits";
    const instance = await run(
      editPermission({
        content: [
          { newText: "x", oldText: null, path: "/etc/hosts", type: "diff" },
        ],
        kind: "edit",
        title: "Edit /etc/hosts",
        toolCallId: "w2",
      }),
      "edit",
    );
    await awaitingUser();
    await h.submit(descriptor, instance, { approved: false });
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "reject-once", outcome: "selected" },
    });
  });

  it("asks under accept_edits before an edit naming no file (Cursor's deletes)", async () => {
    h.settings.permissionMode = "accept_edits";
    const instance = await run(
      editPermission({
        kind: "edit",
        status: "pending",
        title: "Delete `a.md`",
        toolCallId: "w3",
      }),
      "delete",
    );
    await awaitingUser();
    await h.submit(descriptor, instance, {
      approved: true,
      decision: "accept",
    });
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "allow-once", outcome: "selected" },
    });
  });

  it("declines at once in an unattended run", async () => {
    const instance = await run(signedIn(), "edit please", {
      interactive: false,
    });
    const message = await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "reject-once", outcome: "selected" },
    });
    expect(
      toolParts(message).find((part) => part.toolCallId === "cursor-edit-1"),
    ).toEqual(
      expect.objectContaining({
        approval: expect.objectContaining({
          approved: false,
          reason: UNATTENDED_DECLINE_MESSAGE,
        }),
        state: "output-denied",
      }),
    );
  });

  it("rejects an approval for a request that is no longer pending", async () => {
    await expect(
      h.runAcpThreadChat(
        descriptor,
        {
          ...h.request(""),
          message: undefined,
          toolApprovalResponse: { approved: true, id: "nope" },
          trigger: "submit-tool-approval",
        },
        null,
        h.instanceFor({}),
      ),
    ).rejects.toThrow(/no longer active/);
  });

  it("reports that the user must sign in instead of hanging an unattended run", async () => {
    await run(h.cursorProfile(), "hello", { interactive: false });
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toContain("signed out");
  });
});

describe("stop", () => {
  const stop = () =>
    h.stopAcpThreadRun(
      descriptor,
      { ...h.request(""), trigger: "stop-stream" },
      h.store.thread as never,
    );

  it("sends session/cancel as a notification and ends the turn cancelled", async () => {
    const instance = await run(
      {
        prompts: [
          {
            steps: [
              { text: "working", type: "text" },
              { type: "waitForCancel" },
            ],
          },
        ],
      },
      "go",
    );
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );

    expect((await stop()).status).toBe(204);
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("cancelled");
    expect(h.agentRequests(instance.logPath, "session/cancel")).toEqual([
      expect.objectContaining({ kind: "notification" }),
    ]);
    expect(h.eventTypes().at(-1)).toBe("run.cancelled");
    // The process survives a cancel for the next turn.
    expect(
      h
        .getAcpProcessPool()
        .peek(h.acpPoolKey(instance.id, "thread-1"))
        ?.isAlive(),
    ).toBe(true);
  });

  it("ends the turn cancelled even when the agent answers end_turn to the cancel", async () => {
    const instance = await run(
      {
        cancel: { stopReason: "end_turn" },
        prompts: [{ steps: [{ type: "waitForCancel" }] }],
      },
      "go",
    );
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );
    await stop();
    expect((await h.waitFor(h.finished, "finish")).metadata?.status).toBe(
      "cancelled",
    );
  });

  it("answers a pending approval as cancelled when the user stops", async () => {
    const instance = await run(h.cursorProfile(), "edit please");
    await awaitingUser();
    await stop();
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("cancelled");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("kills an agent that ignores the cancel and still ends the turn", async () => {
    const instance = await run(
      { prompts: [{ steps: [{ ignoreCancel: true, type: "hang" }] }] },
      "go",
    );
    await h.waitFor(
      () => h.agentRequests(instance.logPath, "session/prompt").length > 0,
      "prompt",
    );
    await stop();
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("cancelled");
    expect(
      h.getAcpProcessPool().peek(h.acpPoolKey(instance.id, "thread-1")),
    ).toBeNull();
  });
});

describe("crashes", () => {
  it("fails the turn with the agent's stderr and replaces the process next turn", async () => {
    const scenario: Scenario = {
      prompts: [
        {
          // Only this turn's own request (not the history sent later).
          match: "request:\ncrash",
          steps: [{ code: 9, stderr: "fatal: model gone", type: "exit" }],
        },
        { steps: [{ text: "back", type: "text" }] },
      ],
    };
    const instance = await run(scenario, "crash now");
    const failed = await h.waitFor(h.finished, "finish");
    expect(failed.metadata?.status).toBe("error");
    expect(failed.metadata?.errorMessage).toContain("fatal: model gone");
    expect(
      h.getAcpProcessPool().peek(h.acpPoolKey(instance.id, "thread-1")),
    ).toBeNull();

    await run(scenario, "again", {}, instance);
    await h.waitFor(
      () => h.assistant()?.id !== failed.id && h.finished(),
      "the second turn",
    );
    expect(h.assistant()?.metadata?.status).toBe("completed");
    // The session never finished a turn, so it gets the transcript again.
    const prompts = h.agentRequests(instance.logPath, "session/prompt");
    expect(
      (prompts.at(-1) as { params: { prompt: Array<{ text?: string }> } })
        .params.prompt[0]?.text,
    ).toContain("USER:\ncrash now");
  });

  it("drops the process when the agent loses its sign-in mid-session", async () => {
    const instance = await run(
      {
        prompts: [
          { error: { code: -32000, message: "Authentication required" } },
        ],
      },
      "go",
    );
    const failed = await h.waitFor(h.finished, "finish");
    expect(failed.metadata?.status).toBe("error");
    // The next turn starts a process that signs in again when asked.
    expect(
      h.getAcpProcessPool().peek(h.acpPoolKey(instance.id, "thread-1")),
    ).toBeNull();
  });

  it("fails a turn whose agent crashes while starting", async () => {
    await run({ faults: { exitAfterMs: 0, exitCode: 4 } }, "go");
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toContain("exited unexpectedly");
  });
});

describe("session continuity", () => {
  function promptTexts(logPath: string) {
    return h
      .agentRequests(logPath, "session/prompt")
      .map(
        (entry) =>
          (entry as { params: { prompt: Array<{ text?: string }> } }).params
            .prompt[0]?.text ?? "",
      );
  }

  it("never sends the transcript to a loaded session, and sends it once to a new one", async () => {
    const scenario: Scenario = {
      session: { ids: ["s-1"], load: { knownSessionIds: ["s-1"] } },
    };
    const instance = await run(scenario, "first question");
    await h.waitFor(h.finished, "turn 1");
    expect(promptTexts(instance.logPath).at(-1)).not.toContain(
      "Conversation so far",
    );

    // Same process: the live session is reused.
    await run(scenario, "second question", {}, instance);
    await h.waitFor(() => h.store.order.length === 4 && h.finished(), "turn 2");
    expect(promptTexts(instance.logPath).at(-1)).not.toContain(
      "Conversation so far",
    );
    expect(h.agentRequests(instance.logPath, "session/new")).toHaveLength(1);

    // A new process loads the persisted session: still no history.
    await h.getAcpProcessPool().disposeAll();
    await run(scenario, "third question", {}, instance);
    await h.waitFor(() => h.store.order.length === 6 && h.finished(), "turn 3");
    expect(h.agentRequests(instance.logPath, "session/load")).toHaveLength(1);
    expect(promptTexts(instance.logPath).at(-1)).not.toContain(
      "Conversation so far",
    );

    // The agent lost the session: the new one gets the transcript, once.
    const forgetful = h.instanceFor({
      session: { ids: ["s-2"], load: { knownSessionIds: [] } },
    });
    await run({}, "fourth question", {}, forgetful);
    await h.waitFor(() => h.store.order.length === 8 && h.finished(), "turn 4");
    const text = promptTexts(forgetful.logPath).at(-1) ?? "";
    expect(text).toContain("Conversation so far");
    expect(text.match(/first question/g)).toHaveLength(1);
  });

  it("sends a loaded session the turns another engine answered, once", async () => {
    const scenario: Scenario = {
      session: { ids: ["s-1"], load: { knownSessionIds: ["s-1"] } },
    };
    const instance = await run(scenario, "first question");
    await h.waitFor(h.finished, "turn 1");
    h.addForeignTurn("claude question", "claude answer");

    await h.getAcpProcessPool().disposeAll();
    await run(scenario, "third question", {}, instance);
    await h.waitFor(() => h.store.order.length === 6 && h.finished(), "turn 2");
    expect(h.agentRequests(instance.logPath, "session/load")).toHaveLength(1);
    const text = promptTexts(instance.logPath).at(-1) ?? "";
    expect(text).toContain("Conversation since your last reply");
    expect(text).toContain("USER:\nclaude question");
    expect(text).toContain("ASSISTANT:\nclaude answer");
    expect(text).not.toContain("first question");

    await run(scenario, "fourth question", {}, instance);
    await h.waitFor(() => h.store.order.length === 8 && h.finished(), "turn 3");
    expect(promptTexts(instance.logPath).at(-1)).not.toContain(
      "claude question",
    );
  });

  it("replaces the session, with the transcript, when an edit drops turns it holds", async () => {
    const scenario: Scenario = {
      session: {
        ids: ["s-1", "s-2"],
        load: { knownSessionIds: ["s-1", "s-2"] },
      },
    };
    const instance = await run(scenario, "first question");
    await h.waitFor(h.finished, "turn 1");
    await run(scenario, "second question", {}, instance);
    await h.waitFor(() => h.store.order.length === 4 && h.finished(), "turn 2");

    await run(
      scenario,
      "second question, edited",
      { messageId: h.store.order[2], trigger: "edit-user-message" },
      instance,
    );
    await h.waitFor(() => h.store.order.length === 6 && h.finished(), "edit");
    expect(h.agentRequests(instance.logPath, "session/new")).toHaveLength(2);
    const text = promptTexts(instance.logPath).at(-1) ?? "";
    expect(text).toContain("Conversation so far");
    expect(text).toContain("USER:\nfirst question");
    expect(text).not.toContain("USER:\nsecond question");
  });

  it("reloads a live session when the user's MCP servers changed", async () => {
    const scenario: Scenario = {
      session: { ids: ["s-1"], load: { knownSessionIds: ["s-1"] } },
    };
    const instance = await run(scenario, "first question");
    await h.waitFor(h.finished, "turn 1");
    h.settings.mcpServers = [
      {
        config: {
          args: [],
          command: "mcp-server",
          envPassthrough: [],
          envVars: [],
        },
        id: "1",
        isEnabled: true,
        name: "Tools",
        transport: "stdio",
      },
    ];
    await run(scenario, "second question", {}, instance);
    await h.waitFor(() => h.store.order.length === 4 && h.finished(), "turn 2");
    const loads = h.agentRequests(instance.logPath, "session/load");
    expect(loads).toHaveLength(1);
    expect(
      (loads[0] as { params: { mcpServers: unknown } }).params.mcpServers,
    ).toEqual([{ args: [], command: "mcp-server", env: [], name: "Tools" }]);
    expect(promptTexts(instance.logPath).at(-1)).not.toContain(
      "Conversation so far",
    );
  });
});

describe("client fs, terminals and elicitations", () => {
  const capable = h.support.mockDescriptor({
    cancelGraceMs: 1_000,
    clientFs: true,
    clientTerminals: true,
  });

  const runWith = (scenario: Scenario, text: string) =>
    h.run(capable, scenario, text);

  function echoedText(message: ThreadUIMessage) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("");
  }

  it("reads workspace files and refuses paths outside the workspace", async () => {
    await writeFile(
      path.join(h.settings.workspaceDir, "a.md"),
      "one\ntwo\nthree\n",
    );
    await runWith(
      {
        prompts: [
          {
            steps: [
              {
                echo: true,
                line: 2,
                limit: 1,
                op: "read",
                path: path.join(h.settings.workspaceDir, "a.md"),
                type: "clientFs",
              },
              { echo: true, op: "read", path: "/etc/hosts", type: "clientFs" },
            ],
          },
        ],
      },
      "read",
    );
    const text = echoedText(await h.waitFor(h.finished, "finish"));
    expect(text).toContain('"content":"two"');
    expect(text).toContain("outside the workspace");
  });

  it("asks before the agent writes a file, then writes it atomically", async () => {
    // Paths come back resolved (macOS temp dirs live under /private).
    const target = path.join(
      realpathSync(h.settings.workspaceDir),
      "out",
      "b.txt",
    );
    const instance = await runWith(
      {
        prompts: [
          {
            steps: [
              { content: "hello", op: "write", path: target, type: "clientFs" },
            ],
          },
        ],
      },
      "write",
    );
    await awaitingUser();
    const gate = await h.submit(capable, instance, {
      approved: true,
      decision: "accept",
    });
    expect(gate.callProviderMetadata.sentinel).toEqual(
      expect.objectContaining({
        kind: "edit",
        preview: { diffs: [{ newText: "hello", oldText: null, path: target }] },
      }),
    );
    await h.waitFor(h.finished, "finish");
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("refuses a write the user declines", async () => {
    const target = path.join(h.settings.workspaceDir, "no.txt");
    const instance = await runWith(
      {
        prompts: [
          {
            steps: [
              { content: "x", op: "write", path: target, type: "clientFs" },
            ],
          },
        ],
      },
      "write",
    );
    await awaitingUser();
    await h.submit(capable, instance, { approved: false });
    await h.waitFor(h.finished, "finish");
    await expect(readFile(target, "utf8")).rejects.toBeDefined();
  });

  it("runs a terminal command once approved and returns its output", async () => {
    const instance = await runWith(
      {
        prompts: [
          {
            steps: [
              {
                args: ["-c", "echo terminal-output"],
                command: "/bin/sh",
                echo: true,
                type: "clientTerminal",
              },
            ],
          },
        ],
      },
      "run it",
    );
    await awaitingUser();
    await h.submit(capable, instance, { approved: true, decision: "accept" });
    const text = echoedText(await h.waitFor(h.finished, "finish"));
    expect(text).toContain("terminal-output");
  });

  it("maps a form elicitation to the question card and answers with its content", async () => {
    const instance = await runWith(
      {
        prompts: [
          {
            steps: [
              {
                echo: true,
                message: "Pick an environment",
                mode: "form",
                requestedSchema: {
                  properties: {
                    env: {
                      oneOf: [
                        { const: "dev", title: "Development" },
                        { const: "prod", title: "Production" },
                      ],
                      title: "Environment",
                      type: "string",
                    },
                  },
                  required: ["env"],
                  type: "object",
                },
                type: "elicitation",
              },
            ],
          },
        ],
      },
      "elicit",
    );
    await awaitingUser();
    expect(
      h
        .toolParts(h.assistant())
        .find((part) => part.state === "approval-requested")
        ?.callProviderMetadata.sentinel.kind,
    ).toBe("user_input");
    await h.submit(capable, instance, {
      approved: true,
      response: "Production",
    });
    const text = echoedText(await h.waitFor(h.finished, "finish"));
    expect(text).toContain('"action":"accept"');
    expect(text).toContain('"env":"prod"');
  });

  it("offers a sign-in link and answers accept once the user is done", async () => {
    const instance = await runWith(
      {
        prompts: [
          {
            steps: [
              {
                complete: true,
                echo: true,
                elicitationId: "e1",
                message: "Sign in",
                mode: "url",
                type: "elicitation",
                url: "https://example.com/login",
              },
            ],
          },
        ],
      },
      "sign in",
    );
    await awaitingUser();
    const link = h
      .toolParts(h.assistant())
      .find((part) => part.state === "approval-requested");
    expect(link?.callProviderMetadata.sentinel.kind).toBe("auth_link");
    expect(link?.input).toEqual({
      message: "Sign in",
      url: "https://example.com/login",
    });
    await h.submit(capable, instance, { approved: true, decision: "accept" });
    const text = echoedText(await h.waitFor(h.finished, "finish"));
    expect(text).toContain('"action":"accept"');
  });
});
