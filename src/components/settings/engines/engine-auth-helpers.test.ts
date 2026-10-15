import { describe, expect, it } from "bun:test";

import {
  emptyCredentialValues,
  findMissingCredential,
  getEngineAuthPanelView,
  getTerminalDisplayCommand,
  toDesktopTerminalCommand,
} from "./engine-auth-helpers";

const TERMINAL = {
  args: ["auth", "login"],
  command: "/opt/bin/claude",
  cwd: "/Users/me",
  displayCommand: "CLAUDE_CONFIG_DIR=/cfg /opt/bin/claude auth login",
  env: { CLAUDE_CONFIG_DIR: "/cfg", PATH: "/usr/bin" },
  id: "flow-1:1",
  launch: { expiresAt: "2026-10-08T00:05:00.000Z", ticket: "a".repeat(64) },
  title: "Claude Code sign-in",
  type: "terminal-command" as const,
};

const METHODS = [
  { id: "cli-login", label: "Sign in", type: "terminal-command" as const },
  { id: "api-key", label: "Use an API key", type: "credentials" as const },
];

describe("terminal interactions", () => {
  it("passes the server's command and ticket to the desktop bridge", () => {
    expect(toDesktopTerminalCommand(TERMINAL, { cols: 90, rows: 20 })).toEqual({
      args: ["auth", "login"],
      cols: 90,
      command: "/opt/bin/claude",
      cwd: "/Users/me",
      env: { CLAUDE_CONFIG_DIR: "/cfg", PATH: "/usr/bin" },
      rows: 20,
      ticket: "a".repeat(64),
      title: "Claude Code sign-in",
    });
    expect(toDesktopTerminalCommand({ ...TERMINAL, launch: null })).toBeNull();
  });

  it("shows a command to copy", () => {
    expect(getTerminalDisplayCommand(TERMINAL)).toBe(
      "CLAUDE_CONFIG_DIR=/cfg /opt/bin/claude auth login",
    );
    expect(
      getTerminalDisplayCommand({ ...TERMINAL, displayCommand: undefined }),
    ).toBe("/opt/bin/claude auth login");
  });
});

describe("panel view", () => {
  it("offers sign-in methods and sign-out while idle", () => {
    expect(
      getEngineAuthPanelView({
        auth: { status: "authenticated" },
        canLogout: true,
        installed: true,
        methods: METHODS,
        state: { phase: "idle" } as never,
      }),
    ).toEqual({
      active: false,
      outcome: null,
      showSignOut: true,
      signInMethods: METHODS,
    });
    expect(
      getEngineAuthPanelView({
        auth: { status: "unauthenticated" },
        canLogout: true,
        installed: true,
        methods: METHODS,
        state: null,
      }).showSignOut,
    ).toBe(false);
  });

  it("offers no sign-out without a runtime", () => {
    expect(
      getEngineAuthPanelView({
        auth: { status: "unknown" },
        canLogout: true,
        installed: false,
        methods: [],
        state: null,
      }).showSignOut,
    ).toBe(false);
  });

  it("hides the actions while a flow runs and shows its outcome after", () => {
    expect(
      getEngineAuthPanelView({
        auth: { status: "unknown" },
        canLogout: true,
        installed: true,
        methods: METHODS,
        state: {
          message: "Finish in the terminal.",
          phase: "waiting",
        } as never,
      }),
    ).toEqual({
      active: true,
      outcome: null,
      showSignOut: false,
      signInMethods: [],
    });
    expect(
      getEngineAuthPanelView({
        auth: { status: "unauthenticated" },
        canLogout: false,
        installed: true,
        methods: METHODS,
        state: { message: "Sign-in expired.", phase: "failed" } as never,
      }).outcome,
    ).toEqual({ message: "Sign-in expired.", tone: "danger" });
  });
});

describe("credentials form", () => {
  it("requires every field", () => {
    const fields = [
      { label: "Key", name: "KEY", secret: true },
      { label: "Region", name: "REGION", secret: false },
    ];
    expect(emptyCredentialValues(fields)).toEqual({ KEY: "", REGION: "" });
    expect(findMissingCredential(fields, { KEY: "x", REGION: " " })?.name).toBe(
      "REGION",
    );
    expect(
      findMissingCredential(fields, { KEY: "x", REGION: "eu" }),
    ).toBeNull();
  });
});
