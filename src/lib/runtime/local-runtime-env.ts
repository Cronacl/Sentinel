import "server-only";

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_RUNTIME_ENV_FILE_MODE = 0o600;

function getLocalStateDirectory() {
  return path.join(process.env.HOME?.trim() || os.homedir(), ".sentinel");
}

function getLocalRuntimeEnvPath() {
  return path.join(getLocalStateDirectory(), "desktop.env");
}

function readDotEnvLineKey(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  return trimmed.slice(0, separatorIndex).trim();
}

function formatDotEnvValue(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function upsertDotEnvValue(content: string, key: string, value: string) {
  const assignment = `${key}=${formatDotEnvValue(value)}`;
  const linePattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");

  if (linePattern.test(content)) {
    return content.replace(linePattern, assignment);
  }

  const suffix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${assignment}\n`;
}

function removeDotEnvValue(content: string, key: string) {
  const lines = content
    .split("\n")
    .filter((line) => readDotEnvLineKey(line) !== key);

  if (lines.length === 0) {
    return "";
  }

  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}

async function readLocalRuntimeEnvFile() {
  try {
    return await readFile(getLocalRuntimeEnvPath(), "utf8");
  } catch {
    return "";
  }
}

async function writeLocalRuntimeEnvFile(content: string) {
  const localStateDirectory = getLocalStateDirectory();
  const localRuntimeEnvPath = getLocalRuntimeEnvPath();

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(localRuntimeEnvPath, content, {
    encoding: "utf8",
    mode: LOCAL_RUNTIME_ENV_FILE_MODE,
  });
  await chmod(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await chmod(localRuntimeEnvPath, LOCAL_RUNTIME_ENV_FILE_MODE);
}

export async function setLocalRuntimeEnvValue(
  key: string,
  value: string | null | undefined,
) {
  const normalizedValue = value?.trim() ?? "";
  const currentContent = await readLocalRuntimeEnvFile();
  const nextContent = normalizedValue
    ? upsertDotEnvValue(currentContent, key, normalizedValue)
    : removeDotEnvValue(currentContent, key);

  if (nextContent !== currentContent) {
    await writeLocalRuntimeEnvFile(nextContent);
  }

  if (normalizedValue) {
    process.env[key] = normalizedValue;
    return;
  }

  delete process.env[key];
}
