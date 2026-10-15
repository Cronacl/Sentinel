import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { setupPiRunHarness } from "./__tests__/run-harness";

// The Pi runtime end to end against the Pi RPC mock over real stdio: a turn
// streams into the mirror, Sentinel's extension confirms settle through the
// permission policy (or wait on the user), questions round-trip, sessions
// resume by file, Stop aborts, /compact compacts and failures surface.
const harness = await setupPiRunHarness();
const { PI_GATE_COMMAND } = await import("@/lib/ai/chat/engines/pi/commands");
const { PI_APPROVAL_PREFIX } =
  await import("@/lib/ai/chat/engines/pi/extension");
const { PI_GATE_MISSING_MESSAGE } = await import("./run");

type Scenario = Parameters<typeof harness.instanceFor>[0];
type Step = NonNullable<
  NonNullable<Scenario["prompts"]>[number]["steps"]
>[number];

const GATE = {
  name: PI_GATE_COMMAND,
  source: "extension" as const,
  sourceInfo: {},
};

function confirm(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  branches: Record<string, Step[]>,
): Step {
  return {
    branches,
    fields: {
      message: `${PI_APPROVAL_PREFIX}${JSON.stringify({ input, toolCallId, toolName })}`,
      title: `Allow ${toolName}?`,
    },
    method: "confirm",
    type: "ui",
  } as Step;
}

function scenario(steps: Step[], extra: Scenario = {}): Scenario {
  return { commands: [GATE], prompts: [{ steps }], ...extra };
}

function commandTypes(instance: { logPath: string }) {
  return harness.support
    .piCommands(instance.logPath)
    .map((command) => command.type);
}

const finished = () =>
  harness.waitFor(() => harness.finished(), "the turn to finish");
const awaiting = () =>
  harness.waitFor(
    () =>
      harness
        .toolParts(harness.assistant())
        .find((part) => part.state === "approval-requested"),
    "an approval request",
  );

beforeEach(() => harness.reset());
afterEach(async () => {
  await harness.cleanup();
});
afterAll(() => harness.removeDirs());

describe.skipIf(process.platform === "win32")("runPiThreadChat", () => {
  it("streams thinking, text and tools into one message, then records the session", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor(
      scenario([
        { text: ["Let me ", "look."], type: "thinking" },
        { text: "Checking.", type: "text" },
        {
          args: { command: "ls" },
          id: "tool-1",
          name: "bash",
          result: { content: [{ text: "a.ts", type: "text" }], details: {} },
          type: "toolCall",
          updates: [{ content: [{ text: "a", type: "text" }] }],
        },
        { text: "Done.", type: "text" },
      ]),
    );
    await harness.run(instance, "list files");
    const message = await finished();

    expect(message.metadata?.status).toBe("completed");
    expect(message.parts.map((part) => part.type)).toEqual([
      "reasoning",
      "text",
      "dynamic-tool",
      "text",
    ]);
    const [tool] = harness.toolParts(message);
    expect(tool).toMatchObject({
      state: "output-available",
      toolCallId: "tool-1",
      toolName: "pi_execute",
    });
    expect(tool!.callProviderMetadata.sentinel).toMatchObject({
      kind: "execute",
    });
    expect(JSON.stringify(tool!.output)).toContain("a.ts");
    expect(message.metadata?.usage).toBeTruthy();

    const launches = harness.support.piLaunches(harness.instanceDir());
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatch(
      /^--mode rpc --extension .*sentinel-pi-extension\.[0-9a-f]{8}\.ts$/,
    );
    const state = harness.store.thread?.chatEngineState?.pi as Record<
      string,
      unknown
    >;
    expect(state).toMatchObject({
      historyDelivered: true,
      sessionPath: "/mock/.pi/agent/sessions/--mock--/mock-pi-session-1.jsonl",
      syncedMessageId: message.id,
    });
    expect(commandTypes(instance)).toContain("prompt");
    expect(harness.eventTypes()).toContain("run.finished");
  });

  it("refuses to run without Sentinel's extension unless access is full", async () => {
    const instance = harness.instanceFor({
      commands: [],
      prompts: [{ steps: [] }],
    });
    await harness.run(instance, "hi");
    const message = await finished();
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toContain(PI_GATE_MISSING_MESSAGE);
    expect(commandTypes(instance)).not.toContain("prompt");
  });

  it("asks the user about a tool call and answers Pi with the decision", async () => {
    const instance = harness.instanceFor(
      scenario([
        confirm(
          "tool-rm",
          "bash",
          { command: "rm -rf build" },
          {
            confirmed: [{ text: "Removed.", type: "text" }],
            declined: [{ text: "Skipped.", type: "text" }],
          },
        ),
      ]),
    );
    await harness.run(instance, "clean up");
    const pending = await awaiting();
    expect(pending).toMatchObject({
      toolCallId: "tool-rm",
      toolName: "pi_execute",
    });
    expect(harness.store.thread?.status).toBe("awaiting_approval");

    await harness.submit(instance, { approved: true, decision: "accept" });
    const message = await finished();
    expect(message.metadata?.status).toBe("completed");
    expect(JSON.stringify(message.parts)).toContain("Removed.");
    expect(harness.support.piUiResponses(instance.logPath)).toEqual([
      expect.objectContaining({
        confirmed: true,
        type: "extension_ui_response",
      }),
    ]);
  });

  it("approves edits inside the workspace under accept_edits and still asks for commands", async () => {
    harness.settings.permissionMode = "accept_edits";
    const instance = harness.instanceFor(
      scenario([
        confirm(
          "tool-edit",
          "edit",
          { newText: "b", oldText: "a", path: "src/a.ts" },
          {
            confirmed: [
              confirm(
                "tool-outside",
                "write",
                { content: "x", path: "/etc/hosts" },
                {
                  declined: [{ text: "Not written.", type: "text" }],
                },
              ),
            ],
          },
        ),
      ]),
    );
    await harness.run(instance, "edit");
    const pending = await awaiting();
    expect(pending.toolCallId).toBe("tool-outside");
    await harness.submit(instance, { approved: false, decision: "decline" });
    const message = await finished();

    expect(
      harness.support
        .piUiResponses(instance.logPath)
        .map((record) => record.confirmed),
    ).toEqual([true, false]);
    const tools = harness.toolParts(message);
    expect(
      tools.find((part) => part.toolCallId === "tool-edit")
        ?.callProviderMetadata.sentinel,
    ).toMatchObject({
      kind: "edit",
    });
    expect(
      tools.find((part) => part.toolCallId === "tool-outside")?.state,
    ).toBe("output-denied");
  });

  it("settles every dialog at once in an unattended run", async () => {
    harness.settings.permissionMode = "accept_edits";
    const instance = harness.instanceFor(
      scenario([
        confirm(
          "tool-sh",
          "bash",
          { command: "make" },
          {
            declined: [
              {
                fields: { options: ["a", "b"], title: "Pick one" },
                method: "select",
                type: "ui",
              } as Step,
            ],
          },
        ),
        { text: "Finished.", type: "text" },
      ]),
    );
    await harness.run(instance, "go", { interactive: false });
    const message = await finished();

    expect(message.metadata?.status).toBe("completed");
    expect(harness.support.piUiResponses(instance.logPath)).toEqual([
      expect.objectContaining({ confirmed: false }),
      expect.objectContaining({ cancelled: true }),
    ]);
    expect(harness.toolParts(message).map((part) => part.state)).toEqual([
      "output-denied",
      "output-denied",
    ]);
  });

  it("asks Pi's questions on the shared card and sends the chosen value back", async () => {
    const instance = harness.instanceFor(
      scenario([
        {
          branches: { "*": [{ text: "Got it.", type: "text" }] },
          fields: {
            options: ["staging", "production"],
            title: "Deploy where?",
          },
          method: "select",
          type: "ui",
        } as Step,
      ]),
    );
    await harness.run(instance, "deploy");
    const pending = await awaiting();
    expect(pending.toolName).toBe("pi_ask_question");
    await harness.submit(instance, { approved: true, response: "production" });
    await finished();
    expect(harness.support.piUiResponses(instance.logPath)).toEqual([
      expect.objectContaining({ value: "production" }),
    ]);
  });

  it("resumes the thread's session in a new process and sends only what it missed", async () => {
    harness.settings.permissionMode = "full";
    const sessionPath =
      "/mock/.pi/agent/sessions/--mock--/mock-pi-session-1.jsonl";
    const instance = harness.instanceFor(
      scenario([{ text: "First.", type: "text" }], {
        sessions: { [sessionPath]: { messages: [], sessionId: "resumed" } },
      }),
    );
    await harness.run(instance, "one");
    await finished();
    // A restart: the next turn starts a new Pi.
    await harness.cleanup();
    await harness.run(instance, "two");
    await finished();

    const commands = harness.support.piCommands(instance.logPath);
    expect(
      commands.filter((command) => command.type === "switch_session"),
    ).toEqual([expect.objectContaining({ sessionPath })]);
    const prompts = commands.filter((command) => command.type === "prompt");
    expect(prompts).toHaveLength(2);
    expect(String(prompts[1]!.message)).not.toContain("one");
    expect(String(prompts[1]!.message)).toContain("two");
  });

  it("starts a new session with the transcript when the old one cannot be loaded", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor(
      scenario([{ text: "Reply.", type: "text" }]),
    );
    await harness.run(instance, "remember the word kiwi");
    await finished();
    await harness.cleanup();
    await harness.run(instance, "what was the word?");
    await finished();

    const commands = harness.support.piCommands(instance.logPath);
    const types = commands.map((command) => command.type);
    expect(types).toContain("switch_session");
    expect(types).toContain("new_session");
    const last = commands.filter((command) => command.type === "prompt").at(-1);
    expect(String(last!.message)).toContain("kiwi");
  });

  it("sets the model and a thinking level the model supports", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor(
      scenario([{ text: "Ok.", type: "text" }]),
    );
    await harness.run(instance, "hi", {
      modelId: "openai/gpt-5.6",
      reasoningEffort: "max",
    });
    await finished();
    const commands = harness.support.piCommands(instance.logPath);
    expect(
      commands.find((command) => command.type === "set_model"),
    ).toMatchObject({
      modelId: "gpt-5.6",
      provider: "openai",
    });
    // The mock's GPT-5.6 maps neither xhigh nor max: clamped down to high.
    expect(
      commands.find((command) => command.type === "set_thinking_level"),
    ).toMatchObject({
      level: "high",
    });
  });

  it("aborts the run on Stop", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor(
      scenario([{ text: "Working", type: "text" }, { type: "hang" } as Step]),
    );
    await harness.run(instance, "long task");
    await harness.waitFor(
      () =>
        JSON.stringify(harness.assistant()?.parts ?? []).includes("Working"),
      "streamed text",
    );
    await harness.stop();
    const message = await finished();
    expect(message.metadata?.status).toBe("cancelled");
    expect(commandTypes(instance)).toContain("abort");
    expect(harness.eventTypes()).toContain("run.cancelled");
  });

  it("runs /compact through Pi's compact command", async () => {
    const instance = harness.instanceFor(scenario([]));
    await harness.run(instance, "/compact keep the API notes");
    const message = await finished();
    expect(message.metadata?.status).toBe("completed");
    expect(
      harness.support
        .piCommands(instance.logPath)
        .find((command) => command.type === "compact"),
    ).toMatchObject({ customInstructions: "keep the API notes" });
    expect(harness.toolParts(message)[0]).toMatchObject({
      state: "output-available",
    });
    expect(
      harness.toolParts(message)[0]!.callProviderMetadata.sentinel.kind,
    ).toBe("compaction");
    expect(commandTypes(instance)).not.toContain("prompt");
  });

  it("fails the turn with Pi's error and the sign-in hint", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor({
      commands: [GATE],
      prompts: [{ match: "hi", reject: "No API key found for anthropic" }],
    });
    await harness.run(instance, "hi");
    const message = await finished();
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toContain(
      "No API key found for anthropic",
    );
    expect(message.metadata?.errorMessage).toContain("/login");
  });

  it("fails the turn when Pi crashes mid-run and starts a fresh one next time", async () => {
    harness.settings.permissionMode = "full";
    const instance = harness.instanceFor(
      scenario([
        { text: "Starting", type: "text" },
        { text: "fatal: out of memory", type: "stderr" } as Step,
        { code: 9, type: "exit" } as Step,
      ]),
    );
    await harness.run(instance, "go");
    const message = await finished();
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toContain("out of memory");
    expect(harness.getPiProcessPool().keys()).toEqual([]);
  });
});
