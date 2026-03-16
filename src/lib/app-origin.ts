export function getDefaultAppOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (process.env.SENTINEL_APP_URL?.trim()) {
    return process.env.SENTINEL_APP_URL.trim();
  }

  return `http://localhost:${process.env.PORT ?? "3232"}`;
}

export function buildIntegrationOAuthRedirectUri(
  appOrigin = getDefaultAppOrigin(),
) {
  return `${appOrigin}/api/integrations/oauth/callback`;
}
