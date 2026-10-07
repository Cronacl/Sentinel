// Loopback guard for the local API. The app server binds 127.0.0.1 and serves
// a single desktop window, so every legitimate /api request either comes from
// that window (same origin), from a non-browser loopback client (Electron main
// health checks) or, for the OAuth callbacks below, from a browser redirect.
//
// Two attacks are refused here:
// - DNS rebinding: a page on attacker.example re-resolves its name to
//   127.0.0.1 and then talks to the API "same-origin". The browser still sends
//   `Host: attacker.example:3232`, so only loopback Host names are accepted.
//   The Host header is the only trustworthy name: browsers forbid scripts from
//   setting it, unlike the forwarding headers, which this guard never reads.
// - Cross-origin requests: any other site (or another local dev server on a
//   different port) sending fetch/form requests to 127.0.0.1:3232. Browsers
//   attach Origin to those (and Sec-Fetch-Site to all requests), so a foreign
//   Origin or a cross-site fetch-metadata value is refused.
//
// The Host port is not compared with the server's: a browser always sends
// the host:port it connected to, so a page cannot present another loopback
// port to this server; only a local client or proxy can, and those are
// trusted like any loopback client. The configured app URL (SENTINEL_APP_URL,
// passed as a trusted origin) is accepted as both Host and Origin, so a
// desktop shell pointed at it (a dev server, a reverse proxy) keeps working.

/**
 * Routes that legitimately receive a cross-site top-level navigation: OAuth
 * providers redirect the browser back to them. They still require a loopback
 * Host, but skip the same-origin checks for GET/HEAD.
 */
export const EXTERNAL_REDIRECT_API_ROUTES = [
  "/api/integrations/oauth/callback",
  "/api/mcp/oauth/callback",
] as const;

export type LoopbackGuardRequest = {
  method: string;
  pathname: string;
  headers: Pick<Headers, "get">;
  /**
   * Extra origins to accept (SENTINEL_APP_URL): requests may carry them as
   * Origin, and their host:port as Host.
   */
  trustedOrigins?: readonly string[];
};

export type LoopbackGuardDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 403 | 421;
      reason: "host" | "origin" | "fetch-site";
      message: string;
    };

const SAFE_FETCH_SITES = new Set(["same-origin", "none"]);
const NAVIGATION_METHODS = new Set(["GET", "HEAD"]);

function stripTrailingDot(hostname: string) {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

/**
 * True for names that always resolve to this machine: `localhost`,
 * `*.localhost` (RFC 6761), 127.0.0.0/8 and ::1. Expects a hostname as
 * returned by the WHATWG URL parser (lowercase, IPv6 in brackets, IPv4 in
 * dotted-quad form).
 */
export function isLoopbackHostname(hostname: string) {
  const normalized = stripTrailingDot(hostname.trim().toLowerCase());

  if (!normalized) {
    return false;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized === "[::1]" || normalized === "::1") {
    return true;
  }

  const ipv4 = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (ipv4) {
    return ipv4.slice(1).every((octet) => Number(octet) <= 255);
  }

  // IPv4-mapped IPv6 loopback, as the URL parser prints it.
  return /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(normalized);
}

/**
 * Parses a Host header (`name[:port]`) with the URL parser so numeric and
 * IPv6 spellings normalise (`127.1` → `127.0.0.1`, `[0::1]` → `[::1]`).
 * Returns null for anything that is not a bare host and optional port.
 */
export function parseHostHeader(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || /[/?#@\s\\]/.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(`http://${trimmed}`);
    return {
      host: url.host,
      hostname: url.hostname,
      port: url.port,
    };
  } catch {
    return null;
  }
}

function parseOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // An Origin header is scheme://host[:port] and nothing else.
    if (url.origin !== value.replace(/\/$/, "")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function defaultPort(protocol: string) {
  return protocol === "https:" ? "443" : "80";
}

/**
 * The app's own origin, under any loopback alias of the port it was reached
 * on: the window at http://localhost:3232 and a callback page served from
 * http://127.0.0.1:3232 are the same server.
 */
function isOwnOrigin(
  origin: URL,
  host: NonNullable<ReturnType<typeof parseHostHeader>>,
) {
  if (!isLoopbackHostname(origin.hostname)) {
    return false;
  }

  const originPort = origin.port || defaultPort(origin.protocol);
  const hostPort = host.port || defaultPort(origin.protocol);
  return originPort === hostPort;
}

function parseTrustedOrigins(trustedOrigins: readonly string[]) {
  return trustedOrigins.flatMap((candidate) => {
    try {
      const url = new URL(candidate.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? [url] : [];
    } catch {
      return [];
    }
  });
}

function isTrustedOrigin(origin: URL, trustedOrigins: readonly URL[]) {
  return trustedOrigins.some((trusted) => trusted.origin === origin.origin);
}

/** The Host a browser sends when it loads one of the trusted origins. */
function isTrustedHost(
  host: NonNullable<ReturnType<typeof parseHostHeader>>,
  trustedOrigins: readonly URL[],
) {
  return trustedOrigins.some((trusted) => {
    const trustedPort = trusted.port || defaultPort(trusted.protocol);
    const hostPort = host.port || defaultPort(trusted.protocol);
    return trusted.hostname === host.hostname && trustedPort === hostPort;
  });
}

export function isExternalRedirectApiRoute(pathname: string) {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return (EXTERNAL_REDIRECT_API_ROUTES as readonly string[]).includes(
    normalized,
  );
}

export function evaluateLoopbackRequest(
  request: LoopbackGuardRequest,
): LoopbackGuardDecision {
  const host = parseHostHeader(request.headers.get("host"));
  const trustedOrigins = parseTrustedOrigins(request.trustedOrigins ?? []);

  if (
    !host ||
    !(isLoopbackHostname(host.hostname) || isTrustedHost(host, trustedOrigins))
  ) {
    return {
      allowed: false,
      message: "Sentinel only answers requests addressed to a loopback host.",
      reason: "host",
      status: 421,
    };
  }

  const method = request.method.toUpperCase();
  if (
    NAVIGATION_METHODS.has(method) &&
    isExternalRedirectApiRoute(request.pathname)
  ) {
    return { allowed: true };
  }

  const originHeader = request.headers.get("origin");
  if (originHeader !== null) {
    const origin = parseOrigin(originHeader.trim());
    const trusted =
      origin !== null &&
      (isOwnOrigin(origin, host) || isTrustedOrigin(origin, trustedOrigins));

    if (!trusted) {
      return {
        allowed: false,
        message: "Cross-origin requests to the Sentinel API are not allowed.",
        reason: "origin",
        status: 403,
      };
    }

    return { allowed: true };
  }

  // No Origin: a same-origin GET, a top-level navigation, a no-cors
  // subresource (img/script) or a non-browser client. Browsers label the
  // first two same-origin/none; anything they label cross-site or same-site
  // (another port on localhost) came from a foreign page.
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) {
    return {
      allowed: false,
      message: "Cross-site requests to the Sentinel API are not allowed.",
      reason: "fetch-site",
      status: 403,
    };
  }

  return { allowed: true };
}
