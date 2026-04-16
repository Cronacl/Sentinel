import { describe, expect, it } from "bun:test";

import { resolveShellRouteState } from "./shell-route";

describe("shell route state", () => {
  it("recognizes the home route", () => {
    expect(resolveShellRouteState("/")).toEqual({
      isHomeRoute: true,
      isThreadRoute: false,
      pathname: "/",
      selectedThreadId: null,
    });
  });

  it("recognizes thread routes and extracts the thread id", () => {
    expect(resolveShellRouteState("/thread/thread-123")).toEqual({
      isHomeRoute: false,
      isThreadRoute: true,
      pathname: "/thread/thread-123",
      selectedThreadId: "thread-123",
    });
  });

  it("treats non-thread routes as external to client thread routing", () => {
    expect(resolveShellRouteState("/settings/models")).toEqual({
      isHomeRoute: false,
      isThreadRoute: false,
      pathname: "/settings/models",
      selectedThreadId: null,
    });
  });
});
