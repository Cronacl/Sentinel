import { describe, expect, it } from "bun:test";

import {
  isStaticAppWarmupRoute,
  STATIC_APP_WARMUP_ROUTES,
} from "./app-warmup-config";

describe("app warmup config", () => {
  it("includes only the approved static app routes", () => {
    expect(STATIC_APP_WARMUP_ROUTES).toEqual([
      "/",
      "/automations",
      "/skills",
      "/settings",
      "/settings/appearance",
      "/settings/data",
      "/settings/integrations",
      "/settings/mcp",
      "/settings/mcp/new",
      "/settings/memory",
      "/settings/models",
      "/settings/personalization",
      "/settings/providers",
      "/settings/search",
      "/settings/security",
      "/settings/approvals",
    ]);

    for (const route of STATIC_APP_WARMUP_ROUTES) {
      expect(isStaticAppWarmupRoute(route)).toBe(true);
      expect(route.includes("[")).toBe(false);
    }
  });

  it("rejects dynamic and non-approved routes", () => {
    expect(isStaticAppWarmupRoute("/thread/[threadId]")).toBe(false);
    expect(isStaticAppWarmupRoute("/skills/[skillName]")).toBe(false);
    expect(isStaticAppWarmupRoute("/automations/automation-1")).toBe(false);
  });
});
