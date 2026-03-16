export function getDefaultAppOrigin() {
  if (process.env.SENTINEL_APP_URL?.trim()) {
    return process.env.SENTINEL_APP_URL.trim();
  }

  return `http://127.0.0.1:${process.env.PORT ?? "3232"}`;
}

export function buildIntegrationOAuthRedirectUri(
  appOrigin = getDefaultAppOrigin(),
) {
  return `${appOrigin}/api/integrations/oauth/callback`;
}
