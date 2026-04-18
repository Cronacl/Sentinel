import { describe, expect, it } from "bun:test";

import { resolveDraftThreadRepoThreadId } from "./new-thread-screen.helpers";

describe("new thread screen helpers", () => {
  it("keeps draft repo actions unbound until the draft thread is initialized", () => {
    expect(
      resolveDraftThreadRepoThreadId({
        draftThreadId: "draft-thread-1",
        draftThreadInitialized: false,
      }),
    ).toBeNull();
  });

  it("binds repo actions to the draft thread after initialization", () => {
    expect(
      resolveDraftThreadRepoThreadId({
        draftThreadId: "draft-thread-1",
        draftThreadInitialized: true,
      }),
    ).toBe("draft-thread-1");
  });

  it("prefers the routed thread id once the real thread route is active", () => {
    expect(
      resolveDraftThreadRepoThreadId({
        draftThreadId: "draft-thread-1",
        draftThreadInitialized: false,
        threadId: "thread-1",
      }),
    ).toBe("thread-1");
  });

  it("binds repo actions during the initial handoff while bootstrap is pending", () => {
    expect(
      resolveDraftThreadRepoThreadId({
        draftThreadId: "draft-thread-1",
        draftThreadInitialized: false,
        handoffPending: true,
      }),
    ).toBe("draft-thread-1");
  });
});
