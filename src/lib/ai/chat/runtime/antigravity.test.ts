import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
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

// Antigravity threads end to end: the real descriptor and launch (private
// profile, curated env) against the ACP mock agent's Antigravity profile as
// the server, over real stdio.

const h = await setupAcpRunHarness();
const { antigravityAcpAgentFor } =
  await import("@/lib/ai/chat/engines/acp/agents/antigravity");
const { ANTIGRAVITY_SIGN_IN_REQUIRED_MESSAGE } =
  await import("@/lib/ai/chat/engines/acp/antigravity/auth-url");
const { readAntigravityAuthState } =
  await import("@/lib/ai/chat/engines/acp/antigravity/profile");
const { antigravityProfile } =
  await import("../../../../../scripts/fixtures/agents/acp/profiles");
const fake =
  await import("@/lib/ai/chat/engines/acp/antigravity/__tests__/fake-server");

type Scenario = ReturnType<typeof antigravityProfile>;

const serverDir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-run-"));
const server = await fake.writeFakeServer(path.join(serverDir, "bin"));

beforeEach(() => h.reset());
afterEach(() => h.cleanup());
afterAll(() => h.removeDirs());

/** The profile, signed in already (no browser sign-in). */
function signedIn(): Scenario {
  return { ...antigravityProfile(), auth: undefined };
}

async function start(
  scenario: Scenario,
  text: string,
  extra: Record<string, unknown> = {},
) {
  await writeFile(path.join(h.settings.workspaceDir, "README.md"), "# Hi\n");
  const base = fake.antigravityInstance(scenario, h.settings.workspaceDir);
  const instance = Object.assign(base, {
    config: { binaryPath: server },
    env: { ...base.env, HOME: h.settings.workspaceDir },
  });
  const descriptor = await antigravityAcpAgentFor(instance);
  await h.run(descriptor, scenario, text, extra, instance);
  return { descriptor, instance };
}

// Generous bounds: each turn starts a real process.
const waitFor = <T>(
  predicate: () => T | null | undefined | false,
  label: string,
) => h.waitFor(predicate, label, 20_000);

const awaitingUser = () =>
  waitFor(() => h.store.thread?.status === "awaiting_approval", "a question");

const requests = (logPath: string, method: string) =>
  h.agentRequests(logPath, method).map((entry) => entry.params as never);

describe("Antigravity turns", () => {
  it("signs in eagerly, serves client fs, asks its questions and approvals, and finishes", async () => {
    // No model picked: the default.
    const { descriptor, instance } = await start(signedIn(), "go", {
      modelId: null,
    });

    await awaitingUser();
    const question = toolParts(h.assistant()).find(
      (part) => part.state === "approval-requested",
    );
    expect(question?.callProviderMetadata.sentinel.kind).toBe("user_input");
    await h.submit(descriptor, instance, { approved: true, response: "dev" });

    await waitFor(
      () =>
        toolParts(h.assistant()).some(
          (part) =>
            part.state === "approval-requested" &&
            part.callProviderMetadata.sentinel.kind === "edit",
        ),
      "the edit approval",
    );
    const edit = toolParts(h.assistant()).find(
      (part) => part.state === "approval-requested",
    );
    expect(
      edit?.callProviderMetadata.sentinel.permissionOptions.map(
        (option: { name: string }) => option.name,
      ),
    ).toEqual(["Allow once", "Allow for this thread", "Deny"]);
    await h.submit(descriptor, instance, {
      approved: true,
      decision: "accept",
    });

    const message = await waitFor(h.finished, "the turn to finish");
    expect(message.metadata?.status).toBe("completed");

    const log = instance.logPath;
    expect(requests(log, "authenticate")).toEqual([
      { methodId: "oauth-personal" },
    ]);
    expect(h.clientResponses(log)).toContainEqual({
      outcome: { optionId: "dev", outcome: "selected" },
    });
    // The README read through client fs came back to the agent.
    expect(JSON.stringify(h.clientResponses(log))).toContain("# Hi");
    // The default model is the manifest's, not the agent's current one;
    // no effort option is ever sent.
    expect(requests(log, "session/set_config_option")).toEqual([
      expect.objectContaining({
        configId: "model",
        value: "gemini-3.8-flash-high",
      }),
    ]);
    // Default permission mode: the session already is in "default".
    expect(requests(log, "session/set_mode")).toEqual([]);
    expect(h.store.thread?.chatEngineState).toEqual(
      expect.objectContaining({
        antigravity: expect.objectContaining({
          agentId: "antigravity",
          protocolVersion: 2,
        }),
      }),
    );
  }, 60_000);

  it("puts full access in yolo mode and resumes (never loads) the session later", async () => {
    h.settings.permissionMode = "full";
    const scenario: Scenario = {
      ...signedIn(),
      prompts: [{ steps: [{ text: "One.", type: "text" }] }],
      session: {
        ...signedIn().session,
        resume: { knownSessionIds: ["mock-session-1"] },
      },
    };
    const first = await start(scenario, "first");
    await waitFor(h.finished, "the first turn");
    expect(requests(first.instance.logPath, "session/set_mode")).toEqual([
      expect.objectContaining({ modeId: "yolo" }),
    ]);

    // A fresh process for the next turn: it continues the session.
    await h.getAcpProcessPool().disposeAll();
    await h.run(first.descriptor, scenario, "second", {}, first.instance);
    await waitFor(
      () =>
        h.assistant()?.metadata?.status === "completed" &&
        requests(first.instance.logPath, "session/resume").length > 0,
      "the second turn",
    );
    expect(requests(first.instance.logPath, "session/load")).toEqual([]);
  }, 60_000);

  it("ends a chat turn that would need a Google sign-in, pointing at Settings", async () => {
    const { instance } = await start(antigravityProfile(), "go");
    const message = await waitFor(h.finished, "the turn to fail");
    expect(message.metadata?.status).toBe("error");
    expect(message.metadata?.errorMessage).toBe(
      ANTIGRAVITY_SIGN_IN_REQUIRED_MESSAGE,
    );
    expect(
      (
        await readAntigravityAuthState(
          path.join(instance.stateDir, "gemini-home"),
        )
      )?.status,
    ).toBe("signed-out");
  }, 60_000);

  it("settles questions and approvals at once in unattended runs", async () => {
    const { instance } = await start(signedIn(), "go", { interactive: false });
    const message = await waitFor(h.finished, "the turn to finish");
    expect(message.metadata?.status).toBe("completed");
    const responses = h.clientResponses(instance.logPath);
    expect(responses).toContainEqual({ outcome: { outcome: "cancelled" } });
    expect(responses).toContainEqual({
      outcome: { optionId: "reject-once", outcome: "selected" },
    });
  }, 60_000);
});
