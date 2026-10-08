import { afterEach, describe, expect, it, mock } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const {
  AUTH_URL_MARKER,
  authBrowserEnv,
  buildAuthBrowserHelperScript,
  ensureAuthBrowserHelper,
  parseAuthBrowserMarker,
} = await import("./browser-helper");

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("auth browser helper", () => {
  it("is a shell script on POSIX and a .cmd on Windows", () => {
    expect(buildAuthBrowserHelperScript("darwin")).toEqual({
      content: expect.stringMatching(/^#!\/bin\/sh\n/),
      fileName: "sentinel-auth-browser.sh",
    });
    const windows = buildAuthBrowserHelperScript("win32");
    expect(windows.fileName).toBe("sentinel-auth-browser.cmd");
    expect(windows.content).toContain(`>&2 echo ${AUTH_URL_MARKER}"%~1"`);
  });

  it.skipIf(process.platform === "win32")(
    "prints the URL it is given without evaluating it",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "auth-browser-"));
      directories.push(directory);
      const helper = await ensureAuthBrowserHelper(
        path.join(directory, "state"),
      );
      expect((await stat(helper)).mode & 0o777).toBe(0o700);
      expect(authBrowserEnv(helper)).toEqual({ BROWSER: helper });

      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?a=1&b=$(touch x)&redirect_uri=http%3A%2F%2F127.0.0.1%3A4123%2F";
      const result = spawnSync("/bin/sh", [helper, url], {
        cwd: directory,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(parseAuthBrowserMarker(result.stderr.trim())).toBe(url);
      // `$(touch x)` stayed text.
      await expect(stat(path.join(directory, "x"))).rejects.toThrow();

      // A second call keeps the file as is.
      expect(await ensureAuthBrowserHelper(path.join(directory, "state"))).toBe(
        helper,
      );
    },
  );

  it("only takes https (or loopback http) URLs behind the marker", () => {
    expect(
      parseAuthBrowserMarker(
        `noise ${AUTH_URL_MARKER}"https://auth.example.com/x?y=1"`,
      ),
    ).toBe("https://auth.example.com/x?y=1");
    expect(parseAuthBrowserMarker(`${AUTH_URL_MARKER}"javascript:x"`)).toBe(
      null,
    );
    expect(parseAuthBrowserMarker(`${AUTH_URL_MARKER}https://x`)).toBe(null);
    expect(parseAuthBrowserMarker("Open https://example.com")).toBe(null);
  });
});
