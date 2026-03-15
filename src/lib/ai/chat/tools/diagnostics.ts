import { access, stat } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { z } from "zod";

import { runCommand } from "@/lib/process/run-command";
import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

const MAX_DIAGNOSTIC_LIMIT = 200;

export const diagnosticsInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_DIAGNOSTIC_LIMIT).optional(),
  mode: z.enum(["auto", "lint", "lsp"]).optional(),
  path: z.string().min(1).optional(),
});

const diagnosticItemSchema = z.object({
  code: z.string().optional(),
  column: z.number().int().min(1),
  endColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  file: z.string(),
  line: z.number().int().min(1),
  message: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  source: z.string(),
});

export const diagnosticsOutputSchema = z.object({
  diagnostics: z.array(diagnosticItemSchema),
  summary: z.string(),
});

export type DiagnosticsInput = z.infer<typeof diagnosticsInputSchema>;
export type DiagnosticsOutput = z.infer<typeof diagnosticsOutputSchema>;

export type DiagnosticItem = z.infer<typeof diagnosticItemSchema>;

type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

function formatSummary(source: string, diagnostics: DiagnosticItem[]) {
  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
  const infoCount = diagnostics.filter((item) => item.severity === "info").length;

  if (diagnostics.length === 0) {
    return `${source}: no diagnostics found.`;
  }

  return `${source}: ${diagnostics.length} diagnostics (${errorCount} errors, ${warningCount} warnings, ${infoCount} info).`;
}

async function pathExists(candidatePath: string) {
  try {
    await access(candidatePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolvePackageRoot(searchDirectory: string) {
  let currentDirectory = searchDirectory;

  while (true) {
    const packageJsonPath = path.join(currentDirectory, "package.json");
    const packageStats = await stat(packageJsonPath).catch(() => null);
    if (packageStats?.isFile()) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }
    currentDirectory = parentDirectory;
  }
}

async function detectPackageManager(packageRoot: string): Promise<PackageManager> {
  const candidates: Array<[string, PackageManager]> = [
    ["bun.lock", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  for (const [filename, manager] of candidates) {
    const exists = await stat(path.join(packageRoot, filename)).catch(() => null);
    if (exists?.isFile()) {
      return manager;
    }
  }

  return "npm";
}

async function resolveBinary(packageRoot: string, binaryName: string) {
  const candidate = path.join(packageRoot, "node_modules", ".bin", binaryName);
  return (await pathExists(candidate)) ? candidate : null;
}

function withinRequestedPath(itemPath: string, requestedPath?: string) {
  if (!requestedPath) return true;
  const normalizedItem = path.resolve(itemPath);
  const normalizedRequested = path.resolve(requestedPath);
  return (
    normalizedItem === normalizedRequested ||
    normalizedItem.startsWith(`${normalizedRequested}${path.sep}`)
  );
}

function limitDiagnostics(items: DiagnosticItem[], limit: number) {
  return items.slice(0, limit);
}

async function runEslint({
  packageRoot,
  requestedPath,
}: {
  packageRoot: string;
  requestedPath?: string;
}): Promise<DiagnosticItem[] | null> {
  const eslintPath = await resolveBinary(packageRoot, "eslint");
  if (!eslintPath) {
    return null;
  }

  const target = requestedPath ? path.relative(packageRoot, requestedPath) || "." : ".";
  const result = await runCommand({
    args: [target, "--format", "json"],
    command: eslintPath,
    cwd: packageRoot,
  });

  if (result.code !== 0 && result.code !== 1) {
    return null;
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    return [];
  }

  const payload = JSON.parse(stdout) as Array<{
    filePath?: string;
    messages?: Array<{
      column?: number;
      endColumn?: number;
      endLine?: number;
      line?: number;
      message?: string;
      ruleId?: string | null;
      severity?: number;
    }>;
  }>;

  return payload.flatMap((entry) => {
    const filePath = entry.filePath;
    if (!filePath || !withinRequestedPath(filePath, requestedPath)) {
      return [];
    }

    return (entry.messages ?? []).map((message) => ({
      ...(message.ruleId ? { code: message.ruleId } : {}),
      column: Math.max(1, message.column ?? 1),
      endColumn: Math.max(1, message.endColumn ?? message.column ?? 1),
      endLine: Math.max(1, message.endLine ?? message.line ?? 1),
      file: path.relative(packageRoot, filePath),
      line: Math.max(1, message.line ?? 1),
      message: message.message ?? "Unknown ESLint diagnostic",
      severity: message.severity === 1 ? "warning" : "error",
      source: "eslint",
    }));
  });
}

const tscLinePattern =
  /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\): (?<severity>error|warning) (?<code>TS\d+): (?<message>.+)$/;

async function runTsc({
  packageRoot,
  requestedPath,
}: {
  packageRoot: string;
  requestedPath?: string;
}): Promise<DiagnosticItem[] | null> {
  const tscPath = await resolveBinary(packageRoot, "tsc");
  if (!tscPath) {
    return null;
  }

  const result = await runCommand({
    args: ["--noEmit", "--pretty", "false"],
    command: tscPath,
    cwd: packageRoot,
  });

  if (result.code !== 0 && result.code !== 2) {
    return null;
  }

  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (!combined.trim()) {
    return [];
  }

  const diagnostics: DiagnosticItem[] = [];

  for (const line of combined.split("\n")) {
    const match = tscLinePattern.exec(line.trim());
    if (!match?.groups) continue;
    const file = match.groups.file;
    const code = match.groups.code;
    const message = match.groups.message;
    const severity = match.groups.severity;
    const rawLine = match.groups.line;
    const rawColumn = match.groups.column;
    if (!file || !code || !message || !severity || !rawLine || !rawColumn) {
      continue;
    }
    const filePath = path.resolve(packageRoot, file);
    if (!withinRequestedPath(filePath, requestedPath)) continue;
    const lineNumber = Number(rawLine);
    const columnNumber = Number(rawColumn);

    diagnostics.push({
      code,
      column: columnNumber,
      endColumn: columnNumber,
      endLine: lineNumber,
      file: path.relative(packageRoot, filePath),
      line: lineNumber,
      message,
      severity: severity === "warning" ? "warning" : "error",
      source: "tsc",
    });
  }

  return diagnostics;
}

export async function executeDiagnostics({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: DiagnosticsInput;
  permissionMode: PermissionMode;
}): Promise<DiagnosticsOutput> {
  const requested = input.path
    ? resolveToolPath({
        defaultDirectory,
        permissionMode,
        requestedPath: input.path,
        toolName: "diagnostics",
      })
    : null;
  const requestedPath = requested?.resolvedPath;
  const packageRoot = await resolvePackageRoot(requestedPath ?? defaultDirectory);

  if (!packageRoot) {
    return {
      diagnostics: [],
      summary: "No package.json was found for diagnostics.",
    };
  }

  const limit = input.limit ?? 100;
  const mode = input.mode ?? "auto";

  if (mode === "lsp") {
    return {
      diagnostics: [],
      summary: "LSP diagnostics are not available in Sentinel yet.",
    };
  }

  if (mode === "lint" || mode === "auto") {
    const eslintDiagnostics = await runEslint({ packageRoot, requestedPath });
    if (eslintDiagnostics) {
      const diagnostics = limitDiagnostics(eslintDiagnostics, limit);
      return {
        diagnostics,
        summary: formatSummary("eslint", diagnostics),
      };
    }

    const tscDiagnostics = await runTsc({ packageRoot, requestedPath });
    if (tscDiagnostics) {
      const diagnostics = limitDiagnostics(tscDiagnostics, limit);
      return {
        diagnostics,
        summary: formatSummary("tsc", diagnostics),
      };
    }
  }

  return {
    diagnostics: [],
    summary: "No supported diagnostics providers were found.",
  };
}
