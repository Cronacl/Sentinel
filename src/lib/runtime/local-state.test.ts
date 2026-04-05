import { describe, expect, it } from "bun:test";

import {
  getSentinelDbFilePath,
  getSentinelStateFilePath,
  getSentinelStateRoot,
} from "./local-state";

describe("local state helpers", () => {
  it("derives Windows state paths from the user profile", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      USERPROFILE: "C:\\Users\\sentinel",
    };

    expect(getSentinelStateRoot({ env, platform: "win32" })).toBe(
      "C:\\Users\\sentinel\\.sentinel",
    );
    expect(getSentinelStateFilePath({ env, platform: "win32" })).toBe(
      "C:\\Users\\sentinel\\.sentinel\\state.json",
    );
    expect(getSentinelDbFilePath({ env, platform: "win32" })).toBe(
      "C:\\Users\\sentinel\\.sentinel\\sentinel.db",
    );
  });

  it("honors explicit DB and state path overrides", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      SENTINEL_DB_PATH: "/tmp/sentinel.db",
      SENTINEL_STATE_PATH: "/tmp/state.json",
    };

    expect(getSentinelStateRoot({ env, platform: "linux" })).toBe("/tmp");
    expect(getSentinelStateFilePath({ env, platform: "linux" })).toBe(
      "/tmp/state.json",
    );
    expect(getSentinelDbFilePath({ env, platform: "linux" })).toBe(
      "/tmp/sentinel.db",
    );
  });
});
