import { NextResponse } from "next/server";

import { completeIntegrationOAuth } from "@/lib/integrations/oauth/flow";
import type { IntegrationProvider } from "@/server/db/enums";
import { getLocalSession } from "@/server/local-profile";

function parseProviderFromState(
  state: string | null,
): IntegrationProvider | null {
  if (!state) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8"),
    );
    return typeof payload.provider === "string"
      ? (payload.provider as IntegrationProvider)
      : null;
  } catch {
    return null;
  }
}

function getIntegrationLabel(provider: IntegrationProvider | null) {
  switch (provider) {
    case "gmail":
      return "Gmail";
    case "google_calendar":
      return "Google Calendar";
    case "google_drive":
      return "Google Drive";
    case "slack":
      return "Slack";
    case "notion":
      return "Notion";
    case "github":
      return "GitHub";
    case "linear":
      return "Linear";
    default:
      return "Integration";
  }
}

function renderIntegrationIcon(provider: IntegrationProvider | null) {
  switch (provider) {
    case "gmail":
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 49.4 512 399.42" aria-hidden="true">
          <g fill="none" fill-rule="evenodd">
            <g fill-rule="nonzero">
              <path fill="#4285f4" d="M34.91 448.818h81.454V251L0 163.727V413.91c0 19.287 15.622 34.91 34.91 34.91z"/>
              <path fill="#34a853" d="M395.636 448.818h81.455c19.287 0 34.909-15.622 34.909-34.909V163.727L395.636 251z"/>
              <path fill="#fbbc04" d="M395.636 99.727V251L512 163.727v-46.545c0-43.142-49.25-67.782-83.782-41.891z"/>
            </g>
            <path fill="#ea4335" d="M116.364 251V99.727L256 204.455 395.636 99.727V251L256 355.727z"/>
            <path fill="#c5221f" fill-rule="nonzero" d="M0 117.182v46.545L116.364 251V99.727L83.782 75.291C49.25 49.4 0 74.04 0 117.18z"/>
          </g>
        </svg>`;
    case "google_calendar":
      return `
        <svg x="0px" y="0px" viewBox="0 0 200 200" aria-hidden="true">
          <g><g transform="translate(3.75 3.75)">
            <path fill="#FFFFFF" d="M148.882,43.618l-47.368-5.263l-57.895,5.263L38.355,96.25l5.263,52.632l52.632,6.579l52.632-6.579l5.263-53.947L148.882,43.618z"/>
            <path fill="#1A73E8" d="M65.211,125.276c-3.934-2.658-6.658-6.539-8.145-11.671l9.132-3.763c0.829,3.158,2.276,5.605,4.342,7.342c2.053,1.737,4.553,2.592,7.474,2.592c2.987,0,5.553-0.908,7.697-2.724s3.224-4.132,3.224-6.934c0-2.868-1.132-5.211-3.395-7.026s-5.105-2.724-8.5-2.724h-5.276v-9.039H76.5c2.921,0,5.382-0.789,7.382-2.368c2-1.579,3-3.737,3-6.487c0-2.447-0.895-4.395-2.684-5.855s-4.053-2.197-6.803-2.197c-2.684,0-4.816,0.711-6.395,2.145s-2.724,3.197-3.447,5.276l-9.039-3.763c1.197-3.395,3.395-6.395,6.618-8.987c3.224-2.592,7.342-3.895,12.342-3.895c3.697,0,7.026,0.711,9.974,2.145c2.947,1.434,5.263,3.421,6.934,5.947c1.671,2.539,2.5,5.382,2.5,8.539c0,3.224-0.776,5.947-2.329,8.184c-1.553,2.237-3.461,3.947-5.724,5.145v0.539c2.987,1.25,5.421,3.158,7.342,5.724c1.908,2.566,2.868,5.632,2.868,9.211s-0.908,6.776-2.724,9.579c-1.816,2.803-4.329,5.013-7.513,6.618c-3.197,1.605-6.789,2.421-10.776,2.421C73.408,129.263,69.145,127.934,65.211,125.276z"/>
            <path fill="#1A73E8" d="M121.25,79.961l-9.974,7.25l-5.013-7.605l17.987-12.974h6.895v61.197h-9.895L121.25,79.961z"/>
            <path fill="#EA4335" d="M148.882,196.25l47.368-47.368l-23.684-10.526l-23.684,10.526l-10.526,23.684L148.882,196.25z"/>
            <path fill="#34A853" d="M33.092,172.566l10.526,23.684h105.263v-47.368H43.618L33.092,172.566z"/>
            <path fill="#4285F4" d="M12.039-3.75C3.316-3.75-3.75,3.316-3.75,12.039v136.842l23.684,10.526l23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75H12.039z"/>
            <path fill="#188038" d="M-3.75,148.882v31.579c0,8.724,7.066,15.789,15.789,15.789h31.579v-47.368H-3.75z"/>
            <path fill="#FBBC04" d="M148.882,43.618v105.263h47.368V43.618l-23.684-10.526L148.882,43.618z"/>
            <path fill="#1967D2" d="M196.25,43.618V12.039c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368H196.25z"/>
          </g></g>
        </svg>`;
    case "google_drive":
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.3 78" aria-hidden="true">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85z" fill="#ea4335"/>
          <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.35c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>`;
    case "slack":
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127 127" aria-hidden="true">
          <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#e01e5a"/>
          <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36c5f0"/>
          <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2eb67d"/>
          <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ecb22e"/>
        </svg>`;
    case "notion":
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#fff" d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
        </svg>`;
    case "github":
      return `
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g clip-path="url(#gh)">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C12.1381 15.0539 13.5182 14.0332 14.4958 12.6716C15.4735 11.3101 15.9996 9.6762 16 8C16 3.58 12.42 0 8 0Z" fill="#fff"/>
          </g>
          <defs><clipPath id="gh"><rect width="16" height="16" fill="white"/></clipPath></defs>
        </svg>`;
    case "linear":
      return `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 100 100" aria-hidden="true">
          <path fill="#5E6AD2" d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z"/>
        </svg>`;
    default:
      return `
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="10" y="10" width="44" height="44" rx="14" fill="#1f1f23" stroke="rgba(255,255,255,.12)"/>
          <path d="M24 32h16M32 24v16" stroke="#f5f5f5" stroke-width="4" stroke-linecap="round"/>
        </svg>`;
  }
}

function renderHtml(args: {
  appOrigin: string;
  message: string;
  provider: IntegrationProvider | null;
  success: boolean;
}) {
  const payload = JSON.stringify({
    success: args.success,
    type: "integration-oauth-complete",
  });
  const providerLabel = getIntegrationLabel(args.provider);
  const heading = args.success
    ? "Authentication complete"
    : "Authentication failed";
  const statusLabel = args.success
    ? `${providerLabel} is ready in Sentinel.`
    : `Sentinel could not finish connecting ${providerLabel}.`;

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
        width: min(360px, calc(100vw - 40px));
        padding: 20px 20px 24px;
        text-align: center;
      }
      .icon {
        width: 52px;
        height: 52px;
        margin: 0 auto 16px;
        display: grid;
        place-items: center;
      }
      .icon svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .spinner {
        width: 18px;
        height: 18px;
        margin: 0 auto 14px;
        border-radius: 999px;
        border: 2px solid rgba(255,255,255,.15);
        border-top-color: #f5f5f5;
        animation: spin .8s linear infinite;
      }
      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
      }
      .status {
        margin: 8px 0 0;
        font-size: 13px;
        color: #d4d4d8;
      }
      .message {
        margin: 14px 0 0;
        line-height: 1.5;
        color: #a1a1aa;
        font-size: 14px;
      }
      .hint {
        margin: 16px 0 0;
        font-size: 12px;
        color: #71717a;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="icon">${renderIntegrationIcon(args.provider)}</div>
      <h1>${heading}</h1>
      <p class="status">${statusLabel}</p>
      <p class="message">${args.message}</p>
      <p class="hint">You can close this window.</p>
    </main>
    <script>
      try {
        const channel = new BroadcastChannel("sentinel-integration-oauth");
        channel.postMessage(${payload});
        channel.close();
      } catch {}
      try {
        window.opener?.postMessage(${payload}, ${JSON.stringify(args.appOrigin)});
      } catch {}
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const provider = parseProviderFromState(state);

  await getLocalSession();

  if (oauthError) {
    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: oauthErrorDescription ?? oauthError,
        provider,
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
        provider,
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }

  try {
    await completeIntegrationOAuth(code, state);

    return new NextResponse(
      renderHtml({
        appOrigin: url.origin,
        message: "You can return to Sentinel now.",
        provider,
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
        provider,
        success: false,
      }),
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 400 },
    );
  }
}
