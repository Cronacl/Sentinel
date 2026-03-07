import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readTextFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeTextFile(filePath, content) {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, content, "utf8");
}
