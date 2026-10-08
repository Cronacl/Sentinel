import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { createRuntimePathsStore, getRuntimePathsFilePath } =
  await import("./paths-cache");

let root: string;
let filePath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "sentinel-runtime-paths-"));
  filePath = getRuntimePathsFilePath({ stateRoot: root });
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

function createStore() {
  return createRuntimePathsStore({
    filePath,
    now: () => new Date("2026-10-07T12:00:00.000Z"),
  });
}

describe("runtime paths store", () => {
  it("lives under <state root>/engines", () => {
    expect(filePath).toBe(path.join(root, "engines", "runtime-paths.json"));
  });

  it("persists entries per instance with private permissions", async () => {
    const store = createStore();

    await store.set("codex", {
      binaryPath: "/opt/homebrew/bin/codex",
      realPath: "/opt/homebrew/Cellar/codex/0.160.0/bin/codex",
      source: "login-shell",
      version: "0.160.0",
    });
    await store.set("codex-work", {
      binaryPath: "/Users/me/bin/codex",
      realPath: null,
      source: "config",
      version: null,
    });

    expect(await createStore().get("codex")).toEqual({
      binaryPath: "/opt/homebrew/bin/codex",
      realPath: "/opt/homebrew/Cellar/codex/0.160.0/bin/codex",
      resolvedAt: "2026-10-07T12:00:00.000Z",
      source: "login-shell",
      version: "0.160.0",
    });
    expect(Object.keys(await store.readAll()).sort()).toEqual([
      "codex",
      "codex-work",
    ]);
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
    }

    await store.remove("codex");
    expect(await store.get("codex")).toBeNull();
    expect(JSON.parse(readFileSync(filePath, "utf8")).version).toBe(1);
  });

  it("serializes concurrent writes", async () => {
    const store = createStore();

    await Promise.all(
      ["a", "b", "c", "d", "e"].map((id) =>
        store.set(`cursor-${id}`, {
          binaryPath: `/bin/${id}`,
          realPath: null,
          source: "managed-path",
          version: null,
        }),
      ),
    );

    expect(Object.keys(await store.readAll())).toHaveLength(5);
  });

  it("treats a missing or corrupt file as empty and drops bad entries", async () => {
    const store = createStore();
    expect(await store.readAll()).toEqual({});

    await store.set("codex", {
      binaryPath: "/bin/codex",
      realPath: null,
      source: "env",
      version: null,
    });
    writeFileSync(filePath, "{not json");
    expect(await store.readAll()).toEqual({});

    writeFileSync(
      filePath,
      JSON.stringify({
        instances: {
          "Bad Id": { binaryPath: "/x" },
          claude: { binaryPath: "" },
          codex: {
            binaryPath: "/bin/codex",
            realPath: null,
            resolvedAt: "2026-10-07T12:00:00.000Z",
            source: "env",
            version: null,
          },
        },
        version: 1,
      }),
    );
    expect(Object.keys(await store.readAll())).toEqual(["codex"]);
  });

  it("rejects invalid instance ids", async () => {
    await expect(
      createStore().set("Not A Slug", {
        binaryPath: "/bin/x",
        realPath: null,
        source: "env",
        version: null,
      }),
    ).rejects.toThrow();
  });
});
