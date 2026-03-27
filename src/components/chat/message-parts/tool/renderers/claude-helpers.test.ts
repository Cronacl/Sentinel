import { describe, expect, it } from "bun:test";

import { extractTextFromContent, getApprovalReason } from "./claude-helpers";

describe("extractTextFromContent", () => {
  it("returns raw string output unchanged", () => {
    expect(
      extractTextFromContent(
        "total 0\ndrwxr-xr-x@  4 mohamedachaq  staff   128 Mar 21 21:42 .",
      ),
    ).toBe("total 0\ndrwxr-xr-x@  4 mohamedachaq  staff   128 Mar 21 21:42 .");
  });

  it("extracts stdout from structured objects", () => {
    expect(
      extractTextFromContent({
        stderr: "",
        stdout: "total 0",
      }),
    ).toBe("total 0");
  });
});

describe("getApprovalReason", () => {
  it("extracts reason from approval object", () => {
    expect(getApprovalReason({ id: "abc", reason: "File write" })).toBe(
      "File write",
    );
  });

  it("returns undefined when no reason", () => {
    expect(getApprovalReason({ id: "abc" })).toBeUndefined();
  });

  it("returns undefined for null/undefined", () => {
    expect(getApprovalReason(null)).toBeUndefined();
    expect(getApprovalReason(undefined)).toBeUndefined();
  });
});
