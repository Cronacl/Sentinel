import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;

function getLogDirectory(): string {
  const sentinelDir = process.env.SENTINEL_DB_PATH?.trim()
    ? path.dirname(process.env.SENTINEL_DB_PATH.trim())
    : path.join(os.homedir(), ".sentinel");
  return path.join(sentinelDir, "logs");
}

function getLogFilePath(): string {
  return path.join(getLogDirectory(), "sentinel.log");
}

let fileInitialized = false;

function ensureLogDirectory() {
  if (fileInitialized) return;
  try {
    const dir = getLogDirectory();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fileInitialized = true;
  } catch {
    // If we can't create the log directory, file logging is silently disabled.
  }
}

function rotateIfNeeded(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_FILE_BYTES) return;

    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const from = i === 1 ? filePath : `${filePath}.${i - 1}`;
      const to = `${filePath}.${i}`;
      try {
        if (i === MAX_ROTATED_FILES) fs.unlinkSync(to);
      } catch {}
      try {
        fs.renameSync(from, to);
      } catch {}
    }
  } catch {}
}

function writeToFile(entry: Record<string, unknown>) {
  try {
    ensureLogDirectory();
    if (!fileInitialized) return;

    const filePath = getLogFilePath();
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
  } catch {
    // Never let logging errors crash the app.
  }
}

class Logger {
  private context: Record<string, unknown>;
  private minLevel: number;

  constructor(
    context: Record<string, unknown> = {},
    minLevel?: LogLevel,
  ) {
    this.context = context;
    this.minLevel =
      LOG_LEVEL_PRIORITY[
        minLevel ??
          (process.env.NODE_ENV === "development" ? "debug" : "info")
      ];
  }

  child(context: Record<string, unknown>): Logger {
    return new Logger(
      { ...this.context, ...context },
      (Object.entries(LOG_LEVEL_PRIORITY).find(
        ([, v]) => v === this.minLevel,
      )?.[0] as LogLevel) ?? "info",
    );
  }

  debug(message: string, ...args: unknown[]) {
    this.write("debug", message, args);
  }

  info(message: string, ...args: unknown[]) {
    this.write("info", message, args);
  }

  warn(message: string, ...args: unknown[]) {
    this.write("warn", message, args);
  }

  error(message: string, ...args: unknown[]) {
    this.write("error", message, args);
  }

  private write(level: LogLevel, message: string, args: unknown[]) {
    if (LOG_LEVEL_PRIORITY[level] < this.minLevel) return;

    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      msg: message,
      ...this.context,
      ...(args.length === 1 && typeof args[0] === "object" && args[0] !== null
        ? (args[0] as Record<string, unknown>)
        : args.length > 0
          ? { data: args }
          : {}),
    };

    const consoleFn =
      level === "debug"
        ? console.debug
        : level === "info"
          ? console.info
          : level === "warn"
            ? console.warn
            : console.error;

    const tag = this.context.module
      ? `[${String(this.context.module)}]`
      : undefined;

    if (tag) {
      consoleFn(tag, message, ...args);
    } else {
      consoleFn(message, ...args);
    }

    writeToFile(entry);
  }
}

export const logger = new Logger();

export function createLogger(module: string): Logger {
  return logger.child({ module });
}

export type { Logger };
