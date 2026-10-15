import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

// Kinds the catalog still marks "planned" stay hidden from every picker and
// are never dispatched, whatever a stored row, a request or a newer build's
// snapshot names. A kind lands by flipping its own catalog entry; from then
// on these checks skip it and the driver conformance suite covers it.
mock.module("server-only", () => ({}));

// @ts-expect-error Bun test-only cache-busting import of the real module.
const { ensureTables } = await import("@/server/db/index.ts?planned-actual");

const { PLANNED_DRIVER_KINDS, listDefaultInstanceDrivers } =
  await import("../catalog");
const { isPickableEngineSnapshot } = await import("../composer-catalog");
const { makeFakeSnapshot } = await import("../contract/testing");
const { getEngineDriver, SERVER_DRIVERS } = await import("../platform/drivers");
const { EngineInstanceUnavailableError } = await import("../platform/errors");
const { createEngineInstanceRegistry } = await import("../platform/instances");
const { createEngineDispatcher } =
  await import("@/lib/ai/chat/runtime/thread-chat/engine-dispatcher");
const { canAddEngineInstance } =
  await import("@/components/settings/engines/instance-management");
const { assertEngineInstanceSelection } =
  await import("@/server/api/routers/engines/selection");
const { definePlannedEngineDriver } = await import("./planned");

const USER_ID = "user-1";

let sqlite: SQLiteDatabase;
let registry: ReturnType<typeof createEngineInstanceRegistry>;

beforeEach(() => {
  sqlite = new SQLiteDatabase(":memory:");
  ensureTables(drizzle(sqlite, { schema }) as never, sqlite as never);
  registry = createEngineInstanceRegistry({
    db: drizzle(sqlite, { schema }) as never,
    decrypt: (value) => value,
    encrypt: (value) => value,
    env: () => ({ HOME: "/Users/me", PATH: "/usr/bin" }),
    platform: "darwin",
    runtimePaths: { remove: async () => {} },
    stateRoot: () => "/Users/me/.sentinel",
  });
});

/** Rows a newer build (where the kind is implemented) would have written. */
function insertNewerBuildRows() {
  for (const kind of PLANNED_DRIVER_KINDS) {
    sqlite.exec(`
      INSERT INTO "engine_instance" ("id", "user_id", "driver", "created_at", "updated_at")
        VALUES ('${kind}-work', '${USER_ID}', '${kind}', 1, 1);
    `);
  }
}

function request() {
  return {
    threadId: "thread-1",
    trigger: "submit-user-message" as const,
    userId: USER_ID,
    workspaceId: "workspace-1",
  };
}

describe("planned driver kinds", () => {
  it("keep a registered stub that is never served", () => {
    for (const kind of PLANNED_DRIVER_KINDS) {
      expect(SERVER_DRIVERS.map((driver) => driver.kind)).toContain(kind);
      expect(getEngineDriver(kind)).toBeNull();
    }
  });

  it("are hidden from pickers, settings and default instances", async () => {
    insertNewerBuildRows();
    const summaries = await registry.listSummaries(USER_ID);

    for (const kind of PLANNED_DRIVER_KINDS) {
      expect(listDefaultInstanceDrivers()).not.toContain(kind);
      // No default instance is synthesized; a stored row reads unavailable.
      expect(
        summaries
          .filter((summary) => summary.driver === kind)
          .map((summary) => [summary.id, summary.unavailableReason]),
      ).toEqual([[`${kind}-work`, "driver-planned"]]);
      expect(
        (await registry.list(USER_ID)).some(
          (instance) => instance.driver === kind,
        ),
      ).toBe(false);
      // Even a snapshot that claims to be usable stays out of the composer.
      expect(
        isPickableEngineSnapshot(
          makeFakeSnapshot({ availability: "available", driver: kind }),
        ),
      ).toBe(false);
      expect(canAddEngineInstance(kind)).toBe(false);
      await expect(
        registry.create(USER_ID, { driver: kind }),
      ).rejects.toMatchObject({ code: "unsupported" });
    }
  });

  it("refuse to be selected for a thread, an automation or the default", async () => {
    for (const kind of PLANNED_DRIVER_KINDS) {
      for (const instanceId of [null, undefined, kind, `${kind}-work`]) {
        await expect(
          assertEngineInstanceSelection(USER_ID, kind, instanceId),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    }
  });

  it("never dispatch a turn, and leave a stop to the generic handler", async () => {
    insertNewerBuildRows();
    const dispatcher = createEngineDispatcher({
      drivers: getEngineDriver,
      resolveInstance: (userId, target) => registry.resolve(userId, target),
    });

    for (const kind of PLANNED_DRIVER_KINDS) {
      for (const instanceId of [null, `${kind}-work`]) {
        const target = { driver: kind, instanceId };
        const error = await dispatcher
          .run(target, request(), null)
          .catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(EngineInstanceUnavailableError);
        expect(error).toMatchObject({
          code: "engine_unavailable",
          reason: "driver-planned",
        });

        await expect(
          dispatcher.stop(
            target,
            { ...request(), trigger: "stop-stream" },
            null,
          ),
        ).resolves.toBeNull();
      }
    }
  });

  it("type their stub slot to planned kinds only", () => {
    // @ts-expect-error Codex is implemented: its slot holds the real driver.
    const implemented = () => definePlannedEngineDriver("codex");
    expect(typeof implemented).toBe("function");
  });
});
