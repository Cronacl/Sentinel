import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

// The Antigravity sign-in against the ACP mock agent's Antigravity profile
// as the server (real stdio, its real loopback listener): the Google URL
// it prints, the paste-back of the redirect, API keys and sign-out.

process.env.SENTINEL_STATE_PATH ??= path.join(
  await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-auth-state-")),
  "state.json",
);
mock.module("server-only", () => ({}));

const { antigravityAuth } = await import("./antigravity");
const { EngineAuthError } = await import("../../platform/auth/controller");
const { antigravityDriver } = await import("../antigravity");
const { readAntigravityAuthState } =
  await import("../../acp/antigravity/profile");
const { getAcpProcessPool } = await import("../../acp/launch");
const { readMockLog } = await import("../../acp/__tests__/mock-agent");
const { antigravityProfile } =
  await import("../../../../../../../scripts/fixtures/agents/acp/profiles");
const fake = await import("../../acp/antigravity/__tests__/fake-server");

const roots: string[] = [];
afterAll(async () => {
  await getAcpProcessPool().disposeAll();
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function setup(scenario = antigravityProfile()) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-auth-"));
  roots.push(dir);
  const server = await fake.writeFakeServer(path.join(dir, "bin"));
  const base = fake.antigravityInstance(scenario, dir);
  return Object.assign(base, {
    config: { binaryPath: server },
    env: { ...base.env, HOME: dir },
  });
}

function fakeContext() {
  const browsers: Array<{
    onCallback?: (url: string) => Promise<void>;
    url: string;
  }> = [];
  const saved: Array<Record<string, string>> = [];
  const context = {
    clearInstanceSecrets: mock(async () => [] as string[]),
    client: { terminal: false },
    flowId: "flow-1",
    requestCredentials: mock(async () => ({ GEMINI_API_KEY: "key-123" })),
    runBackgroundCommand: mock(async () => ({ exitCode: 0 })),
    runTerminalCommand: mock(async () => ({ exitCode: 0 })),
    saveInstanceSecrets: mock(async (values: Record<string, string>) => {
      saved.push(values);
    }),
    setMessage: mock(() => {}),
    showBrowser: mock(
      (url: string, options?: { onCallback?(url: string): Promise<void> }) => {
        browsers.push({ onCallback: options?.onCallback, url });
      },
    ),
    showDeviceCode: mock(() => {}),
    signal: new AbortController().signal,
  };
  return { browsers, context, saved };
}

async function waitFor<T>(read: () => T | undefined, label: string) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const geminiHome = (instance: { stateDir: string }) =>
  path.join(instance.stateDir, "gemini-home");

describe.skipIf(process.platform === "win32")("antigravityAuth", () => {
  it("offers its four methods once the server is installed", async () => {
    const instance = await setup();
    expect(
      (await antigravityAuth.methods(instance, { terminal: false })).map(
        (method) => method.id,
      ),
    ).toEqual([
      "oauth-personal",
      "oauth-business",
      "gemini-api-key",
      "agent-platform",
    ]);
    expect(
      await antigravityAuth.methods(
        { ...instance, config: {}, env: { PATH: "/nonexistent" } },
        { terminal: false },
      ),
    ).toEqual([]);
  });

  it("shows Google's sign-in, validates the pasted redirect and replays it to the server", async () => {
    const instance = await setup();
    const { browsers, context } = fakeContext();
    const login = antigravityAuth.login(
      instance,
      "oauth-personal",
      context as never,
    );
    const browser = await waitFor(() => browsers[0], "the sign-in page");
    const authorization = new URL(browser.url);
    expect(authorization.origin).toBe("https://accounts.google.com");
    const redirect = authorization.searchParams.get("redirect_uri")!;

    await expect(
      browser.onCallback!(`${redirect}?state=other&code=abc`),
    ).rejects.toBeInstanceOf(EngineAuthError);
    await browser.onCallback!(`${redirect}?state=mock-state&code=abc`);

    await expect(login).resolves.toEqual({
      message: "Signed in with Google account.",
    });
    expect(await readAntigravityAuthState(geminiHome(instance))).toEqual(
      expect.objectContaining({
        method: "oauth-personal",
        status: "signed-in",
      }),
    );
    expect(
      readMockLog(instance.logPath).some(
        (entry) =>
          entry.kind === "request" &&
          entry.method === "authenticate" &&
          JSON.stringify(entry.params) === '{"methodId":"oauth-personal"}',
      ),
    ).toBe(true);

    const probe = await antigravityDriver.probe(instance, {
      depth: "full",
      signal: new AbortController().signal,
    } as never);
    expect(probe.auth.status).toBe("authenticated");
    expect(probe.install.installed).toBe(true);
  }, 60_000);

  it("stores an API key only once the server accepted it", async () => {
    const instance = await setup();
    const { browsers, context, saved } = fakeContext();
    await expect(
      antigravityAuth.login(instance, "gemini-api-key", context as never),
    ).resolves.toEqual({ message: "Antigravity accepted the Gemini API key." });
    expect(browsers).toEqual([]);
    expect(saved).toEqual([{ GEMINI_API_KEY: "key-123" }]);

    const refused = await setup({
      ...antigravityProfile(),
      auth: { acceptMethodIds: ["oauth-personal"], requireAuth: true },
    });
    const second = fakeContext();
    await expect(
      antigravityAuth.login(refused, "gemini-api-key", second.context as never),
    ).rejects.toBeInstanceOf(EngineAuthError);
    expect(second.saved).toEqual([]);
  }, 60_000);

  it("signs out through the server's logout", async () => {
    const instance = await setup();
    const { context } = fakeContext();
    await expect(
      antigravityAuth.logout!(instance, context as never),
    ).resolves.toEqual({ message: "Signed out of Antigravity." });
    expect(
      readMockLog(instance.logPath).some(
        (entry) => entry.kind === "request" && entry.method === "logout",
      ),
    ).toBe(true);
    expect((await readAntigravityAuthState(geminiHome(instance)))?.status).toBe(
      "signed-out",
    );
    const probe = await antigravityDriver.probe(instance, {
      depth: "full",
      signal: new AbortController().signal,
    } as never);
    expect(probe.auth.status).toBe("unauthenticated");
  }, 60_000);
});
