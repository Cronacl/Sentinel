import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";

import {
  buildReleasePageUrl,
  createDesktopUpdaterController,
  createInitialUpdateState,
  PRIVATE_GITHUB_RELEASES_UNSUPPORTED_REASON,
  serializeReleaseNotes,
} from "./updater.mjs";

class MockUpdater extends EventEmitter {
  active = true;
  allowDowngrade = true;
  allowPrerelease = true;
  autoDownload = false;
  autoInstallOnAppQuit = true;
  checkCalls = 0;
  checkResult = Promise.resolve(null);
  logger = null;
  quitAndInstallCalls = 0;

  isUpdaterActive() {
    return this.active;
  }

  checkForUpdates() {
    this.checkCalls += 1;
    return this.checkResult;
  }

  quitAndInstall() {
    this.quitAndInstallCalls += 1;
  }
}

describe("desktop updater controller", () => {
  it("configures the updater for stable-only background downloads", () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      isPackaged: () => true,
      platform: "darwin",
      updater,
    });

    controller.initialize();

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
  });

  it("reports unsupported state for unpackaged desktop builds", async () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      isPackaged: () => false,
      platform: "darwin",
      updater,
    });

    controller.initialize();
    const state = await controller.checkForUpdates();

    expect(state.isSupported).toBe(false);
    expect(state.supportReason).toContain("packaged desktop builds");
    expect(updater.checkCalls).toBe(0);
  });

  it("reports unsupported state when background updates are explicitly disabled", async () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      backgroundUpdatesEnabled: false,
      backgroundUpdatesSupportReason:
        PRIVATE_GITHUB_RELEASES_UNSUPPORTED_REASON,
      isPackaged: () => true,
      platform: "darwin",
      updater,
    });

    controller.initialize();
    const state = await controller.checkForUpdates();

    expect(state.isSupported).toBe(false);
    expect(state.supportReason).toBe(
      PRIVATE_GITHUB_RELEASES_UNSUPPORTED_REASON,
    );
    expect(updater.checkCalls).toBe(0);
  });

  it("maps updater lifecycle events into renderer state snapshots", () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      isPackaged: () => true,
      now: () => "2026-03-29T12:00:00.000Z",
      platform: "darwin",
      updater,
    });

    controller.initialize();

    updater.emit("update-available", {
      releaseDate: "2026-03-29T11:00:00.000Z",
      releaseName: "Sentinel 1.2.0",
      releaseNotes: [{ note: "Faster sync", version: "1.2.0" }],
      version: "1.2.0",
    });

    expect(controller.getState()).toMatchObject({
      availableVersion: "1.2.0",
      releaseName: "Sentinel 1.2.0",
      releasePageUrl:
        "https://github.com/chaqchase/Sentinel/releases/tag/v1.2.0",
      status: "available",
    });

    updater.emit("download-progress", {
      percent: 42.5,
      total: 2048,
      transferred: 870,
    });

    expect(controller.getState()).toMatchObject({
      bytesTotal: 2048,
      bytesTransferred: 870,
      downloadPercent: 42.5,
      status: "downloading",
    });

    updater.emit("update-downloaded", {
      releaseDate: "2026-03-29T11:00:00.000Z",
      releaseName: "Sentinel 1.2.0",
      releaseNotes: "Faster sync",
      version: "1.2.0",
    });

    expect(controller.getState()).toMatchObject({
      availableVersion: "1.2.0",
      downloadPercent: 100,
      releaseNotes: "Faster sync",
      status: "downloaded",
    });
  });

  it("stores updater errors and supports subscription cleanup", () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      isPackaged: () => true,
      now: () => "2026-03-29T12:00:00.000Z",
      platform: "win32",
      updater,
    });

    const seenStatuses = [];
    const unsubscribe = controller.subscribe((state) => {
      seenStatuses.push(state.status);
    });

    controller.initialize();
    unsubscribe();
    updater.emit("error", new Error("Update feed unavailable"));

    expect(seenStatuses).toEqual(["idle"]);
    expect(controller.getState()).toMatchObject({
      errorMessage: "Update feed unavailable",
      status: "error",
    });
  });

  it("installs only when an update is ready", () => {
    const updater = new MockUpdater();
    const controller = createDesktopUpdaterController({
      appVersion: () => "1.0.0",
      isPackaged: () => true,
      platform: "darwin",
      updater,
    });

    controller.initialize();

    expect(() => controller.installUpdate()).toThrow(
      "A downloaded update is not ready to install.",
    );

    updater.emit("update-downloaded", {
      releaseDate: "2026-03-29T11:00:00.000Z",
      releaseName: "Sentinel 1.1.0",
      releaseNotes: null,
      version: "1.1.0",
    });

    controller.installUpdate();
    expect(updater.quitAndInstallCalls).toBe(1);
  });
});

describe("desktop updater helpers", () => {
  it("creates a stable initial state snapshot", () => {
    expect(createInitialUpdateState("1.0.0")).toMatchObject({
      currentVersion: "1.0.0",
      isSupported: true,
      status: "idle",
    });
  });

  it("normalizes release notes and release URLs", () => {
    expect(
      serializeReleaseNotes([
        { note: "Fix bugs", version: "1.1.0" },
        { note: "Speed up startup", version: "1.0.9" },
      ]),
    ).toBe("## 1.1.0\nFix bugs\n\n## 1.0.9\nSpeed up startup");
    expect(buildReleasePageUrl("1.1.0")).toBe(
      "https://github.com/chaqchase/Sentinel/releases/tag/v1.1.0",
    );
  });
});
