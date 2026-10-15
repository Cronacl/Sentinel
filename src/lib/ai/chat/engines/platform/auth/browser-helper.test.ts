import { afterEach, describe, expect, it, mock } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const {
  AUTH_URL_MARKER,
  authBrowserEnv,
  buildAuthBrowserHelperScript,
  ensureAuthBrowserCommand,
  ensureAuthBrowserHelper,
  parseAuthBrowserMarker,
  verifyAuthBrowserCommand,
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
  it("is a shell script that always exits 0", () => {
    expect(buildAuthBrowserHelperScript()).toEqual({
      content: expect.stringMatching(/^#!\/bin\/sh\n[^\n]*\ntrap '' PIPE\n/),
      fileName: "sentinel-auth-browser.sh",
    });
    expect(buildAuthBrowserHelperScript().content).toEndWith("exit 0\n");
  });

  it.skipIf(process.platform === "win32")(
    "verifies the POSIX helper, and refuses one that does not print the marker",
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "auth-browser-"));
      directories.push(directory);
      const command = await ensureAuthBrowserCommand(directory, {
        platform: "darwin",
      });
      expect(command.browser).toBe(
        path.join(directory, "sentinel-auth-browser.sh"),
      );
      await verifyAuthBrowserCommand(command, { PATH: process.env.PATH });

      const broken = path.join(directory, "broken.sh");
      await writeFile(broken, "#!/bin/sh\necho opened\nexit 1\n", {
        mode: 0o700,
      });
      await expect(
        verifyAuthBrowserCommand(
          {
            args: (url) => [url],
            browser: broken,
            env: {},
            executable: broken,
          },
          {},
        ),
      ).rejects.toThrow("could not verify");
    },
  );

  it("on Windows runs Sentinel's runtime as Node with an inline script", async () => {
    const command = await ensureAuthBrowserCommand("C:\\unused", {
      nodeExecutable: "C:\\Program Files\\Sentinel\\Sentinel.exe",
      platform: "win32",
    });
    expect(command.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
    // shlex-quoted, forward slashes, `%s` for Python, no `;` (Windows' separator).
    expect(command.browser).toStartWith(
      "'C:/Program Files/Sentinel/Sentinel.exe' '-e' '",
    );
    expect(command.browser).toEndWith("' '--' '%s'");
    expect(command.browser).not.toContain(";");
    expect(command.args("u")).toEqual(["-e", expect.any(String), "--", "u"]);
  });

  it("the Windows inline script passes the preflight (run here under this runtime)", async () => {
    const command = await ensureAuthBrowserCommand("unused", {
      nodeExecutable: process.execPath,
      platform: "win32",
    });
    await verifyAuthBrowserCommand(command, { PATH: process.env.PATH });
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
      // Closed stderr (the agent stopped reading) still exits 0.
      expect(
        spawnSync(helper, ["https://x"], {
          stdio: ["ignore", "ignore", "ignore"],
        }).status,
      ).toBe(0);

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
