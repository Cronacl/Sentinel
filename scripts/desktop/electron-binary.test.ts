import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureElectronBinary,
  getElectronExecutablePath,
  isElectronBinaryInstalled,
} from "./electron-binary.mjs";

const temporaryRoots: string[] = [];
const silentLogger = { log: () => {} };

function createProject(version: string, installScript?: string) {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "sentinel-electron-"));
  temporaryRoots.push(projectRoot);
  const packageRoot = path.join(projectRoot, "node_modules", "electron");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "electron", version }),
  );

  if (installScript) {
    writeFileSync(path.join(packageRoot, "install.js"), installScript);
  }

  return projectRoot;
}

function writeDist(projectRoot: string, version: string) {
  const executablePath = getElectronExecutablePath(projectRoot);
  mkdirSync(path.dirname(executablePath), { recursive: true });
  writeFileSync(executablePath, "");
  writeFileSync(
    path.join(projectRoot, "node_modules", "electron", "dist", "version"),
    version,
  );
}

function getFakeInstallScript(projectRoot: string, version: string) {
  const relativeExecutablePath = path.relative(
    path.join(projectRoot, "node_modules", "electron"),
    getElectronExecutablePath(projectRoot),
  );

  return `
const fs = require("node:fs");
const path = require("node:path");
const executablePath = path.join(__dirname, ${JSON.stringify(relativeExecutablePath)});
fs.mkdirSync(path.dirname(executablePath), { recursive: true });
fs.writeFileSync(executablePath, "");
fs.writeFileSync(path.join(__dirname, "dist", "version"), ${JSON.stringify(version)});
`;
}

afterEach(() => {
  for (const projectRoot of temporaryRoots.splice(0)) {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});

describe("isElectronBinaryInstalled", () => {
  it("requires a dist binary that matches the installed electron package", () => {
    const projectRoot = createProject("44.6.0");
    expect(isElectronBinaryInstalled(projectRoot)).toBe(false);

    writeDist(projectRoot, "40.8.0");
    expect(isElectronBinaryInstalled(projectRoot)).toBe(false);

    writeDist(projectRoot, "v44.6.0");
    expect(isElectronBinaryInstalled(projectRoot)).toBe(true);
  });
});

describe("ensureElectronBinary", () => {
  it("returns the installed binary without running install-electron", () => {
    const projectRoot = createProject(
      "44.6.0",
      "process.exit(1);", // would fail if it ran
    );
    writeDist(projectRoot, "44.6.0");

    expect(ensureElectronBinary({ logger: silentLogger, projectRoot })).toBe(
      getElectronExecutablePath(projectRoot),
    );
  });

  it("runs install-electron when the binary is missing", () => {
    const projectRoot = createProject("44.6.0");
    writeFileSync(
      path.join(projectRoot, "node_modules", "electron", "install.js"),
      getFakeInstallScript(projectRoot, "44.6.0"),
    );

    expect(ensureElectronBinary({ logger: silentLogger, projectRoot })).toBe(
      getElectronExecutablePath(projectRoot),
    );
    expect(isElectronBinaryInstalled(projectRoot)).toBe(true);
  });

  it("fails with a recovery hint when install-electron fails", () => {
    const projectRoot = createProject("44.6.0", "process.exit(1);");

    expect(() =>
      ensureElectronBinary({ logger: silentLogger, projectRoot }),
    ).toThrow("bun run electron:install");
  });
});
