import {
  auth,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
} from "@ai-sdk/mcp";
import { randomUUID } from "node:crypto";

import { getMcpCatalogEntry } from "@/lib/mcp/catalog";
import { getMcpOAuthState, updateMcpOAuthState } from "@/lib/mcp/oauth-state";
import type { McpHttpRuntimeEntry } from "@/lib/mcp/runtime";

type CreateMcpOAuthProviderArgs = {
  onRedirect?: (authorizationUrl: URL) => void | Promise<void>;
  redirectUrl: string;
  serverId: string;
  userId: string;
};

type BeginMcpServerOAuthArgs = {
  appOrigin: string;
  entry: McpHttpRuntimeEntry;
  userId: string;
};

type CompleteMcpServerOAuthArgs = {
  appOrigin: string;
  authorizationCode: string;
  entry: McpHttpRuntimeEntry;
  state: string;
  userId: string;
};

export function getDefaultAppOrigin() {
  if (process.env.SENTINEL_APP_URL?.trim()) {
    return process.env.SENTINEL_APP_URL.trim();
  }

  return `http://127.0.0.1:${process.env.PORT ?? "3232"}`;
}

export function buildMcpOAuthRedirectUrl(appOrigin: string, serverId: string) {
  const url = new URL("/api/mcp/oauth/callback", appOrigin);
  url.searchParams.set("serverId", serverId);
  return url.toString();
}

export async function hasMcpOAuthState(args: {
  serverId: string;
  userId: string;
}) {
  const state = await getMcpOAuthState(args);
  return Boolean(state?.tokens || state?.clientInformation || state?.state);
}

function getClientMetadata(redirectUrl: string): OAuthClientMetadata {
  return {
    client_name: "Sentinel",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUrl],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export function createMcpOAuthProvider(
  args: CreateMcpOAuthProviderArgs,
): OAuthClientProvider {
  return {
    async clientInformation() {
      return (await getMcpOAuthState(args))?.clientInformation;
    },
    get clientMetadata() {
      return getClientMetadata(args.redirectUrl);
    },
    async codeVerifier() {
      const state = await getMcpOAuthState(args);

      if (!state?.codeVerifier) {
        throw new Error("Missing OAuth PKCE verifier.");
      }

      return state.codeVerifier;
    },
    async invalidateCredentials(scope) {
      await updateMcpOAuthState(args, (current) => {
        if (!current) {
          return null;
        }

        if (scope === "all") {
          return null;
        }

        return {
          ...(scope === "client"
            ? { clientInformation: undefined }
            : { clientInformation: current.clientInformation }),
          ...(scope === "tokens"
            ? { tokens: undefined }
            : { tokens: current.tokens }),
          ...(scope === "verifier"
            ? { codeVerifier: undefined, state: undefined }
            : { codeVerifier: current.codeVerifier, state: current.state }),
        };
      });
    },
    redirectToAuthorization(authorizationUrl) {
      if (!args.onRedirect) {
        throw new Error(
          "OAuth authorization must be started from Settings > MCP servers.",
        );
      }

      return args.onRedirect(authorizationUrl);
    },
    get redirectUrl() {
      return args.redirectUrl;
    },
    async saveClientInformation(clientInformation: OAuthClientInformation) {
      await updateMcpOAuthState(args, (current) => ({
        ...(current ?? {}),
        clientInformation,
      }));
    },
    async saveCodeVerifier(codeVerifier: string) {
      await updateMcpOAuthState(args, (current) => ({
        ...(current ?? {}),
        codeVerifier,
      }));
    },
    async saveTokens(tokens) {
      await updateMcpOAuthState(args, (current) => ({
        ...(current ?? {}),
        tokens,
      }));
    },
    async state() {
      const nextState = randomUUID();
      await updateMcpOAuthState(args, (current) => ({
        ...(current ?? {}),
        state: nextState,
      }));
      return nextState;
    },
    async tokens() {
      return (await getMcpOAuthState(args))?.tokens;
    },
  };
}

export async function beginMcpServerOAuth(args: BeginMcpServerOAuthArgs) {
  const redirectUrl = buildMcpOAuthRedirectUrl(args.appOrigin, args.entry.id);
  let authorizationUrl: string | null = null;

  const provider = createMcpOAuthProvider({
    onRedirect(url) {
      authorizationUrl = url.toString();
    },
    redirectUrl,
    serverId: args.entry.id,
    userId: args.userId,
  });

  const result = await auth(provider, {
    serverUrl: args.entry.config.url,
  });

  if (result === "AUTHORIZED") {
    await updateMcpOAuthState(
      { serverId: args.entry.id, userId: args.userId },
      (current) =>
        current
          ? {
              ...current,
              codeVerifier: undefined,
              state: undefined,
            }
          : null,
    );

    return { status: "authorized" as const };
  }

  if (!authorizationUrl) {
    throw new Error("OAuth authorization URL was not generated.");
  }

  return {
    authorizationUrl,
    status: "redirect" as const,
  };
}

export async function completeMcpServerOAuth(args: CompleteMcpServerOAuthArgs) {
  const stored = await getMcpOAuthState({
    serverId: args.entry.id,
    userId: args.userId,
  });

  if (!stored?.state || stored.state !== args.state) {
    throw new Error("OAuth state validation failed.");
  }

  const provider = createMcpOAuthProvider({
    redirectUrl: buildMcpOAuthRedirectUrl(args.appOrigin, args.entry.id),
    serverId: args.entry.id,
    userId: args.userId,
  });

  const result = await auth(provider, {
    authorizationCode: args.authorizationCode,
    serverUrl: args.entry.config.url,
  });

  if (result !== "AUTHORIZED") {
    throw new Error("OAuth authorization did not complete.");
  }

  await updateMcpOAuthState(
    { serverId: args.entry.id, userId: args.userId },
    (current) =>
      current
        ? {
            ...current,
            codeVerifier: undefined,
            state: undefined,
          }
        : null,
  );
}

export function requiresMcpOAuth(entry: {
  catalogId?: string;
  transport: "http" | "stdio";
}) {
  if (entry.transport !== "http" || !entry.catalogId) {
    return false;
  }

  return Boolean(getMcpCatalogEntry(entry.catalogId)?.requiresAuthentication);
}
