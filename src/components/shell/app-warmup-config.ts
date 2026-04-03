export const STATIC_APP_WARMUP_ROUTES = [
  "/",
  "/automations",
  "/skills",
  "/settings",
  "/settings/appearance",
  "/settings/data",
  "/settings/integrations",
  "/settings/images",
  "/settings/mcp",
  "/settings/mcp/new",
  "/settings/memory",
  "/settings/models",
  "/settings/personalization",
  "/settings/providers",
  "/settings/search",
  "/settings/security",
  "/settings/approvals",
] as const;

export function isStaticAppWarmupRoute(route: string) {
  return (
    STATIC_APP_WARMUP_ROUTES.includes(
      route as (typeof STATIC_APP_WARMUP_ROUTES)[number],
    ) && !route.includes("[")
  );
}
