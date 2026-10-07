import { NextResponse, type NextRequest } from "next/server";

import { evaluateLoopbackRequest } from "@/server/http/loopback-guard";

function getTrustedOrigins() {
  const appUrl = process.env.SENTINEL_APP_URL?.trim();
  return appUrl ? [appUrl] : [];
}

// Next 16 proxy (formerly middleware); it runs on the Node.js runtime in front
// of every /api route. See src/server/http/loopback-guard.ts for the rules.
export function proxy(request: NextRequest) {
  const decision = evaluateLoopbackRequest({
    headers: request.headers,
    method: request.method,
    pathname: request.nextUrl.pathname,
    trustedOrigins: getTrustedOrigins(),
  });

  if (decision.allowed) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: decision.reason, message: decision.message },
    {
      headers: { "Cache-Control": "no-store" },
      status: decision.status,
    },
  );
}

export const config = {
  matcher: "/api/:path*",
};
