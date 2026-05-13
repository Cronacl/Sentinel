import { beforeEach, describe, expect, it } from "bun:test";

const {
  closeBrowserTab,
  createBrowserTab,
  getBrowserSidebarSnapshot,
  resetBrowserSidebarStoreForTests,
  setActiveBrowserTab,
} = await import("./browser-sidebar-store");

describe("browser sidebar scoped store", () => {
  beforeEach(() => {
    resetBrowserSidebarStoreForTests();
  });

  it("keeps tab state isolated per thread scope", () => {
    const threadATab = createBrowserTab("https://a.example", "thread-a");
    const threadBTab = createBrowserTab("https://b.example", "thread-b");

    expect(getBrowserSidebarSnapshot("thread-a").tabs).toEqual([
      expect.objectContaining({ id: threadATab, url: "https://a.example" }),
    ]);
    expect(getBrowserSidebarSnapshot("thread-b").tabs).toEqual([
      expect.objectContaining({ id: threadBTab, url: "https://b.example" }),
    ]);
  });

  it("does not leak active tab changes across thread scopes", () => {
    const threadAFirst = createBrowserTab("https://a.example", "thread-a");
    const threadASecond = createBrowserTab("https://a2.example", "thread-a");
    const threadBFirst = createBrowserTab("https://b.example", "thread-b");

    setActiveBrowserTab(threadAFirst!, "thread-a");

    expect(getBrowserSidebarSnapshot("thread-a").activeTabId).toBe(
      threadAFirst,
    );
    expect(getBrowserSidebarSnapshot("thread-b").activeTabId).toBe(
      threadBFirst,
    );
    expect(getBrowserSidebarSnapshot("thread-a").activeTabId).not.toBe(
      threadASecond,
    );
  });

  it("closes tabs only in the requested thread scope", () => {
    const threadATab = createBrowserTab("https://a.example", "thread-a");
    const threadBTab = createBrowserTab("https://b.example", "thread-b");

    closeBrowserTab(threadATab!, "thread-a");

    expect(getBrowserSidebarSnapshot("thread-a").tabs).toEqual([]);
    expect(getBrowserSidebarSnapshot("thread-b").tabs).toEqual([
      expect.objectContaining({ id: threadBTab, url: "https://b.example" }),
    ]);
  });
});
