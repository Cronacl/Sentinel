import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { setupAcpRunHarness, toolParts } from "../acp/__tests__/run-harness";

// Cursor's ACP extensions on the shared runtime, against the mock agent
// playing Cursor's recorded wire traits (scripts/fixtures/agents/acp
// cursorProfile): cursor/ask_question, cursor/create_plan and
// cursor/update_todos; Cursor's own permission policy.

const h = await setupAcpRunHarness();
const { cursorAcpAgent } =
  await import("@/lib/ai/chat/engines/acp/agents/cursor");
const { UNATTENDED_DECLINE_MESSAGE } = await import("../unattended");

/** Cursor's descriptor, launching the mock agent instead of `agent acp`. */
const descriptor = h.support.mockDescriptor({
  cancelGraceMs: 1_000,
  clientCapabilitiesMeta: cursorAcpAgent.clientCapabilitiesMeta,
  extNotifications: cursorAcpAgent.extNotifications,
  extRequests: cursorAcpAgent.extRequests,
  permissionDisposition: cursorAcpAgent.permissionDisposition,
});

beforeEach(() => h.reset());
afterEach(() => h.cleanup());
afterAll(() => h.removeDirs());

const signedIn = () => ({ ...h.cursorProfile(), auth: undefined });
/** Cursor's profile with a turn that needs no approval. */
const plainTurn = (profile = h.cursorProfile()) => ({
  ...profile,
  prompts: [{ steps: [{ text: "hi", type: "text" as const }] }],
});

describe("Cursor extensions", () => {
  it("asks every cursor/ask_question question and answers with option ids", async () => {
    const instance = await h.run(
      descriptor,
      h.cursorProfile(),
      "a question for you",
    );
    await h.waitFor(
      () => h.store.thread?.status === "awaiting_approval",
      "question",
    );
    const question = toolParts(h.assistant()).find(
      (part) => part.toolName === "cursor_ask_question",
    );
    expect(question?.callProviderMetadata.sentinel.kind).toBe("user_input");
    expect(
      question?.input.questions.map((entry: { id: string }) => entry.id),
    ).toEqual(["db", "extras"]);

    await h.submit(descriptor, instance, {
      approved: true,
      response: "Which database?: SQLite\nExtras?: Auth, Cache",
    });
    const message = await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: {
        answers: [
          { questionId: "db", selectedOptionIds: ["sqlite"] },
          { questionId: "extras", selectedOptionIds: ["auth", "cache"] },
        ],
        outcome: "answered",
      },
    });
    expect(
      toolParts(message).find((part) => part.toolName === "cursor_ask_question")
        ?.state,
    ).toBe("output-available");
  });

  it("skips Cursor's questions at once in an unattended run", async () => {
    const instance = await h.run(descriptor, signedIn(), "a question for you", {
      interactive: false,
    });
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { outcome: "skipped", reason: UNATTENDED_DECLINE_MESSAGE },
    });
  });

  it("shows cursor/create_plan and cursor/update_todos as plan cards", async () => {
    const instance = await h.run(descriptor, h.cursorProfile(), "make a plan");
    const message = await h.waitFor(h.finished, "finish");
    const cards = toolParts(message);
    expect(cards.map((part) => part.toolName)).toEqual([
      "create_plan",
      "update_plan",
    ]);
    expect(cards[0]?.output).toEqual(
      expect.objectContaining({
        document: "# Plan\n\n1. Split\n2. Test",
        title: "Refactor",
      }),
    );
    expect(
      cards[1]?.output.tasks.map((task: { status: string }) => task.status),
    ).toEqual(["in_progress", "pending"]);
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { outcome: "accepted" },
    });
  });

  it("asks before a web search, which Cursor requests as kind search", async () => {
    const instance = await h.run(
      descriptor,
      {
        ...signedIn(),
        prompts: [
          {
            steps: [
              {
                options: [
                  {
                    kind: "allow_once",
                    name: "Allow once",
                    optionId: "allow-once",
                  },
                  {
                    kind: "allow_always",
                    name: "Allow always",
                    optionId: "allow-always",
                  },
                  {
                    kind: "reject_once",
                    name: "Reject",
                    optionId: "reject-once",
                  },
                ],
                toolCall: {
                  kind: "search",
                  status: "pending",
                  title: "Web search: sentinel acp",
                  toolCallId: "web_search_1",
                },
                type: "requestPermission",
              },
            ],
          },
        ],
      },
      "search the web",
    );
    await h.waitFor(
      () => h.store.thread?.status === "awaiting_approval",
      "the approval",
    );
    await h.submit(descriptor, instance, { approved: false });
    await h.waitFor(h.finished, "finish");
    expect(h.clientResponses(instance.logPath)).toContainEqual({
      outcome: { optionId: "reject-once", outcome: "selected" },
    });
  });

  it("authenticates with cursor_login only when the session asks for it", async () => {
    const signedOut = await h.run(descriptor, plainTurn(), "hello");
    await h.waitFor(h.finished, "finish");
    expect(h.agentRequests(signedOut.logPath, "authenticate")).toEqual([
      expect.objectContaining({ params: { methodId: "cursor_login" } }),
    ]);

    h.reset();
    const already = await h.run(descriptor, plainTurn(signedIn()), "hello");
    await h.waitFor(h.finished, "finish");
    expect(h.agentRequests(already.logPath, "authenticate")).toEqual([]);
  });

  it("sends Cursor's parameterized model picker capability", async () => {
    const instance = await h.run(descriptor, plainTurn(signedIn()), "hello");
    await h.waitFor(h.finished, "finish");
    expect(h.agentRequests(instance.logPath, "initialize")[0]).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          clientCapabilities: expect.objectContaining({
            _meta: { parameterizedModelPicker: true },
          }),
        }),
      }),
    );
  });
});
