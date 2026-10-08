import { describe, expect, it } from "bun:test";

import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

import {
  getAccountDisplay,
  getAuthLabel,
  getComposerUnavailableMessage,
  getInstallLabel,
  getInstallSourceLabel,
  getSnapshotBadge,
  getSnapshotNotice,
} from "./snapshot-status";

const unauthenticated = {
  canLogin: true,
  canLogout: false,
  email: null,
  label: null,
  method: null,
  plan: null,
  status: "unauthenticated" as const,
};

describe("getSnapshotBadge", () => {
  it("follows the snapshot rather than a bare availability flag", () => {
    expect(getSnapshotBadge(makeFakeSnapshot())).toEqual({
      color: "success",
      label: "Ready",
    });
    expect(
      getSnapshotBadge(makeFakeSnapshot({ status: "checking", usable: false })),
    ).toEqual({ color: "default", label: "Checking" });
    expect(
      getSnapshotBadge(
        makeFakeSnapshot({ enabled: false, status: "disabled" }),
      ),
    ).toEqual({ color: "default", label: "Disabled" });
    expect(
      getSnapshotBadge(makeFakeSnapshot({ availability: "unavailable" })),
    ).toEqual({ color: "danger", label: "Unavailable" });
    expect(
      getSnapshotBadge(makeFakeSnapshot({ auth: unauthenticated })),
    ).toEqual({ color: "warning", label: "Setup needed" });
  });
});

describe("install and auth labels", () => {
  it("describes the detected runtime", () => {
    expect(getInstallLabel(makeFakeSnapshot())).toBe("1.0.0");
    expect(
      getInstallLabel(
        makeFakeSnapshot({
          install: {
            installed: false,
            path: "/old/claude",
            source: null,
            version: null,
          },
        }),
      ),
    ).toBe("Path retained");
    expect(
      getInstallLabel(
        makeFakeSnapshot({
          install: {
            installed: false,
            path: null,
            source: null,
            version: null,
          },
          status: "checking",
        }),
      ),
    ).toBe("Checking…");
    expect(
      getInstallSourceLabel(
        makeFakeSnapshot({
          install: {
            installed: true,
            path: "/app/copilot",
            source: "sdk-bundled",
            version: "1.0.16",
          },
        }),
      ),
    ).toBe("Bundled with Sentinel");
  });

  it("describes authentication", () => {
    expect(getAuthLabel(makeFakeSnapshot())).toBe("Ready");
    expect(getAuthLabel(makeFakeSnapshot({ auth: unauthenticated }))).toBe(
      "Login needed",
    );
    expect(
      getAuthLabel(
        makeFakeSnapshot({
          auth: { ...unauthenticated, status: "unknown" },
          usable: false,
        }),
      ),
    ).toBe("Unavailable");
  });
});

describe("getAccountDisplay", () => {
  it("masks emails and logins only", () => {
    expect(
      getAccountDisplay({
        email: "me@example.com",
        label: null,
        method: "chatgpt",
        plan: "pro",
        status: "authenticated",
      }),
    ).toEqual({ isSensitive: true, value: "me@example.com" });
    expect(
      getAccountDisplay({
        email: null,
        label: "octocat",
        method: "user",
        plan: null,
        status: "authenticated",
      }),
    ).toEqual({ isSensitive: true, value: "octocat" });
    expect(
      getAccountDisplay({
        email: null,
        label: null,
        method: "chatgpt",
        plan: "plus",
        status: "authenticated",
      }),
    ).toEqual({ isSensitive: false, value: "ChatGPT Plus" });
    expect(
      getAccountDisplay({
        email: null,
        label: null,
        method: "apiKey",
        plan: null,
        status: "authenticated",
      }),
    ).toEqual({ isSensitive: false, value: "API key" });
    expect(getAccountDisplay(unauthenticated)).toEqual({
      isSensitive: false,
      value: "Not authenticated",
    });
  });
});

describe("getSnapshotNotice", () => {
  const formatter = () => "Oct 7, 12:00";

  it("explains a stale status, which the old fallback stub never did", () => {
    expect(
      getSnapshotNotice(
        makeFakeSnapshot({
          message: "Claude did not answer within 15 s.",
          stale: true,
        }),
        formatter,
      ),
    ).toBe(
      "Claude did not answer within 15 s. Showing the last known status (checked Oct 7, 12:00).",
    );
  });

  it("shows version advisories and unusable reasons, nothing when ready", () => {
    expect(
      getSnapshotNotice(
        makeFakeSnapshot({
          compatibilityAdvisory: {
            message: "OpenCode 1.0.1 is too old for Sentinel.",
            recommendedRange: ">=1.14.19",
            recommendedVersion: "1.14.19",
            status: "broken",
          },
          usable: false,
        }),
      ),
    ).toBe("OpenCode 1.0.1 is too old for Sentinel.");
    expect(
      getSnapshotNotice(
        makeFakeSnapshot({
          message: "Cursor Agent was not found in PATH.",
          status: "error",
          usable: false,
        }),
      ),
    ).toBe("Cursor Agent was not found in PATH.");
    expect(getSnapshotNotice(makeFakeSnapshot())).toBeNull();
  });
});

describe("getComposerUnavailableMessage", () => {
  it("says why the composer cannot use the instance", () => {
    expect(
      getComposerUnavailableMessage(
        makeFakeSnapshot({ auth: unauthenticated, driver: "claude" }),
      ),
    ).toBe(
      "Claude needs authentication before it can be used here. Sign in from Settings → Engines.",
    );
    expect(
      getComposerUnavailableMessage(
        makeFakeSnapshot({
          driver: "cursor",
          install: {
            installed: false,
            path: null,
            source: null,
            version: null,
          },
          status: "error",
        }),
      ),
    ).toBe("Cursor runtime was not detected in this Sentinel session.");
    expect(
      getComposerUnavailableMessage(
        makeFakeSnapshot({ driver: "codex", stale: true, status: "warning" }),
      ),
    ).toBe("Codex is temporarily unavailable in this Sentinel runtime.");
  });
});
