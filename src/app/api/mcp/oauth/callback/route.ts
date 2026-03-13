import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { completeMcpServerOAuth } from "@/lib/mcp/oauth";
import {
  parseStoredMcpServer,
  type McpHttpRuntimeEntry,
} from "@/lib/mcp/runtime";
import { getLocalSession } from "@/server/local-profile";
import { db } from "@/server/db";
import { mcpServerConfigs } from "@/server/db/schema";

function renderHtml(args: {
  appOrigin: string;
  message: string;
  success: boolean;
}) {
  const payload = JSON.stringify({
    success: args.success,
    type: "mcp-oauth-complete",
  });
  const heading = args.success
    ? "Authentication complete"
    : "Authentication failed";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #090909;
        color: #f5f5f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(480px, calc(100vw - 48px));
        padding: 32px 24px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 20px;
        background: #111111;
      }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0; line-height: 1.6; color: #a1a1aa; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${args.message}</p>
    </main>
    <script>
      const payload = ${payload};
      try {
        const channel = new BroadcastChannel("sentinel-mcp-oauth");
        channel.postMessage(payload);
        channel.close();
      } catch {}
      try {
        window.opener?.postMessage(payload, ${JSON.stringify(args.appOrigin)});
      } catch {}
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 50);
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const serverId = url.searchParams.get("serverId");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const session = await getLocalSession();

  if (!serverId) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: "Missing MCP server id.",
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }

  if (oauthError) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: oauthErrorDescription ?? oauthError,
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }

  if (!code || !state) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: "Missing OAuth code or state.",
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }

  const row = await db.query.mcpServerConfigs.findFirst({
    where: and(
      eq(mcpServerConfigs.id, serverId),
      eq(mcpServerConfigs.userId, session.user.id),
    ),
  });

  if (!row) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: "MCP server not found.",
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 404 },
    );
  }

  try {
    const parsed = parseStoredMcpServer(row);

    if (parsed.transport !== "http") {
      throw new Error("OAuth is only supported for HTTP MCP servers.");
    }

    await completeMcpServerOAuth({
      appOrigin: url.origin,
      authorizationCode: code,
      entry: parsed as McpHttpRuntimeEntry,
      state,
      userId: session.user.id,
    });

    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: "You can return to Sentinel now.",
        success: true,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message:
          error instanceof Error
            ? error.message
            : "OAuth authentication could not be completed.",
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }
}
