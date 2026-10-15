import { writeFile } from "node:fs/promises";
import path from "node:path";

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
// cursorProfile): cursor/ask_question, cursor/create_plan, and the
// cursor/update_todos, cursor/task and cursor/generate_image requests;
// Cursor's own permission policy.

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
    // cursor/update_todos arrives as a request (Cursor's extMethod): answered.
    expect(h.clientResponses(instance.logPath)).toContainEqual({});
  });

  it("serves cursor/task, cursor/generate_image and merged todos as the requests Cursor sends", async () => {
    const image = path.join(h.settings.workspaceDir, "cat.png");
    await writeFile(image, Buffer.from("89504e470d0a1a0a", "hex"));
    const todos = (merge: boolean, todo: Record<string, string>) => ({
      method: "cursor/update_todos",
      params: { merge, todos: [todo], toolCallId: "t1" },
      type: "extRequest" as const,
    });
    const instance = await h.run(
      descriptor,
      {
        ...signedIn(),
        prompts: [
          {
            steps: [
              {
                kind: "other",
                status: "pending",
                title: "Task",
                toolCallId: "task-1",
                type: "toolCall",
              },
              {
                method: "cursor/task",
                params: {
                  agentId: "sub-1",
                  description: "Explore the repo",
                  durationMs: 1200,
                  model: "composer-2",
                  prompt: "Find the entry point",
                  subagentType: "explore",
                  toolCallId: "task-1",
                },
                type: "extRequest",
              },
              {
                method: "cursor/generate_image",
                params: {
                  description: "A cat",
                  filePath: image,
                  referenceImagePaths: [],
                  toolCallId: "image-1",
                },
                type: "extRequest",
              },
              todos(false, { content: "Split", id: "1", status: "pending" }),
              todos(true, { content: "Test", id: "2", status: "in_progress" }),
              todos(true, { content: "Split", id: "1", status: "completed" }),
            ],
          },
        ],
      },
      "go",
    );
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("completed");
    expect(
      h
        .clientResponses(instance.logPath)
        .filter(
          (result) =>
            typeof result === "object" &&
            result !== null &&
            Object.keys(result).length === 0,
        ),
    ).toHaveLength(5);

    const cards = toolParts(message);
    const task = cards.find((part) => part.toolCallId === "task-1");
    expect(task?.callProviderMetadata.sentinel.kind).toBe("subagent");
    expect(task?.input).toEqual({
      description: "Explore the repo",
      prompt: "Find the entry point",
    });
    const plan = cards.find((part) => part.toolName === "update_plan");
    expect(
      plan?.output.tasks.map((entry: { status: string; title: string }) => [
        entry.title,
        entry.status,
      ]),
    ).toEqual([
      ["Split", "completed"],
      ["Test", "in_progress"],
    ]);
    expect(message.parts).toContainEqual(
      expect.objectContaining({
        filename: "cat.png",
        mediaType: "image/png",
        type: "file",
      }),
    );
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
