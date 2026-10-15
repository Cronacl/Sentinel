import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// Settings → Engines → Usage limits, rendered without a browser (no
// clicks): which rows show, the Keychain offer (never the read itself) and
// how old or carried-over numbers are marked. The tRPC client is replaced.

const refreshMutate = mock(async () => null);
const keychainMutate = mock(async () => null);
const mutation = (mutateAsync: () => Promise<unknown>) => ({
  isPending: false,
  mutateAsync,
});
mock.module("@/trpc/react", () => ({
  api: {
    engines: {
      usage: {
        readCursorKeychain: { useMutation: () => mutation(keychainMutate) },
        refresh: { useMutation: () => mutation(refreshMutate) },
      },
    },
    useUtils: () => ({ engines: {} }),
  },
}));
mock.module("sileo", () => ({ sileo: { error: () => {} } }));

const { makeEngineUsageLimits, makeUnavailableEngineUsageLimits } =
  await import("@/lib/ai/chat/engines/contract");
const { makeFakeSnapshot } =
  await import("@/lib/ai/chat/engines/contract/testing");
const { EngineUsageLimitsSection } = await import("./engine-usage-limits");

const window = {
  id: "primary",
  kind: "session" as const,
  label: "Session",
  usedPercent: 40,
};

function render(snapshots: Parameters<typeof EngineUsageLimitsSection>[0]) {
  return renderToStaticMarkup(<EngineUsageLimitsSection {...snapshots} />);
}

describe("EngineUsageLimitsSection", () => {
  it("offers the Keychain read behind a confirmation, without reading", () => {
    const markup = render({
      snapshots: [
        makeFakeSnapshot({
          driver: "cursor",
          instanceId: "cursor",
          label: "Cursor",
          usageLimits: makeUnavailableEngineUsageLimits({
            action: "read-keychain",
            checkedAt: new Date().toISOString(),
            message: "Cursor keeps its login in the Keychain.",
            reason: "unsupported",
          }),
        }),
      ],
    });

    expect(markup).toContain("Read login from Keychain");
    expect(markup).toContain("Cursor keeps its login in the Keychain.");
    // Showing the offer reads nothing: only the dialog's button does.
    expect(keychainMutate).not.toHaveBeenCalled();
    expect(refreshMutate).not.toHaveBeenCalled();
  });

  it("marks windows carried over from an earlier read", () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const markup = render({
      snapshots: [
        makeFakeSnapshot({
          driver: "codex",
          instanceId: "codex",
          label: "Codex",
          usable: false,
          usageLimits: makeEngineUsageLimits({
            checkedAt: old,
            windows: [window],
          }),
        }),
      ],
    });

    // The day is shown: the read is not from today.
    expect(markup).not.toContain("Read at");
    expect(markup).toContain("Last known usage");
    expect(markup).toContain("opacity-60");
  });

  it("shows fresh windows plainly and hides accounts that never report", () => {
    const markup = render({
      snapshots: [
        makeFakeSnapshot({
          driver: "codex",
          instanceId: "codex",
          label: "Codex",
          usageLimits: makeEngineUsageLimits({
            checkedAt: new Date().toISOString(),
            windows: [window],
          }),
        }),
        makeFakeSnapshot({
          driver: "claude",
          instanceId: "claude",
          label: "Claude API key",
          usageLimits: makeUnavailableEngineUsageLimits({
            checkedAt: new Date().toISOString(),
            reason: "unsupported",
          }),
        }),
      ],
    });

    expect(markup).toContain("Read at");
    expect(markup).toContain("40% used");
    expect(markup).not.toContain("Last known usage");
    expect(markup).not.toContain("Claude API key");
  });
});
