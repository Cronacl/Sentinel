import os from "node:os";
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
  const stableStateRoot = path.join(os.homedir(), ".sentinel");
  const stableEnvPath = path.join(stableStateRoot, "desktop.env");
  const legacyEnvPath = path.join(userDataPath, "desktop.env");

  return {
    appRoot,
    envPath: stableEnvPath,
    isPackaged,
    legacyEnvPaths:
      stableEnvPath === legacyEnvPath ? [] : [legacyEnvPath],
    serverEntryPath: isPackaged
      ? path.join(resourcesPath, "server", "server.js")
      : null,
  };
}
