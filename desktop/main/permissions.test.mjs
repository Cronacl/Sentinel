import { describe, expect, it, mock } from "bun:test";

import {
  configureDesktopPermissionHandlers,
  getDesktopMicrophonePermissionState,
  normalizeMicrophonePermissionState,
  requestDesktopMicrophonePermission,
  shouldAllowTrustedDesktopPermission,
} from "./permissions.mjs";

describe("desktop permission policy", () => {
  it("allows trusted origins for microphone, media, and clipboard write", () => {
    const isTrustedOrigin = (value) => value === "http://localhost:3232";

    expect(
      shouldAllowTrustedDesktopPermission(
        "microphone",
        "http://localhost:3232",
        isTrustedOrigin,
      ),
    ).toBe(true);
    expect(
      shouldAllowTrustedDesktopPermission(
        "media",
        "http://localhost:3232",
        isTrustedOrigin,
      ),
    ).toBe(true);
    expect(
      shouldAllowTrustedDesktopPermission(
        "clipboard-sanitized-write",
        "http://localhost:3232",
        isTrustedOrigin,
      ),
    ).toBe(true);
  });

  it("denies untrusted origins and clipboard reads", () => {
    const isTrustedOrigin = () => false;

    expect(
      shouldAllowTrustedDesktopPermission(
        "microphone",
        "https://example.com",
        isTrustedOrigin,
      ),
    ).toBe(false);
    expect(
      shouldAllowTrustedDesktopPermission(
        "clipboard-read",
        "http://localhost:3232",
        () => true,
      ),
    ).toBe(false);
  });

  it("wires the same policy into session permission check and request handlers", () => {
    const setPermissionCheckHandler = mock(() => undefined);
    const setPermissionRequestHandler = mock(() => undefined);

    configureDesktopPermissionHandlers(
      {
        setPermissionCheckHandler,
        setPermissionRequestHandler,
      },
      {
        isTrustedOrigin: (value) => value === "http://localhost:3232",
      },
    );

    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0];
    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0];

    expect(
      checkHandler?.(
        { getURL: () => "http://localhost:3232" },
        "microphone",
        "http://localhost:3232",
      ),
    ).toBe(true);
    expect(
      checkHandler?.(
        { getURL: () => "https://example.com" },
        "clipboard-read",
        "https://example.com",
      ),
    ).toBe(false);

    const callback = mock(() => undefined);
    requestHandler?.(
      { getURL: () => "http://localhost:3232" },
      "clipboard-sanitized-write",
      callback,
      { requestingUrl: "http://localhost:3232" },
    );
    expect(callback).toHaveBeenLastCalledWith(true);

    requestHandler?.(
      { getURL: () => "https://example.com" },
      "microphone",
      callback,
      { requestingUrl: "https://example.com" },
    );
    expect(callback).toHaveBeenLastCalledWith(false);
  });
});

describe("desktop microphone permission state", () => {
  it("normalizes native status values", () => {
    expect(normalizeMicrophonePermissionState("granted", "darwin")).toBe(
      "granted",
    );
    expect(normalizeMicrophonePermissionState("denied", "darwin")).toBe(
      "denied",
    );
    expect(normalizeMicrophonePermissionState("not-determined", "darwin")).toBe(
      "prompt",
    );
    expect(normalizeMicrophonePermissionState("unknown", "win32")).toBe(
      "prompt",
    );
    expect(normalizeMicrophonePermissionState("granted", "linux")).toBe(
      "unsupported",
    );
  });

  it("reads current status from the desktop platform", () => {
    expect(
      getDesktopMicrophonePermissionState({
        platform: "darwin",
        systemPreferences: {
          getMediaAccessStatus: () => "not-determined",
        },
      }),
    ).toBe("prompt");

    expect(
      getDesktopMicrophonePermissionState({
        platform: "linux",
        systemPreferences: {
          getMediaAccessStatus: () => "granted",
        },
      }),
    ).toBe("unsupported");
  });

  it("requests microphone access on macOS and returns current state elsewhere", async () => {
    await expect(
      requestDesktopMicrophonePermission({
        platform: "darwin",
        systemPreferences: {
          askForMediaAccess: async () => true,
          getMediaAccessStatus: () => "not-determined",
        },
      }),
    ).resolves.toBe("granted");

    await expect(
      requestDesktopMicrophonePermission({
        platform: "win32",
        systemPreferences: {
          getMediaAccessStatus: () => "not-determined",
        },
      }),
    ).resolves.toBe("prompt");
  });
});
