import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

mock.module("server-only", () => ({}));

// @ts-expect-error Bun test-only cache-busting import of the real module.
const { ensureTables } = await import("@/server/db/index.ts?instances-actual");

mock.module("@/server/db", () => ({ db: {} }));

const {
  createEngineInstanceRegistry,
  getConfiguredEngineBinary,
  notifyEngineInstanceChange,
  subscribeToEngineInstanceChanges,
} = await import("./instances");
const { EngineInstanceError, EngineInstanceUnavailableError } =
  await import("./errors");

const USER_ID = "user-1";

function fakeEncrypt(value: string) {
  return `enc:${Buffer.from(value, "utf8").toString("base64")}`;
}

function fakeDecrypt(value: string) {
  if (!value.startsWith("enc:")) {
    throw new Error("bad ciphertext");
  }
  return Buffer.from(value.slice(4), "base64").toString("utf8");
}

let sqlite: SQLiteDatabase;
let changes: Array<{ instanceId: string; type: string }>;
let forgotten: string[];

function createRegistry() {
  const db = drizzle(sqlite, { schema });
  return createEngineInstanceRegistry({
    db: db as never,
    decrypt: fakeDecrypt,
    encrypt: fakeEncrypt,
    env: () => ({ HOME: "/Users/me", PATH: "/usr/bin" }),
    now: () => new Date("2026-10-07T12:00:00.000Z"),
    onChange: (change) => changes.push(change),
    platform: "darwin",
    runtimePaths: {
      remove: async (instanceId: string) => {
        forgotten.push(instanceId);
      },
    },
    stateRoot: () => "/Users/me/.sentinel",
  });
}

function rawRow(id: string) {
  return sqlite
    .prepare(`SELECT * FROM "engine_instance" WHERE "id" = ?`)
    .get(id) as Record<string, unknown> | null;
}

function insertThread(
  id: string,
  engine: string,
  instanceId: string | null,
  archived = false,
) {
  sqlite
    .prepare(
      `INSERT INTO "thread" ("id", "workspace_id", "user_id", "title", "chat_engine", "chat_engine_instance_id", "archived_at", "created_at", "updated_at") VALUES (?, 'ws-1', ?, 'T', ?, ?, ?, 1, 1)`,
    )
    .run(id, USER_ID, engine, instanceId, archived ? 1 : null);
}

beforeEach(() => {
  sqlite = new SQLiteDatabase(":memory:");
  ensureTables(drizzle(sqlite, { schema }) as never, sqlite as never);
  sqlite.exec(`
    INSERT INTO "user" ("id", "name", "email", "created_at", "updated_at")
      VALUES ('${USER_ID}', 'Me', 'me@local', 1, 1);
    INSERT INTO "workspace" ("id", "user_id", "name", "created_at", "updated_at")
      VALUES ('ws-1', '${USER_ID}', 'Repo', 1, 1);
  `);
  changes = [];
  forgotten = [];
});

describe("listing", () => {
  it("synthesizes a default instance per implemented driver", async () => {
    const summaries = await createRegistry().listSummaries(USER_ID);

    expect(summaries.map((summary) => summary.id)).toEqual([
      "sentinel",
      "codex",
      "claude",
      "copilot",
      "cursor",
      "opencode",
    ]);
    expect(summaries[1]).toMatchObject({
      availability: "available",
      driver: "codex",
      enabled: true,
      environment: [],
      isDefault: true,
      label: "Codex",
      persisted: false,
      unavailableReason: null,
    });
  });

  it("keeps rows of unknown or planned drivers as unavailable", async () => {
    sqlite.exec(`
      INSERT INTO "engine_instance" ("id", "user_id", "driver", "created_at", "updated_at")
        VALUES ('gemini-cli', '${USER_ID}', 'gemini', 1, 1),
               ('grok', '${USER_ID}', 'grok', 1, 1);
    `);
    const registry = createRegistry();
    const summaries = await registry.listSummaries(USER_ID);

    expect(
      summaries
        .filter((summary) => summary.availability === "unavailable")
        .map((summary) => [summary.id, summary.unavailableReason]),
    ).toEqual([
      ["grok", "driver-planned"],
      ["gemini-cli", "driver-unknown"],
    ]);
    expect((await registry.list(USER_ID)).map((i) => i.id)).not.toContain(
      "gemini-cli",
    );
    await expect(
      registry.resolve(USER_ID, { driver: "gemini", instanceId: "gemini-cli" }),
    ).rejects.toMatchObject({
      code: "engine_unavailable",
      reason: "driver-unknown",
    });
  });
});

describe("create", () => {
  it("allocates slug ids and labels per driver", async () => {
    const registry = createRegistry();

    const work = await registry.create(USER_ID, {
      driver: "codex",
      label: "Work",
    });
    const work2 = await registry.create(USER_ID, {
      driver: "codex",
      label: "Work",
    });
    const unnamed = await registry.create(USER_ID, { driver: "claude" });

    expect([work.id, work2.id, unnamed.id]).toEqual([
      "codex-work",
      "codex-work-2",
      "claude-2",
    ]);
    expect(unnamed.label).toBe("Claude 2");
    expect(work).toMatchObject({ isDefault: false, persisted: true });
    expect(changes).toEqual([
      { driver: "codex", instanceId: "codex-work", type: "created" },
      { driver: "codex", instanceId: "codex-work-2", type: "created" },
      { driver: "claude", instanceId: "claude-2", type: "created" },
    ] as never);
  });

  it("validates explicit ids", async () => {
    const registry = createRegistry();
    await registry.create(USER_ID, { driver: "codex", id: "personal" });

    for (const [id, code] of [
      ["Bad Id", "invalid"],
      ["claude", "conflict"],
      ["acp", "conflict"],
      ["personal", "conflict"],
    ] as const) {
      await expect(
        registry.create(USER_ID, { driver: "codex", id }),
      ).rejects.toMatchObject({ code });
    }
  });

  it("only creates instances of implemented multi-instance drivers", async () => {
    const registry = createRegistry();

    await expect(
      registry.create(USER_ID, { driver: "gemini" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      registry.create(USER_ID, { driver: "grok" }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      registry.create(USER_ID, { driver: "sentinel" }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("stores binaryPath/homePath in their columns and keeps other config", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      config: {
        binaryPath: "~/bin/codex",
        futureFlag: "on",
        homePath: "/Users/me/.codex-work",
      },
      driver: "codex",
      label: "Work",
    });

    expect(rawRow(created.id)).toMatchObject({
      binary_path: "~/bin/codex",
      config: JSON.stringify({ futureFlag: "on" }),
      home_path: "/Users/me/.codex-work",
    });
    expect(created.config).toEqual({
      binaryPath: "~/bin/codex",
      futureFlag: "on",
      homePath: "/Users/me/.codex-work",
    });
  });

  it("rejects invalid config, labels, colors, env and custom models", async () => {
    const registry = createRegistry();
    const cases = [
      { config: { homePath: "relative/home" } },
      { config: { launchArgs: "--flag" } },
      { label: "" },
      { accentColor: "red" },
      { environment: [{ name: "1BAD", value: "x" }] },
      {
        environment: [
          { name: "A", value: "1" },
          { name: "A", value: "2" },
        ],
      },
      { customModels: [{ id: "bad id" }] },
      { customModels: [{ id: "m" }, { id: "m" }] },
    ];

    for (const input of cases) {
      await expect(
        registry.create(USER_ID, { driver: "codex", ...input } as never),
      ).rejects.toBeInstanceOf(EngineInstanceError);
    }
  });
});

describe("environment secrets", () => {
  it("encrypts sensitive values at rest and never returns them", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      driver: "claude",
      environment: [
        { name: "ANTHROPIC_API_KEY", sensitive: true, value: "sk-ant-secret" },
        { name: "CLAUDE_CODE_DEBUG", value: "1" },
      ],
      label: "Work",
    });

    const stored = JSON.parse(String(rawRow(created.id)?.environment));
    expect(JSON.stringify(stored)).not.toContain("sk-ant-secret");
    expect(stored[0]).toMatchObject({
      encrypted: true,
      name: "ANTHROPIC_API_KEY",
      sensitive: true,
    });
    expect(fakeDecrypt(stored[0].value)).toBe("sk-ant-secret");

    expect(created.environment).toEqual([
      {
        name: "ANTHROPIC_API_KEY",
        needsReentry: false,
        sensitive: true,
        value: "",
        valueRedacted: true,
      },
      {
        name: "CLAUDE_CODE_DEBUG",
        needsReentry: false,
        sensitive: false,
        value: "1",
        valueRedacted: false,
      },
    ]);
    expect(JSON.stringify(await registry.listSummaries(USER_ID))).not.toContain(
      "sk-ant-secret",
    );

    const resolved = await registry.resolve(USER_ID, {
      driver: "claude",
      instanceId: created.id,
    });
    expect(resolved.env.ANTHROPIC_API_KEY).toBe("sk-ant-secret");
    expect(resolved.env.CLAUDE_CODE_DEBUG).toBe("1");
  });

  it("keeps a redacted secret on update and re-encrypts plain values", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      driver: "claude",
      environment: [{ name: "TOKEN", sensitive: true, value: "first" }],
      label: "Work",
    });

    await registry.update(USER_ID, created.id, {
      environment: [
        { name: "TOKEN", sensitive: true, value: "", valueRedacted: true },
        { name: "PLAIN", sensitive: true, value: "now-secret" },
      ],
    });
    const resolved = await registry.resolve(USER_ID, {
      driver: "claude",
      instanceId: created.id,
    });

    expect(resolved.env.TOKEN).toBe("first");
    expect(resolved.env.PLAIN).toBe("now-secret");
    expect(String(rawRow(created.id)?.environment)).not.toContain("now-secret");
  });

  it("leaves values it cannot decrypt unset and flags them for re-entry", async () => {
    const registry = createEngineInstanceRegistry({
      db: drizzle(sqlite, { schema }) as never,
      decrypt: fakeDecrypt,
      encrypt: fakeEncrypt,
      // The global environment has the default account's key.
      env: () => ({
        HOME: "/Users/me",
        OPENAI_API_KEY: "sk-global",
        PATH: "/usr/bin",
      }),
      platform: "darwin",
      stateRoot: () => "/Users/me/.sentinel",
    });
    sqlite.exec(`
      INSERT INTO "engine_instance" ("id", "user_id", "driver", "environment", "created_at", "updated_at")
        VALUES ('codex-old', '${USER_ID}', 'codex',
          '[{"name":"OPENAI_API_KEY","value":"garbage","sensitive":true,"encrypted":true}]', 1, 1);
    `);

    const resolved = await registry.resolve(USER_ID, {
      driver: "codex",
      instanceId: "codex-old",
    });
    expect(resolved.env.OPENAI_API_KEY).toBeUndefined();
    expect(Object.hasOwn(resolved.env, "OPENAI_API_KEY")).toBe(false);
    // Engines that start from process.env unset it too.
    expect(resolved.envUnset).toEqual(["OPENAI_API_KEY"]);
    expect(resolved.envOverrides).toEqual({});

    const summary = (await registry.listSummaries(USER_ID)).find(
      (candidate) => candidate.id === "codex-old",
    );
    expect(summary?.environment).toEqual([
      {
        name: "OPENAI_API_KEY",
        needsReentry: true,
        sensitive: true,
        value: "",
        valueRedacted: true,
      },
    ]);

    // Re-entering the value clears the flag.
    const updated = await registry.update(USER_ID, "codex-old", {
      environment: [
        { name: "OPENAI_API_KEY", sensitive: true, value: "sk-second" },
      ],
    });
    expect(updated.environment[0]?.needsReentry).toBe(false);
    expect(
      (
        await registry.resolve(USER_ID, {
          driver: "codex",
          instanceId: "codex-old",
        })
      ).env.OPENAI_API_KEY,
    ).toBe("sk-second");
  });

  it("refuses to turn a stored secret into a plain variable without a new value", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      driver: "claude",
      environment: [{ name: "TOKEN", sensitive: true, value: "secret" }],
      label: "Work",
    });

    await expect(
      registry.update(USER_ID, created.id, {
        environment: [
          { name: "TOKEN", sensitive: false, value: "", valueRedacted: true },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(String(rawRow(created.id)?.environment)).not.toContain("secret");
    expect(JSON.stringify(await registry.listSummaries(USER_ID))).not.toContain(
      "secret",
    );

    // A freshly entered value may be stored in the clear.
    const updated = await registry.update(USER_ID, created.id, {
      environment: [{ name: "TOKEN", sensitive: false, value: "now-plain" }],
    });
    expect(updated.environment).toEqual([
      {
        name: "TOKEN",
        needsReentry: false,
        sensitive: false,
        value: "now-plain",
        valueRedacted: false,
      },
    ]);
  });
});

describe("resolve", () => {
  it("resolves NULL instance ids to the default instance", async () => {
    const resolved = await createRegistry().resolve(USER_ID, {
      driver: "codex",
    });

    expect(resolved).toMatchObject({
      config: {},
      continuationKey: "codex:instance:codex",
      customModels: [],
      driver: "codex",
      id: "codex",
      isDefault: true,
      label: "Codex",
      stateDir: "/Users/me/.sentinel/engines/codex",
    });
    expect(resolved.env.PATH?.split(":")[0]).toBe("/usr/bin");
    expect(resolved.env.PATH).toContain("/Users/me/.local/bin");
    expect(resolved.env.CODEX_HOME).toBeUndefined();
  });

  it("isolates homes and keys continuation on the resolved home", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      config: { binaryPath: "~/bin/codex", homePath: "~/.codex-work" },
      driver: "codex",
      label: "Work",
    });

    const resolved = await registry.resolve(USER_ID, {
      driver: "codex",
      instanceId: created.id,
    });
    expect(resolved.env.CODEX_HOME).toBe("/Users/me/.codex-work");
    expect(resolved.envOverrides).toEqual({
      CODEX_HOME: "/Users/me/.codex-work",
    });
    expect(resolved.envUnset).toEqual([]);
    expect(resolved.config).toMatchObject({
      binaryPath: "/Users/me/bin/codex",
      homePath: "/Users/me/.codex-work",
    });
    expect(resolved.continuationKey).toBe("codex:home:/Users/me/.codex-work");

    const sameHome = await registry.create(USER_ID, {
      config: { homePath: "/Users/me/.codex-work/" },
      driver: "codex",
      label: "Work mirror",
    });
    expect(
      (
        await registry.resolve(USER_ID, {
          driver: "codex",
          instanceId: sameHome.id,
        })
      ).continuationKey,
    ).toBe(resolved.continuationKey);
  });

  it("lets instance env win over the configured home", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      config: { homePath: "/Users/me/.claude-a" },
      driver: "claude",
      environment: [
        { name: "CLAUDE_CONFIG_DIR", value: "/Users/me/.claude-b" },
      ],
      label: "B",
    });

    const resolved = await registry.resolve(USER_ID, {
      driver: "claude",
      instanceId: created.id,
    });
    expect(resolved.env.CLAUDE_CONFIG_DIR).toBe("/Users/me/.claude-b");
    expect(resolved.continuationKey).toBe("claude:home:/Users/me/.claude-b");
  });

  it("reports why an instance cannot run", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      driver: "codex",
      enabled: false,
      label: "Off",
    });
    sqlite.exec(`
      INSERT INTO "engine_instance" ("id", "user_id", "driver", "home_path", "created_at", "updated_at")
        VALUES ('codex-broken', '${USER_ID}', 'codex', '', 1, 1);
    `);

    const cases: Array<[{ driver: string; instanceId?: string }, string]> = [
      [{ driver: "codex", instanceId: created.id }, "disabled"],
      [{ driver: "codex", instanceId: "codex-gone" }, "missing"],
      [{ driver: "claude", instanceId: created.id }, "driver-mismatch"],
      [{ driver: "codex", instanceId: "codex-broken" }, "config-invalid"],
      [{ driver: "acp" }, "driver-planned"],
      [{ driver: "gemini" }, "driver-unknown"],
    ];

    for (const [target, reason] of cases) {
      const error = await registry.resolve(USER_ID, target).catch((e) => e);
      expect(error).toBeInstanceOf(EngineInstanceUnavailableError);
      expect(error.reason).toBe(reason);
    }
  });
});

describe("update", () => {
  it("persists a synthesized default instance on first change", async () => {
    const registry = createRegistry();

    const updated = await registry.update(USER_ID, "codex", {
      accentColor: "#FF8800",
      config: { homePath: "/Users/me/.codex" },
    });

    expect(updated).toMatchObject({
      accentColor: "#ff8800",
      isDefault: true,
      label: "Codex",
      persisted: true,
    });
    expect(rawRow("codex")).toMatchObject({
      driver: "codex",
      home_path: "/Users/me/.codex",
      label: null,
    });
    expect(forgotten).toEqual(["codex"]);
    expect(changes.at(-1)).toEqual({
      driver: "codex",
      instanceId: "codex",
      type: "updated",
    });
  });

  it("keeps instances per user", async () => {
    sqlite.exec(`
      INSERT INTO "user" ("id", "name", "email", "created_at", "updated_at")
        VALUES ('user-2', 'Other', 'other@local', 1, 1);
    `);
    const registry = createRegistry();

    await registry.update(USER_ID, "codex", { accentColor: "#000000" });
    await registry.update("user-2", "codex", { accentColor: "#ffffff" });
    await registry.create("user-2", { driver: "codex", id: "codex-work" });

    expect((await registry.listSummaries(USER_ID))[1]).toMatchObject({
      accentColor: "#000000",
      id: "codex",
    });
    expect((await registry.listSummaries("user-2"))[1]).toMatchObject({
      accentColor: "#ffffff",
      id: "codex",
    });
    expect(await registry.get(USER_ID, "codex-work")).toBeNull();
    expect(
      (await registry.create(USER_ID, { driver: "codex", id: "codex-work" }))
        .id,
    ).toBe("codex-work");
  });

  it("refuses unknown instances", async () => {
    await expect(
      createRegistry().update(USER_ID, "codex-nope", { label: "x" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("replaces config and environment, keeps the rest", async () => {
    const registry = createRegistry();
    const created = await registry.create(USER_ID, {
      accentColor: "#112233",
      config: { binaryPath: "/opt/codex", homePath: "/Users/me/.codex-w" },
      driver: "codex",
      environment: [{ name: "A", value: "1" }],
      label: "Work",
    });

    const updated = await registry.update(USER_ID, created.id, {
      config: { binaryPath: "/opt/codex-2" },
      sortOrder: 7,
    });

    expect(updated).toMatchObject({
      accentColor: "#112233",
      config: { binaryPath: "/opt/codex-2" },
      environment: [{ name: "A", value: "1" }],
      label: "Work",
      sortOrder: 7,
    });
    expect(rawRow(created.id)).toMatchObject({
      binary_path: "/opt/codex-2",
      home_path: null,
    });
    expect(forgotten).toEqual([created.id]);
    await expect(
      registry.update(USER_ID, created.id, { sortOrder: 1.5 }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("removal and disabling guard (G9)", () => {
  it("counts non-archived threads, automations and the user default", async () => {
    const registry = createRegistry();
    const work = await registry.create(USER_ID, {
      driver: "codex",
      label: "Work",
    });

    insertThread("t-default", "codex", null);
    insertThread("t-default-archived", "codex", null, true);
    insertThread("t-work", "codex", work.id);
    insertThread("t-claude", "claude", null);
    sqlite.exec(`
      INSERT INTO "automation" ("id", "user_id", "title", "prompt", "chat_engine", "chat_engine_instance_id", "created_at", "updated_at")
        VALUES ('a-1', '${USER_ID}', 'A', 'p', 'codex', NULL, 1, 1),
               ('a-2', '${USER_ID}', 'B', 'p', 'codex', '${work.id}', 1, 1);
      UPDATE "user" SET "default_chat_engine" = 'codex';
    `);

    expect(
      await registry.countReferences(USER_ID, {
        driver: "codex",
        instanceId: "codex",
      }),
    ).toEqual({ automations: 1, threads: 1, userDefault: true });
    expect(
      await registry.countReferences(USER_ID, {
        driver: "codex",
        instanceId: work.id,
      }),
    ).toEqual({ automations: 1, threads: 1, userDefault: false });

    sqlite.exec(
      `UPDATE "user" SET "default_chat_engine_instance_id" = '${work.id}'`,
    );
    expect(
      (
        await registry.countReferences(USER_ID, {
          driver: "codex",
          instanceId: work.id,
        })
      ).userDefault,
    ).toBe(true);
    expect(
      (
        await registry.countReferences(USER_ID, {
          driver: "codex",
          instanceId: "codex",
        })
      ).userDefault,
    ).toBe(false);
  });

  it("refuses to remove or disable an instance in use unless forced", async () => {
    const registry = createRegistry();
    const work = await registry.create(USER_ID, {
      driver: "codex",
      label: "Work",
    });
    insertThread("t-work", "codex", work.id);

    const error = await registry.remove(USER_ID, work.id).catch((e) => e);
    expect(error).toBeInstanceOf(EngineInstanceError);
    expect(error).toMatchObject({
      code: "in-use",
      details: {
        references: { automations: 0, threads: 1, userDefault: false },
      },
    });
    await expect(
      registry.setEnabled(USER_ID, work.id, false),
    ).rejects.toMatchObject({ code: "in-use" });

    expect(
      await registry.setEnabled(USER_ID, work.id, false, { force: true }),
    ).toMatchObject({ enabled: false });
    expect(await registry.remove(USER_ID, work.id, { force: true })).toEqual({
      reset: false,
    });
    expect(rawRow(work.id)).toBeNull();
    expect(forgotten).toContain(work.id);
  });

  it("moves the user default off a force-removed instance", async () => {
    const registry = createRegistry();
    const work = await registry.create(USER_ID, {
      driver: "codex",
      label: "Work",
    });
    insertThread("t-work", "codex", work.id);
    sqlite.exec(`
      UPDATE "user" SET "default_chat_engine" = 'codex',
        "default_chat_engine_instance_id" = '${work.id}';
    `);

    await expect(registry.remove(USER_ID, work.id)).rejects.toMatchObject({
      code: "in-use",
      details: {
        references: { automations: 0, threads: 1, userDefault: true },
      },
    });
    await registry.remove(USER_ID, work.id, { force: true });

    expect(
      sqlite
        .prepare(
          `SELECT "default_chat_engine", "default_chat_engine_instance_id" FROM "user"`,
        )
        .get(),
    ).toEqual({
      default_chat_engine: "codex",
      default_chat_engine_instance_id: null,
    });
    // The thread keeps its dangling id and now resolves as unavailable.
    expect(
      sqlite.prepare(`SELECT "chat_engine_instance_id" FROM "thread"`).get(),
    ).toEqual({ chat_engine_instance_id: work.id });
    await expect(
      registry.resolve(USER_ID, { driver: "codex", instanceId: work.id }),
    ).rejects.toMatchObject({ code: "engine_unavailable", reason: "missing" });
    expect(changes.at(-1)).toEqual({
      driver: "codex",
      instanceId: work.id,
      type: "removed",
    });
  });

  it("guards default instances through NULL instance ids", async () => {
    const registry = createRegistry();
    insertThread("t-default", "copilot", null);

    await expect(
      registry.setEnabled(USER_ID, "copilot", false),
    ).rejects.toMatchObject({ code: "in-use" });

    sqlite.exec(`UPDATE "thread" SET "archived_at" = 1`);
    expect(await registry.setEnabled(USER_ID, "copilot", false)).toMatchObject({
      enabled: false,
      persisted: true,
    });
    expect(await registry.remove(USER_ID, "copilot")).toEqual({ reset: true });
    expect((await registry.get(USER_ID, "copilot"))?.status).toBe("available");
  });

  it("never disables or removes the built-in engine", async () => {
    const registry = createRegistry();

    await expect(
      registry.setEnabled(USER_ID, "sentinel", false, { force: true }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      registry.remove(USER_ID, "sentinel", { force: true }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("change listeners", () => {
  it("fans out to subscribers until they unsubscribe", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToEngineInstanceChanges((change) =>
      seen.push(`a:${change.instanceId}`),
    );
    const unsubscribeThrowing = subscribeToEngineInstanceChanges(() => {
      throw new Error("listener failure");
    });
    const unsubscribeB = subscribeToEngineInstanceChanges((change) =>
      seen.push(`b:${change.instanceId}`),
    );

    notifyEngineInstanceChange({
      driver: "codex",
      instanceId: "codex-work",
      type: "created",
    });
    unsubscribe();
    unsubscribeThrowing();
    notifyEngineInstanceChange({
      driver: "codex",
      instanceId: "codex-home",
      type: "updated",
    });
    unsubscribeB();

    expect(seen).toEqual(["a:codex-work", "b:codex-work", "b:codex-home"]);
  });
});

describe("getConfiguredEngineBinary", () => {
  const base = {
    config: {},
    driver: "claude",
    env: { CLAUDE_PATH: "/opt/claude", SENTINEL_CLAUDE_PATH: "" },
    isDefault: true,
  };

  it("prefers the instance binaryPath", () => {
    expect(
      getConfiguredEngineBinary({
        ...base,
        config: { binaryPath: "/usr/local/bin/claude" },
      }),
    ).toEqual({ path: "/usr/local/bin/claude", source: "config" });
  });

  it("reads legacy SENTINEL_<X>_PATH keys for the default instance only", () => {
    expect(getConfiguredEngineBinary(base)).toEqual({
      path: "/opt/claude",
      source: "env",
    });
    expect(getConfiguredEngineBinary({ ...base, isDefault: false })).toBeNull();
  });
});
