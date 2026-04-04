import { afterEach, describe, expect, it, mock } from "bun:test";

import type { SentinelDesktopApi } from "./contracts";
import {
  ensureMicrophoneAccessForVoiceInput,
  preflightMicrophonePermissionOnStartup,
  resetDesktopPermissionWarmupForTests,
  resolveMicrophonePermissionErrorMessage,
  writeTextToClipboard,
} from "./permissions";

function createDesktopApi(
  overrides: Partial<SentinelDesktopApi> = {},
): SentinelDesktopApi {
  return {
    app: {
      getVersion: async () => "1.0.0",
      listSystemFonts: async () => [],
      platform: "darwin",
    },
    clipboard: {
      writeText: async () => undefined,
    },
    openExternal: async () => undefined,
    permissions: {
      getStatus: async () => "granted",
      request: async () => "granted",
    },
    pickDirectory: async () => null,
    pickFiles: async () => [],
    services: {
      start: async () => ({ appServer: true }),
      status: async () => ({ appServer: true }),
      stop: async () => ({ appServer: false }),
    },
    terminal: {
      create: async () => ({ pid: 1, sessionId: "session-1" }),
      kill: async () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
      resize: () => undefined,
      write: () => undefined,
    },
    updates: {
      check: async () => ({
        availableVersion: null,
        bytesTotal: null,
        bytesTransferred: null,
        checkedAt: null,
        currentVersion: "1.0.0",
        downloadPercent: null,
        errorMessage: null,
        isSupported: true,
        releaseDate: null,
        releaseName: null,
        releaseNotes: null,
        releasePageUrl: null,
        status: "idle",
        supportReason: null,
      }),
      getState: async () => ({
        availableVersion: null,
        bytesTotal: null,
        bytesTransferred: null,
        checkedAt: null,
        currentVersion: "1.0.0",
        downloadPercent: null,
        errorMessage: null,
        isSupported: true,
        releaseDate: null,
        releaseName: null,
        releaseNotes: null,
        releasePageUrl: null,
        status: "idle",
        supportReason: null,
      }),
      install: async () => undefined,
      onStateChange: () => () => undefined,
    },
    window: {
      close: async () => undefined,
      minimize: async () => undefined,
      syncTheme: async () => undefined,
      toggleMaximize: async () => false,
    },
    workspace: {
      listOpenTargets: async () => [],
      openFileInTarget: async () => undefined,
      openInTarget: async () => undefined,
      openInTerminal: async () => undefined,
      revealInFileManager: async () => undefined,
    },
    ...overrides,
  };
}

function setWindow(value?: Window) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
    writable: true,
  });
}

function setNavigator(value?: Navigator) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value,
    writable: true,
  });
}

afterEach(() => {
  resetDesktopPermissionWarmupForTests();
  setWindow(undefined);
  setNavigator(undefined);
});

describe("desktop clipboard helpers", () => {
  it("prefers the desktop clipboard API when available", async () => {
    const desktopWriteText = mock(async () => undefined);
    const browserWriteText = mock(async () => undefined);

    setNavigator({
      clipboard: { writeText: browserWriteText },
    } as never);
    setWindow({
      sentinelDesktop: createDesktopApi({
        clipboard: {
          writeText: desktopWriteText,
        },
      }),
    } as never);

    await expect(
      writeTextToClipboard("ship it", { toastOnError: false }),
    ).resolves.toBe(true);

    expect(desktopWriteText).toHaveBeenCalledWith("ship it");
    expect(browserWriteText).not.toHaveBeenCalled();
  });

  it("falls back to navigator.clipboard outside desktop runtime", async () => {
    const browserWriteText = mock(async () => undefined);

    setNavigator({
      clipboard: { writeText: browserWriteText },
    } as never);

    await expect(
      writeTextToClipboard("browser copy", { toastOnError: false }),
    ).resolves.toBe(true);

    expect(browserWriteText).toHaveBeenCalledWith("browser copy");
  });

  it("returns false when no clipboard writer is available", async () => {
    await expect(
      writeTextToClipboard("no clipboard", { toastOnError: false }),
    ).resolves.toBe(false);
  });
});

describe("desktop microphone helpers", () => {
  it("requests permission in desktop runtime and blocks denied access", async () => {
    const getStatus = mock(async () => "prompt" as const);
    const request = mock(async () => "denied" as const);

    setWindow({
      sentinelDesktop: createDesktopApi({
        permissions: {
          getStatus,
          request,
        },
      }),
    } as never);

    await expect(ensureMicrophoneAccessForVoiceInput()).resolves.toEqual({
      allowed: false,
      message:
        "Microphone access was denied. Allow microphone access for Sentinel in System Settings and try again.",
      state: "denied",
    });
  });

  it("allows browser voice input to continue when permission state is still prompt", async () => {
    setNavigator({
      mediaDevices: {
        getUserMedia: async () => ({}),
      },
      permissions: {
        query: async () => ({ state: "prompt" }),
      },
    } as never);

    await expect(ensureMicrophoneAccessForVoiceInput()).resolves.toEqual({
      allowed: true,
      state: "prompt",
    });
  });

  it("only preflights microphone access once during startup", async () => {
    const getStatus = mock(async () => "prompt" as const);
    const request = mock(async () => "granted" as const);

    const desktopApi = createDesktopApi({
      permissions: {
        getStatus,
        request,
      },
    });

    setWindow({
      sentinelDesktop: desktopApi,
    } as never);

    await expect(preflightMicrophonePermissionOnStartup()).resolves.toBe(
      "granted",
    );
    await expect(preflightMicrophonePermissionOnStartup()).resolves.toBeNull();

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("derives the expected user-facing microphone denial message", () => {
    expect(resolveMicrophonePermissionErrorMessage("denied", "darwin")).toBe(
      "Microphone access was denied. Allow microphone access for Sentinel in System Settings and try again.",
    );
    expect(resolveMicrophonePermissionErrorMessage("unsupported", null)).toBe(
      "Microphone input is unavailable in this environment.",
    );
  });
});
