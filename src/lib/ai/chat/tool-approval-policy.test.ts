import { describe, expect, it } from "bun:test";

import { getDefaultToolApprovalPolicies } from "./tool-approval-policy";

describe("tool approval policies", () => {
  it("uses read-only browser tools without approval and gates browser actions", () => {
    const policies = getDefaultToolApprovalPolicies();

    expect(policies.browser_tabs).toBe(false);
    expect(policies.browser_snapshot).toBe(false);
    expect(policies.browser_screenshot).toBe(false);
    expect(policies.browser_console_logs).toBe(false);

    expect(policies.browser_open).toBe(true);
    expect(policies.browser_navigate).toBe(true);
    expect(policies.browser_click).toBe(true);
    expect(policies.browser_fill).toBe(true);
    expect(policies.browser_press).toBe(true);
  });
});
