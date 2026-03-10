import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DESKTOP_CHANNELS } from "../shared/channels.mjs";
import { createRuntimePaths } from "../../scripts/desktop/constants.mjs";
import { ensureLocalEnv } from "../../scripts/desktop/service-manager.mjs";
import {
  getAppServerStatus,
  startLocalServer,
  stopLocalServer,
} from "../../scripts/desktop/server-manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverState = null;

// GPU acceleration is required for smooth backdrop-blur, shadows, and animations.
// Only disable if a specific driver issue is confirmed on a target platform.
// app.disableHardwareAcceleration();

function buildInlineHtml({ body, title }) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>
          :root { color-scheme: dark; }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #090909;
            color: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .shell {
            width: min(420px, calc(100vw - 48px));
            padding: 32px 24px;
            text-align: center;
          }
          .mark {
            width: 56px;
            height: 56px;
            border-radius: 12px;
            margin: 0 auto 18px;
            display: grid;
            place-items: center;
            background: #121212;
            border: 1px solid rgba(255,255,255,.08);
          }
          .mark svg {
            width: 30px;
            height: 30px;
            display: block;
            fill: currentColor;
          }
          h1 {
            margin: 0 0 10px;
            font-size: 24px;
            line-height: 1.15;
          }
          p {
            margin: 0;
            color: #a1a1aa;
            line-height: 1.55;
          }
          .spinner {
            width: 18px;
            height: 18px;
            margin: 18px auto 0;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,.14);
            border-top-color: rgba(255,255,255,.78);
            animation: spin .8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <main class="shell">
          ${body}
        </main>
      </body>
    </html>
  `)}`;
}

function getLoadingPageUrl() {
  return buildInlineHtml({
    title: "Opening Sentinel",
    body: `
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 201 200" xmlns="http://www.w3.org/2000/svg">
          <g clip-path="url(#sentinel-logo-clip)">
            <path d="M91.9711 91.6947C236.385 236.108 -35.8253 236.108 108.582 91.6947C-35.832 236.108 -35.832 -36.1018 108.582 108.305C-35.832 -36.1084 236.378 -36.1084 91.9711 108.305C236.385 -36.1084 236.385 236.102 91.9711 91.6947Z" />
          </g>
          <defs>
            <clipPath id="sentinel-logo-clip">
              <rect height="200" transform="translate(0.276367)" width="200" />
            </clipPath>
          </defs>
        </svg>
      </div>
      <h1>Opening Sentinel</h1>
      <p>Preparing your local workspace…</p>
      <div class="spinner" aria-hidden="true"></div>
    `,
  });
}

function getRuntimePaths() {
  return createRuntimePaths({
    appRoot: app.isPackaged ? app.getAppPath() : process.cwd(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
  });
}

async function prepareDevSession() {
  if (app.isPackaged) {
    return;
  }

  const devSession = session.defaultSession;
  devSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  });
  await devSession.clearCache();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: "#090909",
    frame: false,
    height: 920,
    minHeight: 720,
    minWidth: 1180,
    show: false,
    title: "Sentinel",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload", "index.mjs"),
      sandbox: false,
    },
    width: 1440,
  });
  let hasShownWindow = false;
  const showWindow = () => {
    if (hasShownWindow) {
      return;
    }

    hasShownWindow = true;
    mainWindow?.show();
  };

  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (process.env.NODE_ENV === "production") {
        return;
      }

      console.log(
        `[electron:renderer:${level}] ${message} (${sourceId || "unknown"}:${line})`,
      );
    },
  );

  mainWindow.webContents.on(
    "did-fail-load",
    async (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[electron] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`,
      );

      await mainWindow?.loadURL(
        buildInlineHtml({
          title: "Sentinel Load Error",
          body: `
            <h1>Sentinel could not load the app window</h1>
            <p>URL: <code>${validatedURL || "unknown"}</code></p>
            <p>Error: <code>${errorCode}</code> ${errorDescription}</p>
            <p>Check the terminal output from <code>bun dev:desktop</code>. In development this usually means the Next server was reachable on the port but not yet ready to serve the page.</p>
          `,
        }),
      );
    },
  );

  void mainWindow.loadURL(getLoadingPageUrl());
  mainWindow.webContents.once("did-finish-load", showWindow);
  mainWindow.once("ready-to-show", showWindow);
}

async function loadFailureState(error) {
  const message =
    error instanceof Error ? error.message : "Unable to start Sentinel.";

  await mainWindow?.loadURL(
    buildInlineHtml({
      title: "Sentinel Startup Error",
      body: `
        <h1>Sentinel could not start</h1>
        <p>${message}</p>
      `,
    }),
  );
}

async function bootstrapDesktop() {
  const runtimePaths = getRuntimePaths();
  await ensureLocalEnv(runtimePaths);

  serverState = await startLocalServer(runtimePaths);
  await mainWindow?.loadURL(serverState.url);
}

function registerIpc() {
  ipcMain.handle(DESKTOP_CHANNELS.PICK_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ["openDirectory"],
    });

    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) {
      return null;
    }

    return {
      name: path.basename(selectedPath),
      path: selectedPath,
    };
  });

  ipcMain.handle(DESKTOP_CHANNELS.PICK_FILES, async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ["multiSelections", "openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return Promise.all(
      result.filePaths.map(async (selectedPath) => {
        const selectedStat = await stat(selectedPath).catch(() => null);

        return {
          name: path.basename(selectedPath),
          path: selectedPath,
          size: selectedStat?.size,
        };
      }),
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_STATUS, async () => {
    const appServer = await getAppServerStatus(
      serverState?.url ??
        process.env.SENTINEL_APP_URL ??
        "http://127.0.0.1:3232",
    );

    return { appServer };
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_START, async () => {
    const runtimePaths = getRuntimePaths();

    if (!serverState) {
      serverState = await startLocalServer(runtimePaths);
      await mainWindow?.loadURL(serverState.url);
    }

    const appServer = await getAppServerStatus(
      serverState?.url ??
        process.env.SENTINEL_APP_URL ??
        "http://127.0.0.1:3232",
    );

    return { appServer };
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_STOP, async () => {
    await stopLocalServer(serverState);
    serverState = null;

    return { appServer: false };
  });

  ipcMain.handle(DESKTOP_CHANNELS.APP_VERSION, async () => app.getVersion());
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_CLOSE, async () => {
    mainWindow?.close();
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_MINIMIZE, async () => {
    mainWindow?.minimize();
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }

    mainWindow.maximize();
    return true;
  });
}

app.whenReady().then(async () => {
  await prepareDevSession();
  createWindow();
  registerIpc();

  try {
    await bootstrapDesktop();
  } catch (error) {
    await loadFailureState(error);
  }
});

app.on("window-all-closed", async () => {
  await stopLocalServer(serverState);
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
