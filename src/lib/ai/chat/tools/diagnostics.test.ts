import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { executeDiagnostics } from "./diagnostics";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-diagnostics-"));
}

async function writeExecutable(executablePath: string, contents: string) {
  await mkdir(path.dirname(executablePath), { recursive: true });
  await writeFile(executablePath, contents, "utf8");
  await chmod(executablePath, 0o755);
}

describe("executeDiagnostics", () => {
  it("prefers eslint diagnostics in auto mode", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "package.json"), JSON.stringify({ name: "test" }));
    await writeFile(path.join(defaultDirectory, "src.ts"), "const value = 1;\n");
    await writeExecutable(
      path.join(defaultDirectory, "node_modules", ".bin", "eslint"),
      `#!/bin/sh
printf '%s' '[{"filePath":"${path.join(defaultDirectory, "src.ts")}","messages":[{"line":1,"column":7,"message":"Unexpected value","ruleId":"no-value","severity":2}]}]'
`,
    );

    const result = await executeDiagnostics({
      defaultDirectory,
      input: {
        mode: "auto",
        path: "src.ts",
      },
      permissionMode: "default",
    });

    expect(result.summary).toContain("eslint");
    expect(result.diagnostics[0]?.source).toBe("eslint");
    expect(result.diagnostics[0]?.file).toBe("src.ts");
  });

  it("falls back to tsc when eslint is unavailable", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "package.json"), JSON.stringify({ name: "test" }));
    await writeFile(path.join(defaultDirectory, "src.ts"), "const value: string = 1;\n");
    await writeExecutable(
      path.join(defaultDirectory, "node_modules", ".bin", "tsc"),
      `#!/bin/sh
printf '%s\\n' 'src.ts(1,7): error TS2322: Type number is not assignable to type string.'
exit 2
`,
    );

    const result = await executeDiagnostics({
      defaultDirectory,
      input: {
        mode: "auto",
      },
      permissionMode: "default",
    });

    expect(result.summary).toContain("tsc");
    expect(result.diagnostics[0]?.source).toBe("tsc");
    expect(result.diagnostics[0]?.code).toBe("TS2322");
  });

  it("returns a clear unsupported summary for lsp mode", async () => {
    const defaultDirectory = await createDirectory();
    await writeFile(path.join(defaultDirectory, "package.json"), JSON.stringify({ name: "test" }));

    const result = await executeDiagnostics({
      defaultDirectory,
      input: {
        mode: "lsp",
      },
      permissionMode: "default",
    });

    expect(result.summary).toContain("not available");
    expect(result.diagnostics).toEqual([]);
  });
});
