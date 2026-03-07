import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DESKTOP_CHANNELS } from "../shared/channels.mjs";
import { createRuntimePaths } from "../../scripts/desktop/constants.mjs";
import {
  ensureLocalEnv,
  getInfrastructureStatus,
  startInfrastructure,
  stopInfrastructure,
  syncPrismaSchema,
  waitForInfrastructure,
} from "../../scripts/desktop/service-manager.mjs";
import {
  getAppServerStatus,
  startLocalServer,
  stopLocalServer,
} from "../../scripts/desktop/server-manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverState = null;

app.disableHardwareAcceleration();

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
            background:
              radial-gradient(circle at top, rgba(56,56,61,.35), transparent 40%),
              #090909;
            color: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .shell {
            max-width: 560px;
            padding: 40px;
          }
          h1 {
            margin: 0 0 16px;
            font-size: 28px;
          }
          p {
            margin: 0 0 10px;
            color: #a1a1aa;
            line-height: 1.6;
          }
          code {
            color: #f5f5f5;
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
    title: "Starting Sentinel",
    body: `
      <h1>Starting Sentinel</h1>
      <p>Checking the local runtime, database migrations, and the app server.</p>
      <p>If this takes more than a few seconds in development, check the terminal for renderer or load errors.</p>
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
  mainWindow.once("ready-to-show", () => mainWindow?.show());
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
        <p>Verify Docker Desktop is installed and running, then restart Sentinel.</p>
      `,
    }),
  );
}

async function bootstrapDesktop() {
  const runtimePaths = getRuntimePaths();
  await ensureLocalEnv(runtimePaths);

  const initialStatus = await getInfrastructureStatus(runtimePaths);
  if (!initialStatus.docker) {
    throw new Error("Docker Desktop is required before Sentinel can start.");
  }

  if (
    !initialStatus.postgres ||
    !initialStatus.redis ||
    !initialStatus.qdrant
  ) {
    await startInfrastructure(runtimePaths);
  }

  await waitForInfrastructure(runtimePaths);
  await syncPrismaSchema(runtimePaths);

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
    const runtimePaths = getRuntimePaths();
    const status = await getInfrastructureStatus(runtimePaths);
    const appServer = await getAppServerStatus(
      serverState?.url ??
        process.env.SENTINEL_APP_URL ??
        "http://127.0.0.1:3232",
    );

    return {
      appServer,
      ...status,
    };
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_START, async () => {
    const runtimePaths = getRuntimePaths();
    await startInfrastructure(runtimePaths);
    const status = await waitForInfrastructure(runtimePaths);

    if (!serverState) {
      await syncPrismaSchema(runtimePaths);
      serverState = await startLocalServer(runtimePaths);
      await mainWindow?.loadURL(serverState.url);
    }

    return {
      ...status,
      appServer: await getAppServerStatus(
        serverState?.url ??
          process.env.SENTINEL_APP_URL ??
          "http://127.0.0.1:3232",
      ),
    };
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_STOP, async () => {
    const runtimePaths = getRuntimePaths();
    await stopLocalServer(serverState);
    serverState = null;
    const status = await stopInfrastructure(runtimePaths);

    return status;
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
