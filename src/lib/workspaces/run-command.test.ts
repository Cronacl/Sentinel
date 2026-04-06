import { afterEach, describe, expect, it } from "bun:test";

import {
  clearWorkspaceRunCommand,
  getWorkspaceRunCommand,
  setWorkspaceRunCommand,
} from "./run-command";

function createLocalStorage() {
  const storage = new Map<string, string>();

  return {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  };
}

function setWindow(value?: Window) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
    writable: true,
  });
}

afterEach(() => {
  setWindow(undefined);
});

describe("workspace run command storage", () => {
  it("returns null when the command is unavailable", () => {
    expect(getWorkspaceRunCommand("workspace-1")).toBeNull();
  });

  it("stores and reads a trimmed command per workspace", () => {
    setWindow({
      localStorage: createLocalStorage(),
    } as never);

    setWorkspaceRunCommand("workspace-1", "  npm run dev  ");

    expect(getWorkspaceRunCommand("workspace-1")).toBe("npm run dev");
    expect(getWorkspaceRunCommand("workspace-2")).toBeNull();
  });

  it("clears stored commands", () => {
    setWindow({
      localStorage: createLocalStorage(),
    } as never);

    setWorkspaceRunCommand("workspace-1", "pnpm dev");
    clearWorkspaceRunCommand("workspace-1");

    expect(getWorkspaceRunCommand("workspace-1")).toBeNull();
  });
});
