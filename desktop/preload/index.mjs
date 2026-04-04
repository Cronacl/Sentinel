import { contextBridge, ipcRenderer } from "electron";

import { DESKTOP_CHANNELS } from "../shared/channels.mjs";

contextBridge.exposeInMainWorld("sentinelDesktop", {
  app: {
    getVersion: () => ipcRenderer.invoke(DESKTOP_CHANNELS.APP_VERSION),
    listSystemFonts: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APP_LIST_SYSTEM_FONTS),
    platform: process.platform,
  },
  clipboard: {
    writeText: (text) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.CLIPBOARD_WRITE_TEXT, text),
  },
  openExternal: (url) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.OPEN_EXTERNAL, url),
  permissions: {
    getStatus: (name) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PERMISSIONS_GET_STATUS, name),
    request: (name) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PERMISSIONS_REQUEST, name),
  },
  pickFiles: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PICK_FILES),
  pickDirectory: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PICK_DIRECTORY),
  services: {
    start: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_START),
    status: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_STATUS),
    stop: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_STOP),
  },
  updates: {
    check: () => ipcRenderer.invoke(DESKTOP_CHANNELS.UPDATES_CHECK),
    getState: () => ipcRenderer.invoke(DESKTOP_CHANNELS.UPDATES_GET_STATE),
    install: () => ipcRenderer.invoke(DESKTOP_CHANNELS.UPDATES_INSTALL),
    onStateChange: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on(DESKTOP_CHANNELS.UPDATES_STATE, handler);
      return () =>
        ipcRenderer.removeListener(DESKTOP_CHANNELS.UPDATES_STATE, handler);
    },
  },
  workspace: {
    listOpenTargets: (projectPath) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.WORKSPACE_LIST_OPEN_TARGETS,
        projectPath,
      ),
    openFileInTarget: (projectPath, filePath, targetId, lineNumber) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.WORKSPACE_OPEN_FILE_IN_TARGET,
        projectPath,
        filePath,
        targetId,
        lineNumber,
      ),
    openInTarget: (projectPath, targetId) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.WORKSPACE_OPEN_IN_TARGET,
        projectPath,
        targetId,
      ),
    openInTerminal: (projectPath, terminalTargetId) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.WORKSPACE_OPEN_IN_TERMINAL,
        projectPath,
        terminalTargetId,
      ),
    revealInFileManager: (projectPath) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.WORKSPACE_REVEAL_IN_FILE_MANAGER,
        projectPath,
      ),
  },
  terminal: {
    create: (cwd) => ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_CREATE, cwd),
    write: (sessionId, data) =>
      ipcRenderer.send(DESKTOP_CHANNELS.TERMINAL_WRITE, sessionId, data),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.send(DESKTOP_CHANNELS.TERMINAL_RESIZE, sessionId, cols, rows),
    kill: (sessionId) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_KILL, sessionId),
    onData: (callback) => {
      const handler = (_event, sessionId, data) => callback(sessionId, data);
      ipcRenderer.on(DESKTOP_CHANNELS.TERMINAL_DATA, handler);
      return () =>
        ipcRenderer.removeListener(DESKTOP_CHANNELS.TERMINAL_DATA, handler);
    },
    onExit: (callback) => {
      const handler = (_event, sessionId, exitCode) =>
        callback(sessionId, exitCode);
      ipcRenderer.on(DESKTOP_CHANNELS.TERMINAL_EXIT, handler);
      return () =>
        ipcRenderer.removeListener(DESKTOP_CHANNELS.TERMINAL_EXIT, handler);
    },
  },
  window: {
    close: () => ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_CLOSE),
    minimize: () => ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_MINIMIZE),
    syncTheme: (theme) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_SYNC_THEME, theme),
    toggleMaximize: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  },
});
