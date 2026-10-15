import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const profile = await import("./profile");
const { makeFakeInstance } =
  await import("@/lib/ai/chat/engines/contract/testing");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-profile-"));
  roots.push(dir);
  return dir;
}

function instance(overrides: Parameters<typeof makeFakeInstance>[0] = {}) {
  return makeFakeInstance({
    driver: "antigravity",
    id: "antigravity",
    ...overrides,
  });
}

describe("readAntigravityAuthConfig", () => {
  it("prefers the last sign-in's method, then the config, then the Google account", () => {
    const configured = instance({
      config: { authMethodId: "gemini-api-key" } as never,
      envOverrides: { GEMINI_API_KEY: "key-1" },
    });
    expect(profile.readAntigravityAuthConfig(configured).authMethod).toBe(
      "gemini-api-key",
    );
    expect(profile.readAntigravityAuthConfig(configured).apiKey).toBe("key-1");
    expect(
      profile.readAntigravityAuthConfig(configured, "oauth-personal")
        .authMethod,
    ).toBe("oauth-personal");
    expect(profile.readAntigravityAuthConfig(instance()).authMethod).toBe(
      "oauth-personal",
    );
  });

  it("never takes a credential from the server's own environment", () => {
    const auth = profile.readAntigravityAuthConfig(
      instance({
        config: { authMethodId: "gemini-api-key" } as never,
        env: { GEMINI_API_KEY: "server-key" },
      }),
    );
    expect(auth.apiKey).toBe("");
    expect(profile.antigravityAuthConfigIssue(auth)).toContain("API key");
  });

  it("says what Enterprise and Agent Platform still need", () => {
    const business = profile.readAntigravityAuthConfig(
      instance(),
      "oauth-business",
    );
    expect(profile.antigravityAuthConfigIssue(business)).toContain("project");
    const complete = profile.readAntigravityAuthConfig(
      instance({
        envOverrides: {
          GOOGLE_CLOUD_LOCATION: "us-central1",
          GOOGLE_CLOUD_PROJECT: "proj",
        },
      }),
      "agent-platform",
    );
    expect(profile.antigravityAuthConfigIssue(complete)).toBeNull();
    expect(JSON.parse(profile.antigravityProfileSettings(complete))).toEqual({
      auth: { type: "agent-platform" },
      gcp: { location: "us-central1", project: "proj" },
    });
  });
});

describe("prepareAntigravityProfile and buildAntigravityEnv", () => {
  it("prepares a private profile, links the user's skills and curates the env", async () => {
    const dir = await tempDir();
    const home = path.join(dir, "home");
    const userSkills = path.join(home, ".gemini", "config", "skills");
    await mkdir(userSkills, { recursive: true });
    await writeFile(path.join(userSkills, "marker.md"), "user skill\n");
    const target = instance({
      env: { HOME: home, USERPROFILE: home },
      envOverrides: { GEMINI_API_KEY: "instance-key" },
      stateDir: path.join(dir, "state"),
    });
    const auth = profile.readAntigravityAuthConfig(target, "gemini-api-key");
    const prepared = await profile.prepareAntigravityProfile({
      auth,
      instance: target,
    });

    expect(prepared.geminiHome).toBe(path.join(dir, "state", "gemini-home"));
    // Windows reports no POSIX permission bits.
    if (process.platform !== "win32") {
      expect((await lstat(prepared.geminiHome)).mode & 0o777).toBe(0o700);
    }
    expect(
      JSON.parse(
        await readFile(
          path.join(prepared.acpDirectory, "settings.json"),
          "utf8",
        ),
      ),
    ).toEqual({ auth: { type: "gemini-api-key" } });
    // A directory symlink on POSIX, a junction on Windows: read through it.
    expect(
      await readFile(
        path.join(prepared.geminiHome, "config", "skills", "marker.md"),
        "utf8",
      ),
    ).toBe("user skill\n");
    if (process.platform !== "win32") {
      expect(
        await readlink(path.join(prepared.geminiHome, "config", "skills")),
      ).toBe(userSkills);
      expect(await readFile(prepared.browser.browser, "utf8")).toStartWith(
        "#!/bin/sh",
      );
    }

    const env = profile.buildAntigravityEnv({
      auth,
      env: {
        BROWSER: "firefox",
        GOOGLE_API_KEY: "leaked",
        GOOGLE_APPLICATION_CREDENTIALS: "/creds.json",
        HOME: home,
        PATH: "/usr/bin",
        TMPDIR: "/tmp",
      },
      harnessPath: "/opt/agy/localharness_external",
      platform: "darwin",
      profile: prepared,
    });
    expect(env).toEqual({
      AGY_ACP_FORCE_FILE_STORAGE: "1",
      ANTIGRAVITY_HARNESS_PATH: "/opt/agy/localharness_external",
      ...prepared.browser.env,
      BROWSER: prepared.browser.browser,
      GEMINI_API_KEY: "instance-key",
      GEMINI_HOME: prepared.geminiHome,
      HOME: home,
      PATH: "/usr/bin",
      PYTHONUNBUFFERED: "1",
      TMPDIR: prepared.tempDirectory,
    });
  });

  it("never uses a user-chosen GEMINI_HOME or homePath as the profile", async () => {
    const dir = await tempDir();
    const userGemini = path.join(dir, ".gemini");
    await mkdir(path.join(userGemini, "antigravity-acp"), { recursive: true });
    const userSettings = path.join(
      userGemini,
      "antigravity-acp",
      "settings.json",
    );
    await writeFile(userSettings, '{"theme":"dark"}\n');
    const target = instance({
      config: { homePath: userGemini } as never,
      envOverrides: { GEMINI_HOME: userGemini },
      stateDir: path.join(dir, "state"),
    });
    expect(profile.getAntigravityProfileDirectory(target)).toBe(
      path.join(dir, "state", "gemini-home"),
    );
    await profile.prepareAntigravityProfile({
      auth: profile.readAntigravityAuthConfig(target),
      instance: target,
      userHome: dir,
    });
    expect(await readFile(userSettings, "utf8")).toBe('{"theme":"dark"}\n');
  });

  it("runs the Windows browser helper as Node through Sentinel's runtime", async () => {
    const dir = await tempDir();
    const target = instance({ stateDir: path.join(dir, "state") });
    const auth = profile.readAntigravityAuthConfig(target);
    const prepared = await profile.prepareAntigravityProfile({
      auth,
      instance: target,
      nodeExecutable: "C:\\Sentinel\\Sentinel.exe",
      platform: "win32",
    });
    const env = profile.buildAntigravityEnv({
      auth,
      env: { ELECTRON_RUN_AS_NODE: "0", TEMP: "C:\\Temp", Path: "C:\\bin" },
      harnessPath: "C:\\agy\\localharness_external.exe",
      platform: "win32",
      profile: prepared,
    });
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(env.BROWSER).toStartWith("'C:/Sentinel/Sentinel.exe' '-e' ");
    expect(env.TEMP).toBe(prepared.tempDirectory);
    expect(env.TMP).toBe(prepared.tempDirectory);
  });
});

describe("auth state", () => {
  it("records the method and status next to the profile", async () => {
    const dir = await tempDir();
    expect(await profile.readAntigravityAuthState(dir)).toBeNull();
    await profile.writeAntigravityAuthState(dir, {
      method: "oauth-business",
      status: "signed-in",
    });
    expect(await profile.readAntigravityAuthState(dir)).toEqual(
      expect.objectContaining({
        method: "oauth-business",
        status: "signed-in",
      }),
    );
    expect(await profile.hasAntigravityToken(dir)).toBe(false);
  });
});
