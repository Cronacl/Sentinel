import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  CursorKeychainUnavailableError,
  forgetCursorKeychainToken,
  getCursorKeychainToken,
  readCursorKeychainToken,
} = await import("./cursor-keychain");

afterEach(() => forgetCursorKeychainToken());

describe("Cursor Keychain login", () => {
  it("reads the CLI login with the security tool and keeps it per user and instance", async () => {
    const execFile = mock(async () => ({ stdout: "secret-token\n" }));

    await readCursorKeychainToken("user-1", "cursor", {
      execFile,
      platform: "darwin",
    });

    expect(execFile).toHaveBeenCalledWith(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-s",
        "cursor-access-token",
        "-a",
        "cursor-user",
        "-w",
      ],
      { timeout: 60_000 },
    );
    expect(getCursorKeychainToken("user-1", "cursor")).toBe("secret-token");
    expect(getCursorKeychainToken("user-1", "cursor-work")).toBeNull();
    // Another user never reuses a login they did not let Sentinel read.
    expect(getCursorKeychainToken("user-2", "cursor")).toBeNull();

    forgetCursorKeychainToken({ instanceId: "cursor", userId: "user-1" });
    expect(getCursorKeychainToken("user-1", "cursor")).toBeNull();
  });

  it("forgets an instance's logins for every user", async () => {
    const execFile = async () => ({ stdout: "token" });
    await readCursorKeychainToken("user-1", "cursor", {
      execFile,
      platform: "darwin",
    });
    await readCursorKeychainToken("user-2", "cursor", {
      execFile,
      platform: "darwin",
    });
    await readCursorKeychainToken("user-1", "cursor-work", {
      execFile,
      platform: "darwin",
    });

    forgetCursorKeychainToken({ instanceId: "cursor" });

    expect(getCursorKeychainToken("user-1", "cursor")).toBeNull();
    expect(getCursorKeychainToken("user-2", "cursor")).toBeNull();
    expect(getCursorKeychainToken("user-1", "cursor-work")).toBe("token");
  });

  it("refuses outside macOS without running anything", async () => {
    const execFile = mock(async () => ({ stdout: "x" }));
    await expect(
      readCursorKeychainToken("user-1", "cursor", {
        execFile,
        platform: "linux",
      }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("reports a denied prompt or an empty item", async () => {
    await expect(
      readCursorKeychainToken("user-1", "cursor", {
        execFile: async () => {
          throw new Error("User canceled the operation.");
        },
        platform: "darwin",
      }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    await expect(
      readCursorKeychainToken("user-1", "cursor", {
        execFile: async () => ({ stdout: "  \n" }),
        platform: "darwin",
      }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    expect(getCursorKeychainToken("user-1", "cursor")).toBeNull();
  });
});
