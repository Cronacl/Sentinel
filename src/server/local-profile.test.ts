import { describe, expect, it, mock } from "bun:test";

const mkdir = mock(async () => {});
const readFile = mock(async () => JSON.stringify({ localProfileId: "user-1" }));
const writeFile = mock(async () => {});
const findFirst = mock(async () => ({
  email: "local@sentinel.app",
  id: "user-1",
  image: null,
  name: "Sentinel (tester)",
}));
const insertRun = mock(() => {});

mock.module("server-only", () => ({}));
mock.module("node:fs/promises", () => ({
  mkdir,
  readFile,
  writeFile,
}));
mock.module("@/env", () => ({
  env: {
    SENTINEL_STATE_PATH: "/tmp/sentinel-state.json",
  },
}));
mock.module("drizzle-orm", () => ({
  eq: (...args: unknown[]) => args,
}));
mock.module("@/server/db/schema", () => ({
  users: {
    createdAt: "createdAt",
    email: "email",
    id: "id",
  },
}));
mock.module("@/server/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          run: insertRun,
        }),
      }),
    }),
    query: {
      users: {
        findFirst,
      },
    },
  },
}));

const { getLocalSession, getOrCreateLocalProfile } =
  await import("./local-profile");

describe("local profile memoization", () => {
  it("reuses the first resolved local profile and session for repeated calls", async () => {
    const firstProfile = await getOrCreateLocalProfile();
    const secondProfile = await getOrCreateLocalProfile();
    const firstSession = await getLocalSession();
    const secondSession = await getLocalSession();

    expect(firstProfile).toEqual({
      email: "local@sentinel.app",
      id: "user-1",
      image: null,
      name: "Sentinel (tester)",
    });
    expect(secondProfile).toBe(firstProfile);
    expect(firstSession).toEqual({
      user: {
        email: "local@sentinel.app",
        id: "user-1",
        image: null,
        name: "Sentinel (tester)",
      },
    });
    expect(secondSession).toBe(firstSession);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(insertRun).not.toHaveBeenCalled();
  });
});
