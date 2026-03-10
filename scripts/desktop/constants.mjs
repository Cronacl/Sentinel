import path from "node:path";

export const APP_HOST = "127.0.0.1";
export const APP_PORT = 3232;
export const APP_URL = `http://${APP_HOST}:${APP_PORT}`;

export function createRuntimePaths({
  appRoot,
  isPackaged,
  resourcesPath,
  userDataPath,
}) {
  return {
    appRoot,
    envPath: path.join(userDataPath, "desktop.env"),
    isPackaged,
    serverEntryPath: isPackaged
      ? path.join(resourcesPath, "server", "server.js")
      : null,
  };
}
