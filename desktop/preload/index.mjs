import { contextBridge, ipcRenderer } from "electron";

import { DESKTOP_CHANNELS } from "../shared/channels.mjs";

contextBridge.exposeInMainWorld("sentinelDesktop", {
  app: {
    getVersion: () => ipcRenderer.invoke(DESKTOP_CHANNELS.APP_VERSION),
  },
  pickDirectory: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PICK_DIRECTORY),
  services: {
    start: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_START),
    status: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_STATUS),
    stop: () => ipcRenderer.invoke(DESKTOP_CHANNELS.SERVICES_STOP),
  },
  window: {
    close: () => ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_CLOSE),
    minimize: () => ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_MINIMIZE),
    toggleMaximize: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  },
});
