import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

// Keep every status/snapshot write inside a throwaway home, never ~/.sentinel.
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-opencode-"));
const originalEnv = {
  HOME: process.env.HOME,
  OPENCODE_CONFIG_CONTENT: process.env.OPENCODE_CONFIG_CONTENT,
  OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD,
  PATH: process.env.PATH,
  SENTINEL_OPENCODE_PATH: process.env.SENTINEL_OPENCODE_PATH,
  SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
};
process.env.HOME = tempRoot;
process.env.SENTINEL_STATE_PATH = path.join(tempRoot, "state", "state.json");
delete process.env.OPENCODE_SERVER_PASSWORD;
delete process.env.OPENCODE_CONFIG_CONTENT;

const {
  createOpenCodeSdkClient,
  getOpenCodeEngineStatus,
  isOpenCodeAuthError,
  OPENCODE_MINIMUM_VERSION,
  OPENCODE_RECOMMENDED_VERSION,
  parseOpenCodeSemver,
  parseOpenCodeServerUrl,
  resetOpenCodeEngineStatusCache,
  resetOpenCodeRuntimeCache,
  resolveOpenCodeCompatibility,
  startOpenCodeServerProcess,
  startOpenCodeSession,
} = await import("./opencode-sdk");

type FakeMode =
  "ansi" | "exit" | "hang" | "html" | "normal" | "silent" | "split";

// A stand-in `opencode` CLI: `--version` prints the configured version and
// `serve --hostname= --port=` starts a Bun server that enforces Basic auth the
// way OpenCode does (username OPENCODE_SERVER_USERNAME ?? "opencode"), answers
// the 1.x routes Sentinel calls and records what it saw. No real agent runs.
const FAKE_OPENCODE_SOURCE = String.raw`
import { appendFileSync, writeFileSync } from "node:fs";

const options = Object.fromEntries(
  process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }),
);
const logPath = options["fake-log"];
const log = (entry) => appendFileSync(logPath, JSON.stringify(entry) + "\n");
const version = options["fake-version"];
const mode = options["fake-mode"];

if (process.argv.includes("--version")) {
  console.log(version);
  process.exit(0);
}

log({ argv: process.argv.slice(2).filter((arg) => !arg.startsWith("--fake-")), pid: process.pid });
const hostname = options.hostname;
const port = Number(options.port);
const password = process.env.OPENCODE_SERVER_PASSWORD;
const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
const expected = password
  ? "Basic " + Buffer.from(username + ":" + password, "utf8").toString("base64")
  : null;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

if (mode === "exit") {
  console.error("boom: config is invalid");
  process.exitCode = 3;
} else if (mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  const listen = () =>
    Bun.serve({
      hostname,
      port,
      async fetch(request) {
        const url = new URL(request.url);
        if (expected && request.headers.get("authorization") !== expected) {
          return new Response("", { status: 401 });
        }
        if (url.pathname === "/global/health") {
          if (mode === "html") {
            return new Response("<!doctype html><title>OpenCode</title>", {
              headers: { "content-type": "text/html" },
            });
          }
          return json({ healthy: true, version });
        }
        if (url.pathname === "/_test/env") {
          return json({
            configContent: process.env.OPENCODE_CONFIG_CONTENT ?? null,
            hasPassword: Boolean(password),
            username: process.env.OPENCODE_SERVER_USERNAME ?? null,
          });
        }
        if (url.pathname === "/provider") {
          if (options["fake-provider"] === "auth-error") {
            return json(
              {
                data: { message: "Missing credentials", providerID: "openai" },
                name: "ProviderAuthError",
              },
              400,
            );
          }
          return json({
            all: [
              {
                id: "openai",
                models: {
                  "gpt-5": {
                    id: "gpt-5",
                    name: "GPT-5",
                    variants: { high: {}, low: {}, medium: {} },
                  },
                },
                name: "OpenAI",
              },
              {
                id: "anthropic",
                models: { opus: { id: "opus", name: "Opus" } },
                name: "Anthropic",
              },
            ],
            connected: ["openai"],
            default: {},
          });
        }
        if (url.pathname === "/agent") {
          return json([
            { hidden: false, mode: "primary", name: "build" },
            { hidden: false, mode: "primary", name: "plan" },
            { hidden: true, mode: "primary", name: "title" },
            { mode: "subagent", name: "explore" },
          ]);
        }
        if (url.pathname === "/session" && request.method === "POST") {
          const body = await request.json();
          log({ directory: request.headers.get("x-opencode-directory"), session: body });
          if (options["fake-session"] === "fail") {
            return json({ data: { message: "Session storage is locked" }, name: "UnknownError" }, 500);
          }
          return json({ id: "ses_fake", title: body.title });
        }
        return json({ name: "NotFound" }, 404);
      },
    });

  if (mode === "split") {
    process.stdout.write("opencode server listening on http://" + hostname + ":");
    setTimeout(() => {
      listen();
      process.stdout.write(port + "\n");
    }, 300);
  } else {
    listen();
    if (mode === "normal") {
      if (!password) {
        console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.");
      }
      console.log("opencode server listening on http://" + hostname + ":" + port);
    } else if (mode === "ansi") {
      console.log("\u001b[90mINFO 2026-10-07T10:00:00 +12ms\u001b[0m opencode server listening on http://" + hostname + ":" + port + "\u001b[0m");
    }
  }
}
process.on("SIGTERM", () => process.exit(0));
`;

let fakeCounter = 0;

async function createFakeOpenCode(input: {
  mode?: FakeMode;
  provider?: "auth-error" | "ok";
  session?: "fail" | "ok";
  version: string;
}) {
  fakeCounter += 1;
  const directory = path.join(tempRoot, `fake-${fakeCounter}`);
  await mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, "fake-opencode.mjs");
  const logPath = path.join(directory, "invocations.jsonl");
  const binaryPath = path.join(directory, "opencode");
  await writeFile(sourcePath, FAKE_OPENCODE_SOURCE, "utf8");
  await writeFile(
    binaryPath,
    [
      "#!/bin/sh",
      `exec "${process.execPath}" "${sourcePath}" "--fake-log=${logPath}" "--fake-version=${input.version}" "--fake-mode=${input.mode ?? "normal"}" "--fake-provider=${input.provider ?? "ok"}" "--fake-session=${input.session ?? "ok"}" "$@"`,
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(binaryPath, 0o755);

  return {
    binaryPath,
    async invocations() {
      if (!existsSync(logPath)) return [];
      return (await readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, any>);
    },
  };
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, timeoutMs = 3_000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

const openServers: Array<{ close: () => void; exited: Promise<unknown> }> = [];

async function startFakeServer(
  fake: { binaryPath: string },
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number },
) {
  const server = await startOpenCodeServerProcess({
    binaryPath: fake.binaryPath,
    cwd: tempRoot,
    env: options?.env ?? { ...process.env },
    timeoutMs: options?.timeoutMs ?? 5_000,
  });
  openServers.push(server);
  return server;
}

afterEach(async () => {
  for (const server of openServers.splice(0)) {
    server.close();
    await server.exited;
  }
  delete process.env.SENTINEL_OPENCODE_PATH;
  delete process.env.OPENCODE_SERVER_PASSWORD;
  resetOpenCodeRuntimeCache();
  resetOpenCodeEngineStatusCache();
});

afterAll(async () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await rm(tempRoot, { force: true, recursive: true });
});

describe("parseOpenCodeServerUrl", () => {
  it("reads the 1.x readiness line after the unsecured-server warning", () => {
    expect(
      parseOpenCodeServerUrl(
        [
          "Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.",
          "opencode server listening on http://127.0.0.1:54056",
          "",
        ].join("\n"),
      ),
    ).toBe("http://127.0.0.1:54056");
  });

  it("tolerates log prefixes, colour codes and CRLF line endings", () => {
    expect(
      parseOpenCodeServerUrl(
        "\u001b[90mINFO\u001b[0m opencode server listening on http://127.0.0.1:4096\u001b[0m\r\n",
      ),
    ).toBe("http://127.0.0.1:4096");
  });

  it("ignores an unterminated line so a split chunk cannot truncate the URL", () => {
    expect(
      parseOpenCodeServerUrl("opencode server listening on http://127.0.0.1:"),
    ).toBeNull();
    expect(parseOpenCodeServerUrl("starting opencode\n")).toBeNull();
  });
});

describe("OpenCode version compatibility", () => {
  it("parses 1.x and 2.x --version output and leaves snapshots unknown", () => {
    expect(parseOpenCodeSemver("1.18.35\n")).toEqual([1, 18, 35]);
    expect(parseOpenCodeSemver("opencode v2.0.18")).toEqual([2, 0, 18]);
    expect(parseOpenCodeSemver("0.0.0-dev-202610062254")).toBeNull();
    expect(parseOpenCodeSemver(null)).toBeNull();
  });

  it("maps versions onto the documented floors", () => {
    expect(OPENCODE_MINIMUM_VERSION).toBe("1.0.224");
    expect(OPENCODE_RECOMMENDED_VERSION).toBe("1.14.19");

    expect(resolveOpenCodeCompatibility("1.18.35")).toEqual({
      message: null,
      recommendedRange: ">=1.14.19 <2.0.0",
      recommendedVersion: "1.14.19",
      status: "supported",
    });
    expect(resolveOpenCodeCompatibility("1.14.19").status).toBe("supported");
    expect(resolveOpenCodeCompatibility("1.14.18").status).toBe("graceful");
    expect(resolveOpenCodeCompatibility("1.3.17")).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("1.14.19 or newer is recommended"),
        status: "graceful",
      }),
    );
    expect(resolveOpenCodeCompatibility("1.2.0").status).toBe("graceful");
    // Before message.part.delta (1.2.0) and questions (1.1.7), but already on
    // the permission.asked protocol: usable, update recommended.
    expect(resolveOpenCodeCompatibility("1.1.65").status).toBe("graceful");
    expect(resolveOpenCodeCompatibility("1.1.1").status).toBe("graceful");
    expect(resolveOpenCodeCompatibility("1.0.224").status).toBe("graceful");
    expect(resolveOpenCodeCompatibility("1.0.223")).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("needs 1.0.224 or newer"),
        status: "broken",
      }),
    );
    expect(resolveOpenCodeCompatibility("opencode v2.0.24")).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("2.x generation"),
        status: "unsupported",
      }),
    );
    expect(resolveOpenCodeCompatibility(null).status).toBe("unknown");
  });
});

describe("isOpenCodeAuthError", () => {
  it("ignores auth-like text in the request URL the 1.18 SDK puts in errors", async () => {
    // An empty-bodied 500 makes the SDK describe the request, URL included.
    const server = createServer((_request, response) => {
      response.statusCode = 500;
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    try {
      const { port } = server.address() as AddressInfo;
      const client = createOpenCodeSdkClient({
        baseUrl: `http://127.0.0.1:${port}`,
        directory: "/Users/someone/oauth-app",
      });
      const error = await client.provider.list().then(
        () => null,
        (failure: unknown) => failure,
      );

      // "opencode server GET http://…/provider?directory=%2FUsers%2Fsomeone%2Foauth-app → 500 …"
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("oauth-app");
      expect(isOpenCodeAuthError(error)).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("recognises ProviderAuthError bodies and plain auth messages", () => {
    expect(
      isOpenCodeAuthError(
        new Error("Missing credentials", {
          cause: {
            body: {
              data: { message: "Missing credentials" },
              name: "ProviderAuthError",
            },
            status: 400,
          },
        }),
      ),
    ).toBe(true);
    expect(isOpenCodeAuthError(new Error("Unauthorized"))).toBe(true);
    expect(
      isOpenCodeAuthError(new Error("Please run opencode auth login")),
    ).toBe(true);
    expect(isOpenCodeAuthError(new Error("Session storage is locked"))).toBe(
      false,
    );
  });
});

describe.skipIf(process.platform === "win32")(
  "startOpenCodeServerProcess",
  () => {
    it("starts on the stdout line with a per-spawn password the SDK client sends", async () => {
      const fake = await createFakeOpenCode({ version: "1.18.35" });
      const server = await startFakeServer(fake, {
        env: {
          ...process.env,
          OPENCODE_CONFIG_CONTENT: '{"share":"disabled"}',
          OPENCODE_SERVER_PASSWORD: "inherited-from-shell",
          OPENCODE_SERVER_USERNAME: "someone-else",
        },
      });

      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.version).toBe("1.18.35");
      expect(server.authorization).toMatch(/^Basic /);
      const [invocation] = await fake.invocations();
      expect(invocation?.argv).toEqual([
        "serve",
        "--hostname=127.0.0.1",
        `--port=${new URL(server.url).port}`,
      ]);

      // Without the header the server refuses the request.
      const anonymous = await fetch(`${server.url}/global/health`);
      expect(anonymous.status).toBe(401);

      const env = (await (
        await fetch(`${server.url}/_test/env`, {
          headers: { authorization: server.authorization },
        })
      ).json()) as Record<string, unknown>;
      expect(env).toEqual({
        configContent: '{"share":"disabled"}',
        hasPassword: true,
        username: "opencode",
      });

      const client = createOpenCodeSdkClient({
        authorization: server.authorization,
        baseUrl: server.url,
        directory: tempRoot,
      });
      const providers = await client.provider.list();
      expect(providers.data?.connected).toEqual(["openai"]);
    });

    it("defaults OPENCODE_CONFIG_CONTENT to an empty config", async () => {
      const fake = await createFakeOpenCode({ version: "1.18.35" });
      const env = { ...process.env };
      delete env.OPENCODE_CONFIG_CONTENT;
      const server = await startFakeServer(fake, { env });

      const response = await fetch(`${server.url}/_test/env`, {
        headers: { authorization: server.authorization },
      });
      expect(
        ((await response.json()) as { configContent: string }).configContent,
      ).toBe("{}");
    });

    it("falls back to /global/health when the server prints no readiness line", async () => {
      const fake = await createFakeOpenCode({
        mode: "silent",
        version: "1.18.35",
      });
      const server = await startFakeServer(fake);

      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.version).toBe("1.18.35");
      expect(server.stdout()).toBe("");
    });

    it("reads a prefixed, coloured readiness line", async () => {
      const fake = await createFakeOpenCode({
        mode: "ansi",
        version: "1.18.35",
      });
      const server = await startFakeServer(fake);

      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it("waits for the whole readiness line when it arrives in pieces", async () => {
      const fake = await createFakeOpenCode({
        mode: "split",
        version: "1.18.35",
      });
      const server = await startFakeServer(fake);

      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(
        (
          await fetch(`${server.url}/global/health`, {
            headers: { authorization: server.authorization },
          })
        ).status,
      ).toBe(200);
    });

    it("reports the exit code and stderr when the server dies during startup", async () => {
      const fake = await createFakeOpenCode({
        mode: "exit",
        version: "1.18.35",
      });

      await expect(startFakeServer(fake)).rejects.toThrow(
        /exited before startup completed with code 3 stderr: boom: config is invalid/,
      );
    });

    it("does not accept an HTML answer on the health route as ready", async () => {
      const fake = await createFakeOpenCode({
        mode: "html",
        version: "2.0.24",
      });

      await expect(startFakeServer(fake, { timeoutMs: 700 })).rejects.toThrow(
        "Timed out waiting for OpenCode server start after 700ms.",
      );
    });

    it("kills a server that never becomes ready", async () => {
      const fake = await createFakeOpenCode({
        mode: "hang",
        version: "1.18.35",
      });

      await expect(startFakeServer(fake, { timeoutMs: 500 })).rejects.toThrow(
        "Timed out waiting for OpenCode server start after 500ms.",
      );
      const [invocation] = await fake.invocations();
      expect(typeof invocation?.pid).toBe("number");
      expect(await waitFor(() => !isProcessAlive(invocation!.pid))).toBe(true);
    });

    it("resolves exited when the server is closed", async () => {
      const fake = await createFakeOpenCode({ version: "1.18.35" });
      const server = await startOpenCodeServerProcess({
        binaryPath: fake.binaryPath,
        env: { ...process.env },
      });

      server.close();
      const exit = await server.exited;
      expect(exit.code === 0 || exit.signal === "SIGTERM").toBe(true);
    });
  },
);

describe.skipIf(process.platform === "win32")("getOpenCodeEngineStatus", () => {
  it("lists connected models and marks a current CLI as supported", async () => {
    const fake = await createFakeOpenCode({ version: "1.18.35" });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;
    // An inherited server password must not lock Sentinel's client out.
    process.env.OPENCODE_SERVER_PASSWORD = "user-shell-secret";

    const status = await getOpenCodeEngineStatus({ forceRefresh: true });

    expect(status).toEqual(
      expect.objectContaining({
        authReady: true,
        cliDetected: true,
        cliPath: fake.binaryPath,
        cliVersion: "1.18.35",
        compatibilityAdvisory: expect.objectContaining({
          message: null,
          status: "supported",
        }),
        error: null,
        state: "ready",
      }),
    );
    expect(status.availableModels.map((model) => model.id)).toEqual([
      "openai/gpt-5",
    ]);
    expect(status.availableModels[0]?.openCode).toEqual({
      agentOptions: [
        { isDefault: true, label: "Build", value: "build" },
        { label: "Plan", value: "plan" },
      ],
      variantOptions: [
        { label: "High", value: "high" },
        { label: "Low", value: "low" },
        { isDefault: true, label: "Medium", value: "medium" },
      ],
    });
    const snapshot = JSON.parse(
      await readFile(
        path.join(tempRoot, "state", "opencode-status.json"),
        "utf8",
      ),
    ) as { cliVersion: string };
    expect(snapshot.cliVersion).toBe("1.18.35");
  });

  it("keeps an older 1.x CLI usable with an update-recommended advisory", async () => {
    const fake = await createFakeOpenCode({ version: "1.3.17" });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    const status = await getOpenCodeEngineStatus({ forceRefresh: true });

    expect(status.state).toBe("ready");
    expect(status.compatibilityAdvisory).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("OpenCode 1.3.17 still works"),
        status: "graceful",
      }),
    );
  });

  it("reports a CLI below the protocol minimum without starting a server", async () => {
    const fake = await createFakeOpenCode({ version: "1.0.223" });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    const status = await getOpenCodeEngineStatus({ forceRefresh: true });

    expect(status).toEqual(
      expect.objectContaining({
        authReady: false,
        availableModels: [],
        cliVersion: "1.0.223",
        compatibilityAdvisory: expect.objectContaining({ status: "broken" }),
        error: expect.stringContaining("needs 1.0.224 or newer"),
        state: "error",
      }),
    );
    expect(await fake.invocations()).toEqual([]);
    await expect(
      startOpenCodeSession({ cwd: tempRoot, fullAccess: false, title: "t" }),
    ).rejects.toThrow("needs 1.0.224 or newer");
  });

  it("reports a provider auth failure from the structured SDK error", async () => {
    const fake = await createFakeOpenCode({
      provider: "auth-error",
      version: "1.18.35",
    });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    const status = await getOpenCodeEngineStatus({ forceRefresh: true });

    // "Missing credentials" has no auth keyword; the error body's name does.
    expect(status).toEqual(
      expect.objectContaining({
        authReady: false,
        error: "Missing credentials",
        state: "auth_unavailable",
      }),
    );
  });

  it("reports OpenCode 2.x as not supported yet", async () => {
    const fake = await createFakeOpenCode({ version: "opencode v2.0.24" });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    const status = await getOpenCodeEngineStatus({ forceRefresh: true });

    expect(status.state).toBe("error");
    expect(status.compatibilityAdvisory?.status).toBe("unsupported");
    expect(await fake.invocations()).toEqual([]);
  });
});

describe.skipIf(process.platform === "win32")("startOpenCodeSession", () => {
  it("creates the session with the permission ruleset and title", async () => {
    const fake = await createFakeOpenCode({ version: "1.18.35" });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    const session = await startOpenCodeSession({
      cwd: tempRoot,
      fullAccess: false,
      title: "Fix the bug",
    });
    openServers.push(session.server);

    expect(session.sessionId).toBe("ses_fake");
    const created = (await fake.invocations()).find((entry) => entry.session);
    expect(created).toEqual({
      directory: encodeURIComponent(tempRoot),
      session: {
        permission: [
          { action: "ask", pattern: "*", permission: "*" },
          { action: "ask", pattern: "*", permission: "bash" },
          { action: "ask", pattern: "*", permission: "edit" },
          { action: "ask", pattern: "*", permission: "webfetch" },
          { action: "ask", pattern: "*", permission: "websearch" },
          { action: "allow", pattern: "*", permission: "question" },
        ],
        title: "Fix the bug",
      },
    });
  });

  it("stops the server and surfaces the server message when session.create fails", async () => {
    const fake = await createFakeOpenCode({
      session: "fail",
      version: "1.18.35",
    });
    process.env.SENTINEL_OPENCODE_PATH = fake.binaryPath;

    await expect(
      startOpenCodeSession({ cwd: tempRoot, fullAccess: true, title: "t" }),
    ).rejects.toThrow("Session storage is locked");
    const serve = (await fake.invocations()).find((entry) => entry.pid);
    expect(await waitFor(() => !isProcessAlive(serve!.pid))).toBe(true);
  });
});
