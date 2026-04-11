import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { copyPackageWithDependencies } = require("./after-pack.cjs") as {
  copyPackageWithDependencies: (
    projectDir: string,
    targetNodeModulesPath: string,
    packageName: string,
  ) => Promise<void>;
};

const tempRoots: string[] = [];

async function writePackage(
  rootPath: string,
  packageName: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string> = { "index.js": "export {};\n" },
) {
  const packageRoot = path.join(
    rootPath,
    "node_modules",
    ...packageName.split("/"),
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(packageRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((rootPath) => rm(rootPath, { force: true, recursive: true })),
  );
});

describe("copyPackageWithDependencies", () => {
  it("copies the Copilot SDK without bundling the large Copilot CLI packages", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "after-pack-test-"));
    tempRoots.push(tempRoot);
    const projectDir = path.join(tempRoot, "project");
    const targetNodeModulesPath = path.join(tempRoot, "target", "node_modules");

    await writePackage(projectDir, "@github/copilot-sdk", {
      dependencies: {
        "@github/copilot": "1.0.24",
        zod: "4.3.6",
      },
      name: "@github/copilot-sdk",
      version: "0.2.2",
    });
    await writePackage(
      projectDir,
      "@github/copilot",
      {
        name: "@github/copilot",
        optionalDependencies: {
          "@github/copilot-darwin-arm64": "1.0.24",
          "@github/copilot-linux-x64": "1.0.24",
        },
        version: "1.0.24",
      },
      { "index.js": "console.log('copilot');\n" },
    );
    await writePackage(
      projectDir,
      "@github/copilot-darwin-arm64",
      { name: "@github/copilot-darwin-arm64", version: "1.0.24" },
      { copilot: "#!/bin/sh\n" },
    );
    await writePackage(
      projectDir,
      "@github/copilot-linux-x64",
      { name: "@github/copilot-linux-x64", version: "1.0.24" },
      { copilot: "#!/bin/sh\n" },
    );
    await writePackage(projectDir, "zod", {
      name: "zod",
      version: "4.3.6",
    });

    await copyPackageWithDependencies(
      projectDir,
      targetNodeModulesPath,
      "@github/copilot-sdk",
    );

    expect(
      await readFile(
        path.join(
          targetNodeModulesPath,
          "@github",
          "copilot-sdk",
          "package.json",
        ),
        "utf8",
      ),
    ).toContain("@github/copilot-sdk");
    expect(
      await readFile(
        path.join(targetNodeModulesPath, "zod", "index.js"),
        "utf8",
      ),
    ).toContain("export");

    await expect(
      readFile(
        path.join(targetNodeModulesPath, "@github", "copilot", "index.js"),
        "utf8",
      ),
    ).rejects.toThrow();
  });
});
