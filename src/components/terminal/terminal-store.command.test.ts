// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";

// Command terminals (engine sign-in) through a fake desktop bridge.

let dataListener = null;
let exitListener = null;
const desktop = {
  app: { platform: "darwin" },
  terminal: {
    createCommand: mock(async () => {
      // The command printed and exited before the call resolved.
      dataListener("session-1", "Opening browser…");
      return { pid: 7, sessionId: "session-1" };
    }),
    kill: mock(async () => {}),
    onData: (callback) => {
      dataListener = callback;
      return () => {};
    },
    onExit: (callback) => {
      exitListener = callback;
      return () => {};
    },
  },
};
globalThis.window = {
  innerHeight: 900,
  localStorage: { getItem: () => null, setItem: () => {} },
  sentinelDesktop: desktop,
};

const {
  createCommandTerminalSession,
  disposeCommandTerminalSession,
  subscribeTerminalExit,
  subscribeTerminalOutput,
} = await import("./terminal-store");

const INPUT = {
  args: ["auth", "login"],
  command: "/opt/bin/claude",
  cwd: "/Users/me",
  env: {},
  ticket: "a".repeat(64),
};

describe("command terminals", () => {
  it("keeps output and exits that arrive early, then forgets them", async () => {
    const session = await createCommandTerminalSession(INPUT);
    expect(desktop.terminal.createCommand).toHaveBeenCalledWith(INPUT);
    expect(
      subscribeTerminalOutput(session.sessionId, () => {}).initialOutput,
    ).toBe("Opening browser…");

    const exits = [];
    subscribeTerminalExit(session.sessionId, (exit) => exits.push(exit));
    exitListener("session-1", 0, null);
    expect(exits).toEqual([{ exitCode: 0, signal: null }]);

    // A late subscriber still hears about it.
    const late = await new Promise((resolve) =>
      subscribeTerminalExit(session.sessionId, resolve),
    );
    expect(late).toEqual({ exitCode: 0, signal: null });

    // Exited: nothing to kill.
    await disposeCommandTerminalSession(session.sessionId);
    expect(desktop.terminal.kill).not.toHaveBeenCalled();
    expect(
      subscribeTerminalOutput(session.sessionId, () => {}).initialOutput,
    ).toBe("");
  });

  it("kills a command that is still running", async () => {
    desktop.terminal.createCommand.mockImplementationOnce(async () => ({
      pid: 8,
      sessionId: "session-2",
    }));
    const session = await createCommandTerminalSession(INPUT);

    await disposeCommandTerminalSession(session.sessionId);
    expect(desktop.terminal.kill).toHaveBeenCalledWith("session-2");
  });

  it("refuses when the desktop shell cannot run commands", async () => {
    const createCommand = desktop.terminal.createCommand;
    delete desktop.terminal.createCommand;
    try {
      await expect(createCommandTerminalSession(INPUT)).rejects.toThrow(
        "cannot run terminal commands",
      );
    } finally {
      desktop.terminal.createCommand = createCommand;
    }
  });
});
