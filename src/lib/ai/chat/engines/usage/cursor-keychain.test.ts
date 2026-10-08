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
  it("reads the CLI login with the security tool and keeps it per instance", async () => {
    const execFile = mock(async () => ({ stdout: "secret-token\n" }));

    await readCursorKeychainToken("cursor", { execFile, platform: "darwin" });

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
    expect(getCursorKeychainToken("cursor")).toBe("secret-token");
    expect(getCursorKeychainToken("cursor-work")).toBeNull();

    forgetCursorKeychainToken("cursor");
    expect(getCursorKeychainToken("cursor")).toBeNull();
  });

  it("refuses outside macOS without running anything", async () => {
    const execFile = mock(async () => ({ stdout: "x" }));
    await expect(
      readCursorKeychainToken("cursor", { execFile, platform: "linux" }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("reports a denied prompt or an empty item", async () => {
    await expect(
      readCursorKeychainToken("cursor", {
        execFile: async () => {
          throw new Error("User canceled the operation.");
        },
        platform: "darwin",
      }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    await expect(
      readCursorKeychainToken("cursor", {
        execFile: async () => ({ stdout: "  \n" }),
        platform: "darwin",
      }),
    ).rejects.toBeInstanceOf(CursorKeychainUnavailableError);
    expect(getCursorKeychainToken("cursor")).toBeNull();
  });
});
