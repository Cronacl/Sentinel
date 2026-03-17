import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { createLogger } from "@/lib/logger";

const MAX_BACKUPS = 10;

function getDbPath(): string {
  if (process.env.SENTINEL_DB_PATH?.trim()) {
    return process.env.SENTINEL_DB_PATH.trim();
  }

  return path.join(os.homedir(), ".sentinel", "sentinel.db");
}

function getBackupDir(): string {
  const dbPath = getDbPath();
  return path.join(path.dirname(dbPath), "backups");
}

function ensureBackupDir(): string {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

export interface BackupInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export async function createBackup(
  label?: string,
): Promise<BackupInfo> {
  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    throw new Error("Database file not found");
  }

  const backupDir = ensureBackupDir();
  const timestamp = formatTimestamp(new Date());
  const suffix = label ? `_${label}` : "";
  const filename = `sentinel_${timestamp}${suffix}.db`;
  const backupPath = path.join(backupDir, filename);

  const source = new Database(dbPath, { readonly: true });
  try {
    await source.backup(backupPath);
  } finally {
    source.close();
  }

  const stat = fs.statSync(backupPath);
  return {
    filename,
    path: backupPath,
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
  };
}

export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db"));

  return files
    .map((filename) => {
      const filePath = path.join(backupDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        path: filePath,
        sizeBytes: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function deleteBackup(filename: string): void {
  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, filename);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(backupDir))) {
    throw new Error("Invalid backup filename");
  }

  if (!fs.existsSync(resolved)) {
    throw new Error("Backup not found");
  }

  fs.unlinkSync(resolved);
}

export function pruneOldBackups(keep = MAX_BACKUPS): number {
  const backups = listBackups();
  if (backups.length <= keep) return 0;

  const toRemove = backups.slice(keep);
  for (const backup of toRemove) {
    try {
      fs.unlinkSync(backup.path);
    } catch {
      // best-effort cleanup
    }
  }

  return toRemove.length;
}

export async function createStartupBackup(): Promise<BackupInfo | null> {
  try {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return null;

    const stat = fs.statSync(dbPath);
    if (stat.size === 0) return null;

    const backups = listBackups();
    if (backups.length > 0) {
      const latest = new Date(backups[0]!.createdAt);
      const hoursSinceLastBackup =
        (Date.now() - latest.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastBackup < 12) return null;
    }

    const backup = await createBackup("auto");
    pruneOldBackups();
    return backup;
  } catch (error) {
    createLogger("Backup").error(
      `Startup backup failed: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

export function getExportDbPath(): string {
  return getDbPath();
}

export function getVectorDbExportPath(): string {
  const mainPath = getDbPath();
  return path.join(path.dirname(mainPath), "vectors.db");
}
