import path from "node:path";

export const APP_HOST = "127.0.0.1";
export const APP_PORT = 3232;
export const APP_URL = `http://${APP_HOST}:${APP_PORT}`;
export const POSTGRES_PORT = 55432;
export const REDIS_PORT = 56379;
export const QDRANT_PORT = 56333;

export function createRuntimePaths({
  appRoot,
  isPackaged,
  resourcesPath,
  userDataPath,
}) {
  return {
    appRoot,
    composePath: isPackaged
      ? path.join(resourcesPath, "docker", "compose.yml")
      : path.join(appRoot, "docker", "compose.yml"),
    envPath: path.join(userDataPath, "desktop.env"),
    isPackaged,
    schemaPath: isPackaged
      ? path.join(resourcesPath, "server", "prisma", "schema.prisma")
      : path.join(appRoot, "prisma", "schema.prisma"),
    serverEntryPath: isPackaged
      ? path.join(resourcesPath, "server", "server.js")
      : null,
  };
}
