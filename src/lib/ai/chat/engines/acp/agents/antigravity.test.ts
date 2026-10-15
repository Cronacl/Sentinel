import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

// Antigravity's static status (it never spawns the ~1 GB server): the
// sign-in comes from Sentinel's state next to the profile, then the
// server's token file; a method missing its key or project is signed out.
mock.module("server-only", () => ({}));

const { antigravityAcpAgent } = await import("./antigravity");
const profile = await import("../antigravity/profile");
const { makeFakeInstance } =
  await import("@/lib/ai/chat/engines/contract/testing");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function instance(
  overrides: Parameters<typeof makeFakeInstance>[0] = {},
) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-st-"));
  roots.push(stateDir);
  return makeFakeInstance({
    driver: "antigravity",
    id: "antigravity",
    stateDir,
    ...overrides,
  });
}

const BINARY = {
  env: {},
  path: "/nonexistent/agy",
  source: "managed-install",
  version: "1.3.0",
} as const;

function readStatic(target: Awaited<ReturnType<typeof instance>>) {
  return antigravityAcpAgent.probe.readStatic!(target, BINARY);
}

describe("antigravity static probe", () => {
  it("is signed out with no state and no token, signed in with the token file", async () => {
    const target = await instance();
    expect((await readStatic(target)).auth.status).toBe("unauthenticated");

    const home = profile.getAntigravityProfileDirectory(target);
    await mkdir(path.join(home, "antigravity-acp"), { recursive: true });
    await writeFile(path.join(home, "antigravity-acp", "acp_token.json"), "{}");
    expect((await readStatic(target)).auth).toEqual({
      method: "Google account",
      status: "authenticated",
    });
  });

  it("follows Sentinel's recorded state over the token file", async () => {
    const target = await instance();
    const home = profile.getAntigravityProfileDirectory(target);
    await profile.writeAntigravityAuthState(home, {
      method: "oauth-personal",
      status: "signed-in",
    });
    expect((await readStatic(target)).auth.status).toBe("authenticated");

    await mkdir(path.join(home, "antigravity-acp"), { recursive: true });
    await writeFile(path.join(home, "antigravity-acp", "acp_token.json"), "{}");
    await profile.writeAntigravityAuthState(home, {
      method: "oauth-personal",
      status: "signed-out",
    });
    const signedOut = await readStatic(target);
    expect(signedOut.auth.status).toBe("unauthenticated");
    expect(signedOut.message).toContain("Sign in with Google");
  });

  it("is signed out when the method lacks its key or Cloud project", async () => {
    const noKey = await readStatic(
      await instance({ config: { authMethodId: "gemini-api-key" } as never }),
    );
    expect(noKey.auth.status).toBe("unauthenticated");
    expect(noKey.message).toContain("Gemini API key");

    const withKey = await readStatic(
      await instance({
        config: { authMethodId: "gemini-api-key" } as never,
        envOverrides: { GEMINI_API_KEY: "k" },
      }),
    );
    expect(withKey.auth.status).toBe("authenticated");

    const enterprise = await readStatic(
      await instance({
        config: { authMethodId: "oauth-business", gcpProject: "p" } as never,
      }),
    );
    expect(enterprise.auth.status).toBe("unauthenticated");
    expect(enterprise.message).toContain("Google Cloud project and location");
  });

  it("refuses chat launches while Settings signs in or out", async () => {
    const target = await instance();
    const end = profile.beginAntigravityAuthOperation(target.id);
    try {
      await expect(
        antigravityAcpAgent.prepareLaunch!({
          binary: BINARY,
          cwd: target.stateDir,
          instance: target,
          purpose: "session",
        }),
      ).rejects.toThrow("signing in or out in Settings");
    } finally {
      end();
    }
    expect(profile.isAntigravityAuthOperationActive(target.id)).toBe(false);
  });
});
