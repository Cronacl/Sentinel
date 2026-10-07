import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getCopilotRuntimePlatform,
  resolveBundledCopilotRuntime,
} from "./copilot-sdk/bundled-runtime";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { force: true, recursive: true })),
  );
});

async function writeRuntimePackage(
  rootPath: string,
  runtimePlatform: string,
  files: { runtimeNode?: string; wrapper?: string } = {},
) {
  const packageRoot = path.join(
    rootPath,
    "node_modules",
    "@github",
    `copilot-sdk-${runtimePlatform}`,
  );
  const prebuildRoot = path.join(packageRoot, "prebuilds", runtimePlatform);
  const wrapperPath = path.join(
    prebuildRoot,
    runtimePlatform.startsWith("win32")
      ? "copilot-runtime.exe"
      : "copilot-runtime",
  );
  await mkdir(prebuildRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: `@github/copilot-sdk-${runtimePlatform}` }),
  );
  await writeFile(wrapperPath, files.wrapper ?? "#!/bin/sh\nexit 0\n");
  await writeFile(
    path.join(prebuildRoot, "runtime.node"),
    files.runtimeNode ?? "native",
  );

  return { packageRoot, wrapperPath };
}

async function makeTempRoot() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "copilot-runtime-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

describe("getCopilotRuntimePlatform", () => {
  it("names runtime platforms like the SDK", () => {
    expect(getCopilotRuntimePlatform("darwin", "arm64", false)).toBe(
      "darwin-arm64",
    );
    expect(getCopilotRuntimePlatform("win32", "x64", false)).toBe("win32-x64");
    expect(getCopilotRuntimePlatform("linux", "x64", false)).toBe("linux-x64");
    expect(getCopilotRuntimePlatform("linux", "arm64", true)).toBe(
      "linuxmusl-arm64",
    );
    expect(getCopilotRuntimePlatform("darwin", "ia32", false)).toBeNull();
    expect(getCopilotRuntimePlatform("freebsd", "x64", false)).toBeNull();
  });
});

describe("resolveBundledCopilotRuntime", () => {
  it("returns the first search root with a complete runtime", async () => {
    const emptyRoot = await makeTempRoot();
    const incompleteRoot = await makeTempRoot();
    const completeRoot = await makeTempRoot();
    await writeRuntimePackage(incompleteRoot, "linux-x64", {
      runtimeNode: "",
    });
    const { packageRoot, wrapperPath } = await writeRuntimePackage(
      completeRoot,
      "linux-x64",
    );

    const runtime = await resolveBundledCopilotRuntime({
      arch: "x64",
      musl: false,
      platform: "linux",
      searchRoots: [emptyRoot, incompleteRoot, completeRoot],
    });

    expect(runtime).toEqual({
      cliPath: wrapperPath,
      packageName: "@github/copilot-sdk-linux-x64",
      packageRoot,
      runtimeNodePath: path.join(
        packageRoot,
        "prebuilds",
        "linux-x64",
        "runtime.node",
      ),
      runtimePlatform: "linux-x64",
    });
  });

  it("ignores runtimes for other platforms and missing wrappers", async () => {
    const rootPath = await makeTempRoot();
    await writeRuntimePackage(rootPath, "linux-arm64");
    await writeRuntimePackage(rootPath, "win32-x64", { wrapper: "" });

    expect(
      await resolveBundledCopilotRuntime({
        arch: "x64",
        musl: false,
        platform: "linux",
        searchRoots: [rootPath],
      }),
    ).toBeNull();
    expect(
      await resolveBundledCopilotRuntime({
        arch: "x64",
        platform: "win32",
        searchRoots: [rootPath],
      }),
    ).toBeNull();
  });

  it("falls back to the other Linux libc build, preferring the detected one in every root", async () => {
    const glibcRoot = await makeTempRoot();
    const muslRoot = await makeTempRoot();
    const { wrapperPath: glibcWrapperPath } = await writeRuntimePackage(
      glibcRoot,
      "linux-x64",
    );

    // A musl misdetection still finds the glibc runtime packaged builds ship.
    expect(
      (
        await resolveBundledCopilotRuntime({
          arch: "x64",
          musl: true,
          platform: "linux",
          searchRoots: [glibcRoot, muslRoot],
        })
      )?.cliPath,
    ).toBe(glibcWrapperPath);

    const { wrapperPath: muslWrapperPath } = await writeRuntimePackage(
      muslRoot,
      "linuxmusl-x64",
    );
    expect(
      await resolveBundledCopilotRuntime({
        arch: "x64",
        musl: true,
        platform: "linux",
        searchRoots: [glibcRoot, muslRoot],
      }),
    ).toMatchObject({
      cliPath: muslWrapperPath,
      packageName: "@github/copilot-sdk-linuxmusl-x64",
      runtimePlatform: "linuxmusl-x64",
    });
    expect(
      (
        await resolveBundledCopilotRuntime({
          arch: "x64",
          musl: false,
          platform: "linux",
          searchRoots: [muslRoot, glibcRoot],
        })
      )?.cliPath,
    ).toBe(glibcWrapperPath);
  });

  it("restores the wrapper's execute bit like the SDK", async () => {
    if (process.platform === "win32") {
      return;
    }

    const rootPath = await makeTempRoot();
    const { wrapperPath } = await writeRuntimePackage(rootPath, "darwin-arm64");
    await chmod(wrapperPath, 0o644);

    const runtime = await resolveBundledCopilotRuntime({
      arch: "arm64",
      platform: "darwin",
      searchRoots: [rootPath],
    });

    expect(runtime?.cliPath).toBe(wrapperPath);
    expect((await stat(wrapperPath)).mode & 0o111).not.toBe(0);
  });

  it("finds the platform runtime installed with @github/copilot-sdk", async () => {
    if (!getCopilotRuntimePlatform()) {
      return;
    }

    const runtime = await resolveBundledCopilotRuntime({
      searchRoots: [process.cwd()],
    });

    expect(runtime?.packageName).toBe(
      `@github/copilot-sdk-${getCopilotRuntimePlatform()}`,
    );
    expect((await stat(runtime!.runtimeNodePath)).size).toBeGreaterThan(0);
  });
});
