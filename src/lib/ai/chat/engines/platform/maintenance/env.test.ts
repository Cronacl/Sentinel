import { describe, expect, it } from "bun:test";

import { codexHomeFromStandalonePath } from "./definitions";
import { buildMaintenanceEnv, isKeptMaintenanceVariable } from "./env";

describe("maintenance environment", () => {
  it("drops the instance's home and secrets but keeps PATH and proxies", () => {
    const env = buildMaintenanceEnv(
      {
        env: {
          ANTHROPIC_API_KEY: "sk-instance",
          CLAUDE_CONFIG_DIR: "/Users/me/.claude-work",
          HOME: "/Users/me",
          https_proxy: "http://proxy.test:3128",
          NODE_EXTRA_CA_CERTS: "/etc/corp.pem",
          PATH: "/Users/me/bin:/usr/bin",
        },
        envOverrides: {
          ANTHROPIC_API_KEY: "sk-instance",
          CLAUDE_CONFIG_DIR: "/Users/me/.claude-work",
          https_proxy: "http://proxy.test:3128",
          NODE_EXTRA_CA_CERTS: "/etc/corp.pem",
          PATH: "/Users/me/bin:/usr/bin",
        },
      },
      {
        ANTHROPIC_API_KEY: "sk-server",
        HOME: "/Users/me",
        PATH: "/usr/bin",
      },
    );

    expect(env).toEqual({
      // The server's own value comes back; an instance-only one is unset.
      ANTHROPIC_API_KEY: "sk-server",
      CLAUDE_CONFIG_DIR: undefined,
      HOME: "/Users/me",
      https_proxy: "http://proxy.test:3128",
      NODE_EXTRA_CA_CERTS: "/etc/corp.pem",
      PATH: "/Users/me/bin:/usr/bin",
    });
    expect(isKeptMaintenanceVariable("HTTPS_PROXY")).toBe(true);
    expect(isKeptMaintenanceVariable("CODEX_HOME")).toBe(false);
  });

  it("finds the CODEX_HOME of a standalone Codex install", () => {
    expect(
      codexHomeFromStandalonePath(
        "/Users/me/.codex/packages/standalone/current/bin/codex",
      ),
    ).toBe("/Users/me/.codex");
    expect(
      codexHomeFromStandalonePath(
        "/opt/Codex Home/Packages/Standalone/0.161.0/codex",
      ),
    ).toBe("/opt/Codex Home");
    expect(
      codexHomeFromStandalonePath("/usr/local/lib/node_modules/@openai/codex"),
    ).toBe(null);
  });
});
