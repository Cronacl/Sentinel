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

  it("keeps passive desktop computer tools open and gates sensitive actions", () => {
    const policies = getDefaultToolApprovalPolicies();

    expect(policies.computer_status).toBe(false);
    expect(policies.computer_apps).toBe(false);
    expect(policies.computer_ax_tree).toBe(false);
    expect(policies.computer_ax_find).toBe(false);

    expect(policies.computer_screenshot).toBe(true);
    expect(policies.computer_action).toBe(true);
    expect(policies.computer_app).toBe(true);
    expect(policies.computer_clipboard).toBe(true);
    expect(policies.computer_ax_action).toBe(true);
  });
});
