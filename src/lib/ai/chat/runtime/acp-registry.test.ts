import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { setupAcpRunHarness, toolParts } from "./acp/__tests__/run-harness";

// Registry agents end to end on the shared ACP runtime: the instance's own
// descriptor (engines/acp/agents/registry.ts) launches the mock ACP agent
// over real stdio, with the Devin and Mistral Vibe overlays.

const h = await setupAcpRunHarness();
const { devinProfile } =
  await import("../../../../../scripts/fixtures/agents/acp/profiles");
const { getAcpRegistryDescriptor } =
  await import("@/lib/ai/chat/engines/acp/agents/registry");
const { runAcpRegistryThreadChat, stopAcpRegistryThreadRun } =
  await import("./acp-registry");

type Scenario = Parameters<typeof h.instanceFor>[0];

beforeEach(() => h.reset());
afterEach(() => h.cleanup());
afterAll(() => h.removeDirs());

function registryInstance(scenario: Scenario, agentId: string) {
  return h.support.mockInstance(scenario, h.settings.workspaceDir, {
    config: {
      agentId,
      commandArgs: [h.support.MOCK_AGENT_PATH],
      commandPath: process.execPath,
    },
    driver: "acp",
    id: `acp-${agentId}`,
    isDefault: false,
    label: agentId,
    stateDir: path.join(h.settings.workspaceDir, "state", agentId),
  });
}

function devinScenario(): Scenario {
  const scenario = devinProfile();
  for (const step of scenario.prompts![0]!.steps!) {
    if (step.type === "clientTerminal") {
      Object.assign(step, {
        args: ["-c", "echo all-green"],
        command: "/bin/sh",
        echo: true,
      });
    }
  }
  return scenario;
}

describe("Devin overlay", () => {
  it("routes subagents to cards, names tools and runs commands in client terminals", async () => {
    h.settings.permissionMode = "full";
    const scenario = devinScenario();
    const instance = registryInstance(scenario, "devin");
    const descriptor = getAcpRegistryDescriptor(instance);
    expect(descriptor).toMatchObject({
      clientTerminals: true,
      routeUnknownSessionsToRoot: true,
    });

    await h.run(descriptor, scenario, "fix the tests", {}, instance);
    const message = await h.waitFor(h.finished, "the turn to finish");
    expect(message.metadata?.status).toBe("completed");

    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("");
    expect(text).toContain("Planning.");
    expect(text).toContain("All green.");
    // The subagent's own output is its message, not the assistant's text.
    expect(text).not.toContain("subagent output");

    const tools = toolParts(message);
    const subagent = tools.find((part) =>
      String(part.toolCallId).startsWith("subagent:"),
    );
    expect(subagent).toMatchObject({
      state: "output-available",
      toolCallId: "subagent:sub-1",
    });
    expect(subagent?.input).toMatchObject({ description: "Added tests" });
    expect(subagent?.callProviderMetadata?.sentinel?.title).toBe("Tests");
    expect(
      tools.find((part) => part.toolCallId === "devin-sub-1"),
    ).toBeUndefined();
    const relay = tools.find((part) =>
      String(part.toolCallId).startsWith("session-message:"),
    );
    expect(JSON.stringify(relay?.output)).toContain("subagent output");

    // The command ran through terminal/create (the mock echoes its output).
    expect(text).toContain("all-green");
    const log = h.support.readMockLog(instance.logPath);
    const initialize = log.find(
      (entry) => "method" in entry && entry.method === "initialize",
    );
    expect(JSON.stringify(initialize)).toContain(
      "cognition.ai/subagentSupport",
    );
  });

  it("asks before Devin runs a command in default mode", async () => {
    const scenario = devinScenario();
    const instance = registryInstance(scenario, "devin");
    await runAcpRegistryThreadChat(
      h.request("go"),
      h.store.thread as never,
      instance,
    );
    await h.waitFor(
      () => h.store.thread?.status === "awaiting_approval",
      "the command approval",
    );
    const descriptor = getAcpRegistryDescriptor(instance);
    await h.submit(descriptor, instance, { approved: false });
    const message = await h.waitFor(h.finished, "finish");
    expect(message.metadata?.status).toBe("completed");
    expect(
      message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join(""),
    ).not.toContain("all-green");
  });
});

describe("Mistral Vibe overlay", () => {
  it("shows _session/retrying as a usage-limit notice", async () => {
    const scenario: Scenario = {
      prompts: [
        {
          steps: [
            {
              method: "_session/retrying",
              params: {
                category: "rate_limited",
                detail: "429 Too Many Requests",
                sessionId: "{{sessionId}}",
              },
              type: "extNotification",
            },
            { text: "Back.", type: "text" },
          ],
        },
      ],
    };
    const instance = registryInstance(scenario, "mistral-vibe");
    await h.run(
      getAcpRegistryDescriptor(instance),
      scenario,
      "hi",
      {},
      instance,
    );
    const message = await h.waitFor(h.finished, "finish");
    const notice = toolParts(message).find((part) =>
      String(part.toolCallId).startsWith("notice:retrying"),
    );
    expect(notice?.output).toEqual({
      description: "429 Too Many Requests",
      severity: "warning",
      title: "Usage limit reached, retrying",
    });
  });
});

describe("stopAcpRegistryThreadRun", () => {
  it("stops without an instance", async () => {
    const response = await stopAcpRegistryThreadRun(
      h.request(""),
      null as never,
      null,
    );
    expect(response.status).toBe(204);
  });
});
