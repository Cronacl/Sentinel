import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
} from "electron";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as nodePty from "node-pty";

import { DESKTOP_CHANNELS } from "../shared/channels.mjs";
import {
  getOpenFileCommandForTarget,
  getOpenCommandForTarget,
  resolveMacOpenTargets,
} from "../shared/workspace-targets.mjs";
import {
  APP_PORT,
  createRuntimePaths,
} from "../../scripts/desktop/constants.mjs";
import { ensureLocalEnv } from "../../scripts/desktop/service-manager.mjs";
import {
  getAppServerStatus,
  killProcessOnPort,
  startLocalServer,
  stopLocalServer,
} from "../../scripts/desktop/server-manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let mainWindow = null;
let serverState = null;
let isQuitting = false;
let resolvedTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
const terminalSessions = new Map();

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

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getWindowBackgroundColor(theme) {
  return theme === "light" ? "#f5f5f5" : "#090909";
}

function resolveWindowIconPath() {
  if (process.platform !== "win32") {
    return undefined;
  }

  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "server", "public", "favicon.ico")]
    : [path.resolve(__dirname, "..", "..", "public", "favicon.ico")];

  return candidates.find((candidate) => existsSync(candidate));
}

function getTerminalShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }

  return process.env.SHELL || "/bin/zsh";
}

function getTerminalShellCandidates() {
  if (process.platform === "win32") {
    return [getTerminalShell(), "powershell.exe", "cmd.exe"].filter(Boolean);
  }

  return Array.from(
    new Set([getTerminalShell(), "/bin/zsh", "/bin/bash", "/bin/sh"]),
  );
}

function getTerminalShellArgs(shellPath) {
  if (process.platform === "win32") {
    return [];
  }

  const shellName = path.basename(shellPath);
  if (shellName === "zsh" || shellName === "bash" || shellName === "fish") {
    return ["-l"];
  }

  return [];
}

function ensureNodePtySpawnHelperExecutable() {
  if (process.platform === "win32") {
    return;
  }

  const unixTerminalPath = require.resolve("node-pty/lib/unixTerminal.js");
  const unixTerminalDir = path.dirname(unixTerminalPath);
  const helperCandidates = [
    path.resolve(unixTerminalDir, "../build/Release/spawn-helper"),
    path.resolve(unixTerminalDir, "../build/Debug/spawn-helper"),
    path.resolve(
      unixTerminalDir,
      `../prebuilds/${process.platform}-${process.arch}/spawn-helper`,
    ),
  ];

  for (const helperPath of helperCandidates) {
    if (!existsSync(helperPath)) {
      continue;
    }

    try {
      chmodSync(helperPath, 0o755);
    } catch (error) {
      console.warn(
        `[electron] failed to update node-pty helper permissions for ${helperPath}`,
        error,
      );
    }

    return;
  }
}

function sendTerminalEvent(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, ...args);
}

function cleanupTerminalSession(sessionId) {
  terminalSessions.delete(sessionId);
}

function killAllTerminalSessions() {
  for (const [sessionId, session] of terminalSessions.entries()) {
    try {
      session.pty.kill();
    } catch (error) {
      console.warn(`[electron] failed to kill terminal ${sessionId}`, error);
      cleanupTerminalSession(sessionId);
    }
  }
}

function createTerminalSession(cwd) {
  const sessionId = randomUUID();
  ensureNodePtySpawnHelperExecutable();
  const shellCandidates = getTerminalShellCandidates();
  let ptyProcess = null;
  let lastError = null;

  for (const shellPath of shellCandidates) {
    try {
      ptyProcess = nodePty.spawn(shellPath, getTerminalShellArgs(shellPath), {
        cols: 120,
        cwd,
        env: {
          ...process.env,
          COLORTERM: "truecolor",
          TERM: "xterm-256color",
        },
        name: "xterm-256color",
        rows: 32,
      });
      break;
    } catch (error) {
      lastError = error;
      console.warn(`[electron] failed to spawn shell ${shellPath}`, error);
    }
  }

  if (!ptyProcess) {
    const reason =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Unable to start terminal shell. Tried: ${shellCandidates.join(", ")}. Last error: ${reason}`,
    );
  }

  terminalSessions.set(sessionId, {
    createdAt: Date.now(),
    cwd,
    pid: ptyProcess.pid,
    pty: ptyProcess,
  });

  ptyProcess.onData((data) => {
    sendTerminalEvent(DESKTOP_CHANNELS.TERMINAL_DATA, sessionId, data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    sendTerminalEvent(DESKTOP_CHANNELS.TERMINAL_EXIT, sessionId, exitCode ?? 0);
    cleanupTerminalSession(sessionId);
  });

  return {
    pid: ptyProcess.pid,
    sessionId,
  };
}

function getBrowserWindowChromeOptions() {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
    };
  }

  return {
    frame: false,
  };
}

async function applyThemeToPopupGuest(guestContents, theme) {
  try {
    if (!guestContents.debugger.isAttached()) {
      guestContents.debugger.attach("1.3");
    }

    await guestContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [
        {
          name: "prefers-color-scheme",
          value: theme,
        },
      ],
    });
  } catch (error) {
    console.warn("[electron] failed to apply popup theme", error);
  }
}

function getPopupHtml(targetUrl, appOrigin, theme, platform) {
  const escapedUrl = escapeHtml(targetUrl);
  const escapedAppOrigin = escapeHtml(appOrigin);
  const escapedTheme = theme === "light" ? "light" : "dark";
  const usesNativeMacChrome = platform === "darwin";
  const isWindows = platform === "win32";
  const edgeWidth = usesNativeMacChrome
    ? 72
    : isWindows
      ? 132
      : platform === "linux"
        ? 112
        : 0;
  const expandButtonTitle =
    platform === "darwin" ? "Toggle Full Screen" : "Maximize";
  let hostname;
  try {
    hostname = escapeHtml(new URL(targetUrl).hostname);
  } catch {
    hostname = escapedUrl;
  }

  const leadingChrome = `<div class="ws" aria-hidden="true"></div>`;
  const trailingChrome = isWindows
    ? `
      <div class="wcwr" aria-label="Window controls">
        <button class="wc wb" id="bn" title="Minimize" aria-label="Minimize window">
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 7.25h6"/></svg>
        </button>
        <button class="wc wb" id="bx" title="${expandButtonTitle}" aria-label="Maximize window">
          <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="2.25" y="2.25" width="5.5" height="5.5" rx=".2"/></svg>
        </button>
        <button class="wc wbc" id="bc" title="Close" aria-label="Close window">
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 2.5 5 5m0-5-5 5"/></svg>
        </button>
      </div>
    `
    : platform === "linux"
      ? `
        <div class="wcwr wcwr-linux" aria-label="Window controls">
          <button class="wc wl" id="bn" title="Minimize" aria-label="Minimize window">
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 7.25h6"/></svg>
          </button>
          <button class="wc wl" id="bx" title="${expandButtonTitle}" aria-label="Maximize window">
            <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="2.5" y="2.5" width="5" height="5" rx="1"/></svg>
          </button>
          <button class="wc wl" id="bc" title="Close" aria-label="Close window">
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 2.5 5 5m0-5-5 5"/></svg>
          </button>
        </div>
      `
      : `<div class="ws" aria-hidden="true"></div>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en" data-theme="${escapedTheme}">
<head>
<meta charset="UTF-8"/>
<title>${hostname} — Sentinel</title>
<style>
:root{color-scheme:light dark}
html[data-theme="dark"]{
  color-scheme:dark;
  --bg:#090909;
  --panel:#090909;
  --text:rgba(245,245,245,.4);
  --border:rgba(255,255,255,.06);
  --control-hover:rgba(255,255,255,.08);
  --control-hover-text:rgba(245,245,245,.78);
  --loader:rgba(255,255,255,.35);
}
html[data-theme="light"]{
  color-scheme:light;
  --bg:#f5f5f5;
  --panel:#fcfcfc;
  --text:rgba(24,24,27,.45);
  --border:rgba(24,24,27,.08);
  --control-hover:rgba(24,24,27,.06);
  --control-hover-text:rgba(24,24,27,.82);
  --loader:rgba(24,24,27,.24);
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.tb{height:38px;display:grid;grid-template-columns:${edgeWidth}px 1fr ${edgeWidth}px;align-items:center;padding:0 14px;-webkit-app-region:drag;background:var(--panel);border-bottom:1px solid var(--border);gap:10px;user-select:none}
.url{min-width:0;text-align:center;font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em}
.ws{height:32px}
.wcwr{display:flex;align-items:stretch;justify-content:flex-end;height:32px;-webkit-app-region:no-drag}
.wcwr-linux{gap:4px;align-items:center}
.wc{border:none;background:transparent;color:var(--text);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
.wc svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1}
.wb{width:44px;height:32px}
.wbc:hover{background:#e81123;color:#fff}
.wb:hover{background:var(--control-hover);color:var(--control-hover-text)}
.wl{width:32px;height:32px;border-radius:8px}
.wl:hover{background:var(--control-hover);color:var(--control-hover-text)}
.lb{height:2px;background:linear-gradient(90deg,transparent,var(--loader),transparent);background-size:200% 100%;animation:lbs 1.2s linear infinite;opacity:0;transition:opacity .2s}
.lb.on{opacity:1}
@keyframes lbs{0%{background-position:200% 0}100%{background-position:-200% 0}}
webview{width:100%;height:calc(100% - 40px);border:none}
</style>
</head>
<body>
<div class="tb">
${leadingChrome}
<div class="url" id="ud">${hostname}</div>
${trailingChrome}
</div>
<div class="lb" id="lb"></div>
<webview id="wv" src="${escapedUrl}"></webview>
<script>
var wv=document.getElementById('wv'),ud=document.getElementById('ud'),lb=document.getElementById('lb');
var bc=document.getElementById('bc'),bn=document.getElementById('bn'),bx=document.getElementById('bx');
if(bc){bc.onclick=function(){window.sentinelDesktop&&window.sentinelDesktop.window.close()}}
if(bn){bn.onclick=function(){window.sentinelDesktop&&window.sentinelDesktop.window.minimize()}}
if(bx){bx.onclick=function(){window.sentinelDesktop&&window.sentinelDesktop.window.toggleMaximize()}}
wv.addEventListener('did-start-loading',function(){lb.classList.add('on')});
wv.addEventListener('did-stop-loading',function(){lb.classList.remove('on')});
wv.addEventListener('did-navigate',function(e){
  try{
    var url=new URL(e.url);
    ud.textContent=url.hostname;
    if(url.origin==='${escapedAppOrigin}'&&url.pathname==='/api/mcp/oauth/callback'){
      setTimeout(function(){window.sentinelDesktop&&window.sentinelDesktop.window.close()},600);
    }
  }catch(x){ud.textContent=e.url}
});
wv.addEventListener('page-title-updated',function(e){document.title=e.title+' \\u2014 Sentinel'});
</script>
</body>
</html>`)}`;
}

function isExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (serverState?.url && url.startsWith(serverState.url)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function createBrowserPopup(url) {
  const theme = resolvedTheme;
  const popup = new BrowserWindow({
    backgroundColor: getWindowBackgroundColor(theme),
    height: 720,
    minHeight: 400,
    minWidth: 500,
    title: "Sentinel",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload", "index.mjs"),
      sandbox: false,
      webviewTag: true,
    },
    width: 1020,
    ...getBrowserWindowChromeOptions(),
  });

  popup.webContents.on("did-attach-webview", (_event, guestContents) => {
    void applyThemeToPopupGuest(guestContents, theme);
  });

  void popup.loadURL(
    getPopupHtml(
      url,
      serverState?.url ??
        process.env.SENTINEL_APP_URL ??
        "http://localhost:3232",
      theme,
      process.platform,
    ),
  );
  popup.once("ready-to-show", () => popup.show());
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
  const windowIcon = resolveWindowIconPath();

  mainWindow = new BrowserWindow({
    backgroundColor: "#090909",
    height: 920,
    icon: windowIcon,
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
    ...getBrowserWindowChromeOptions(),
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      createBrowserPopup(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });

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

async function assertProjectDirectory(projectPath) {
  if (typeof projectPath !== "string" || !projectPath.trim()) {
    throw new Error("Project path is required.");
  }

  const normalizedPath = projectPath.trim();
  const stats = await stat(normalizedPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error("Project path must point to an existing directory.");
  }

  return normalizedPath;
}

async function listWorkspaceTargets() {
  if (process.platform !== "darwin") {
    return [];
  }

  const targets = await resolveMacOpenTargets({
    exists: async (candidatePath) => {
      const stats = await stat(candidatePath).catch(() => null);
      return Boolean(stats);
    },
    homePath: app.getPath("home"),
  });

  return targets.map(
    ({ appPath: _appPath, systemApp: _systemApp, ...target }) => target,
  );
}

async function resolveWorkspaceTarget(targetId) {
  if (process.platform !== "darwin") {
    throw new Error("Workspace launch targets are only supported on macOS.");
  }

  const targets = await resolveMacOpenTargets({
    exists: async (candidatePath) => {
      const stats = await stat(candidatePath).catch(() => null);
      return Boolean(stats);
    },
    homePath: app.getPath("home"),
  });

  const target = targets.find((entry) => entry.id === targetId);
  if (!target) {
    throw new Error("The requested app target is not available.");
  }

  return target;
}

async function runOpenCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Command failed with exit code ${code ?? 1}.`));
    });
  });
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

  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_LIST_OPEN_TARGETS,
    async (_event, projectPath) => {
      await assertProjectDirectory(projectPath);
      return await listWorkspaceTargets();
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_OPEN_FILE_IN_TARGET,
    async (_event, projectPath, filePath, targetId, lineNumber) => {
      const normalizedPath = await assertProjectDirectory(projectPath);
      const target = await resolveWorkspaceTarget(targetId || "cursor");
      const resolvedFilePath = path.resolve(normalizedPath, filePath);
      if (!resolvedFilePath.startsWith(normalizedPath)) {
        throw new Error("Selected file is outside the project directory.");
      }
      const command = getOpenFileCommandForTarget(
        target,
        resolvedFilePath,
        lineNumber,
      );
      await runOpenCommand(command.command, command.args);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_OPEN_IN_TARGET,
    async (_event, projectPath, targetId) => {
      const normalizedPath = await assertProjectDirectory(projectPath);
      const target = await resolveWorkspaceTarget(targetId);
      const command = getOpenCommandForTarget(target, normalizedPath);
      await runOpenCommand(command.command, command.args);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_REVEAL_IN_FILE_MANAGER,
    async (_event, projectPath) => {
      const normalizedPath = await assertProjectDirectory(projectPath);
      await runOpenCommand("open", [normalizedPath]);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_OPEN_IN_TERMINAL,
    async (_event, projectPath, terminalTargetId) => {
      const normalizedPath = await assertProjectDirectory(projectPath);
      const target = await resolveWorkspaceTarget(
        terminalTargetId || "terminal",
      );
      if (target.kind !== "terminal") {
        throw new Error("Selected target is not a terminal.");
      }

      const command = getOpenCommandForTarget(target, normalizedPath);
      await runOpenCommand(command.command, command.args);
    },
  );

  ipcMain.handle(DESKTOP_CHANNELS.TERMINAL_CREATE, async (_event, cwd) => {
    const normalizedPath = await assertProjectDirectory(cwd);
    return createTerminalSession(normalizedPath);
  });

  ipcMain.on(DESKTOP_CHANNELS.TERMINAL_WRITE, (_event, sessionId, data) => {
    if (typeof sessionId !== "string" || typeof data !== "string") {
      return;
    }

    terminalSessions.get(sessionId)?.pty.write(data);
  });

  ipcMain.on(
    DESKTOP_CHANNELS.TERMINAL_RESIZE,
    (_event, sessionId, cols, rows) => {
      const session = terminalSessions.get(sessionId);
      const normalizedCols = Number.isFinite(cols)
        ? Math.max(2, Math.floor(cols))
        : null;
      const normalizedRows = Number.isFinite(rows)
        ? Math.max(1, Math.floor(rows))
        : null;

      if (!session || normalizedCols === null || normalizedRows === null) {
        return;
      }

      session.pty.resize(normalizedCols, normalizedRows);
    },
  );

  ipcMain.handle(DESKTOP_CHANNELS.TERMINAL_KILL, async (_event, sessionId) => {
    const session = terminalSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.pty.kill();
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_STATUS, async () => {
    const appServer = await getAppServerStatus(
      serverState?.url ??
        process.env.SENTINEL_APP_URL ??
        "http://localhost:3232",
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
        "http://localhost:3232",
    );

    return { appServer };
  });

  ipcMain.handle(DESKTOP_CHANNELS.SERVICES_STOP, async () => {
    await stopLocalServer(serverState);
    serverState = null;

    return { appServer: false };
  });

  ipcMain.handle(DESKTOP_CHANNELS.APP_VERSION, async () => app.getVersion());
  ipcMain.handle(DESKTOP_CHANNELS.OPEN_EXTERNAL, async (_event, url) => {
    const normalizedUrl =
      typeof url === "string" && url.trim() ? new URL(url).toString() : null;
    if (!normalizedUrl) {
      throw new Error("URL is required.");
    }

    await shell.openExternal(normalizedUrl);
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_CLOSE, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_MINIMIZE, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_SYNC_THEME, async (_event, theme) => {
    resolvedTheme = theme === "light" ? "light" : "dark";
  });
  ipcMain.handle(DESKTOP_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return false;
    }

    if (process.platform === "darwin") {
      const isFullscreen = win.isFullScreen();
      win.setFullScreen(!isFullscreen);
      return !isFullscreen;
    }

    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }

    win.maximize();
    return true;
  });
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("app.sentinel.desktop");
  }

  await prepareDevSession();
  createWindow();
  registerIpc();

  try {
    await bootstrapDesktop();
  } catch (error) {
    await loadFailureState(error);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin" || isQuitting) {
    killAllTerminalSessions();
    await stopLocalServer(serverState);
    serverState = null;
    app.quit();
  }
});

app.on("will-quit", async (event) => {
  killAllTerminalSessions();

  if (serverState?.process && !serverState.process.killed) {
    event.preventDefault();
    await stopLocalServer(serverState);
    serverState = null;
    await killProcessOnPort(APP_PORT);
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }

  if (!serverState || serverState.process?.killed) {
    try {
      await bootstrapDesktop();
    } catch (error) {
      await loadFailureState(error);
    }
  } else if (serverState.url) {
    await mainWindow?.loadURL(serverState.url);
  }
});
