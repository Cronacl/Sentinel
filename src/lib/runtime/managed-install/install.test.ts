import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { downloadFile, DownloadError } = await import("./download");
const {
  getManagedToolDirectory,
  installManagedTool,
  ManagedInstallError,
  readActiveManagedTool,
  removeManagedTool,
} = await import("./install");
const { buildTarGz, buildZip } = await import("./testing");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-managed-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function serve(data: Buffer, init: ResponseInit & { url?: string } = {}) {
  return mock(async (url: string) => {
    const chunks = [
      data.subarray(0, Math.ceil(data.length / 2)),
      data.subarray(Math.ceil(data.length / 2)),
    ];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      { status: 200, ...init },
    );
    Object.defineProperty(response, "url", { value: init.url ?? url });
    return response;
  });
}

describe("downloadFile", () => {
  it("streams to disk while hashing and reports progress", async () => {
    const data = Buffer.from("x".repeat(10_000));
    const progress: number[] = [];
    let time = 0;
    const destination = path.join(root, "file.bin");

    const result = await downloadFile({
      destination,
      fetch: serve(data, {
        headers: { "content-length": String(data.length) },
      }),
      maxBytes: 1_000_000,
      now: () => (time += 1_000),
      onProgress: (value) => progress.push(value.downloadedBytes),
      sha256: sha256(data),
      url: "https://downloads.example.test/file.bin",
    });

    expect(result).toEqual({
      bytes: 10_000,
      sha256: sha256(data),
      verified: true,
    });
    expect(await readFile(destination)).toEqual(data);
    expect(progress.at(0)).toBe(0);
    expect(progress.at(-1)).toBe(10_000);
  });

  it("refuses plain HTTP, including after a redirect", async () => {
    await expect(
      downloadFile({
        destination: path.join(root, "a"),
        fetch: serve(Buffer.from("x")),
        maxBytes: 10,
        url: "http://downloads.example.test/a",
      }),
    ).rejects.toThrow("HTTPS");
    await expect(
      downloadFile({
        destination: path.join(root, "b"),
        fetch: serve(Buffer.from("x"), { url: "http://mirror.example.test/b" }),
        maxBytes: 10,
        url: "https://downloads.example.test/b",
      }),
    ).rejects.toThrow("HTTPS");
  });

  it("leaves nothing behind on a checksum, size or cap failure", async () => {
    const data = Buffer.from("payload");
    const cases = [
      { options: { sha256: "0".repeat(64) }, code: "checksum_mismatch" },
      { options: { expectedBytes: 3 }, code: "size_mismatch" },
      { options: { expectedBytes: 100 }, code: "size_mismatch" },
      { options: { maxBytes: 4 }, code: "too_large" },
    ];
    for (const [index, entry] of cases.entries()) {
      const destination = path.join(root, `case-${index}`);
      const error = await downloadFile({
        destination,
        fetch: serve(data),
        maxBytes: 1_000,
        url: "https://downloads.example.test/x",
        ...entry.options,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DownloadError);
      expect((error as InstanceType<typeof DownloadError>).code).toBe(
        entry.code,
      );
    }
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses an oversized download from its content-length", async () => {
    await expect(
      downloadFile({
        destination: path.join(root, "big"),
        fetch: serve(Buffer.from("x"), {
          headers: { "content-length": "999999" },
        }),
        maxBytes: 10,
        url: "https://downloads.example.test/big",
      }),
    ).rejects.toThrow("larger than allowed");
  });

  it("fails on HTTP errors", async () => {
    await expect(
      downloadFile({
        destination: path.join(root, "missing"),
        fetch: serve(Buffer.from("nope"), { status: 404 }),
        maxBytes: 10,
        url: "https://downloads.example.test/missing",
      }),
    ).rejects.toThrow("404");
  });
});

describe("installManagedTool", () => {
  const archive = buildTarGz([
    { name: "agent/", type: "5" },
    { data: "#!/bin/sh\necho agent\n", mode: 0o755, name: "agent/bin/agent" },
  ]);

  it("installs, verifies, writes a receipt and activates the version", async () => {
    const phases: string[] = [];
    const result = await installManagedTool({
      executable: "agent/bin/agent",
      fetch: serve(archive),
      onProgress: (progress) => phases.push(progress.phase),
      source: {
        sha256: sha256(archive),
        url: "https://downloads.example.test/agent-1.2.3.tar.gz",
      },
      stateRoot: root,
      tool: "acp/demo-agent",
      version: "1.2.3",
    });

    const toolDir = getManagedToolDirectory("acp/demo-agent", root);
    expect(toolDir).toBe(path.join(root, "tools", "acp", "demo-agent"));
    expect(result.installDir).toBe(path.join(toolDir, "1.2.3"));
    expect(result.executablePath).toBe(
      path.join(toolDir, "1.2.3", "agent", "bin", "agent"),
    );
    expect((await stat(result.executablePath)).mode & 0o111).not.toBe(0);
    expect(result.receipt).toEqual(
      expect.objectContaining({
        archive: "tar.gz",
        executable: "agent/bin/agent",
        source: expect.objectContaining({
          sha256: sha256(archive),
          verified: true,
        }),
        tool: "acp/demo-agent",
        version: "1.2.3",
      }),
    );
    expect(phases[0]).toBe("downloading");
    expect(phases).toContain("verifying");
    expect(phases).toContain("extracting");
    expect(phases.at(-1)).toBe("succeeded");

    expect(await readActiveManagedTool("acp/demo-agent", root)).toEqual(
      expect.objectContaining({ executablePath: result.executablePath }),
    );
    // Nothing is left in staging.
    expect((await readdir(toolDir)).sort()).toEqual(["1.2.3", "active.json"]);

    await removeManagedTool("acp/demo-agent", "1.2.3", root);
    expect(await readActiveManagedTool("acp/demo-agent", root)).toBe(null);
  });

  it("installs a raw binary and marks a download without a pinned hash unverified", async () => {
    const binary = Buffer.from("MZ binary");
    const result = await installManagedTool({
      executable: "agy_acp_server",
      fetch: serve(binary),
      source: { url: "https://downloads.example.test/agy_acp_server" },
      stateRoot: root,
      tool: "antigravity-acp",
      version: "1.3.0",
    });
    expect(await readFile(result.executablePath)).toEqual(binary);
    expect(result.receipt.source.verified).toBe(false);
    expect(result.receipt.archive).toBe("raw");
  });

  it("keeps the previous install when a new one fails", async () => {
    await installManagedTool({
      executable: "agent/bin/agent",
      fetch: serve(archive),
      source: { url: "https://downloads.example.test/agent.tar.gz" },
      stateRoot: root,
      tool: "demo",
      version: "1.0.0",
    });

    const phases: string[] = [];
    const evil = buildZip([{ data: "x", name: "../../evil" }]);
    const error = await installManagedTool({
      executable: "agent/bin/agent",
      fetch: serve(evil),
      onProgress: (progress) => phases.push(progress.phase),
      source: { url: "https://downloads.example.test/agent-2.zip" },
      stateRoot: root,
      tool: "demo",
      version: "2.0.0",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ManagedInstallError);
    expect((error as InstanceType<typeof ManagedInstallError>).code).toBe(
      "archive_invalid",
    );
    expect(phases.at(-1)).toBe("failed");
    expect((await readActiveManagedTool("demo", root))?.receipt.version).toBe(
      "1.0.0",
    );
    expect(
      (await readdir(getManagedToolDirectory("demo", root))).sort(),
    ).toEqual(["1.0.0", "active.json"]);
    expect(await readdir(root)).toEqual(["tools"]);
  });

  it("fails when the archive lacks the executable and on a checksum mismatch", async () => {
    await expect(
      installManagedTool({
        executable: "agent/bin/missing",
        fetch: serve(archive),
        source: { url: "https://downloads.example.test/agent.tar.gz" },
        stateRoot: root,
        tool: "demo",
        version: "1.0.0",
      }),
    ).rejects.toThrow('does not contain "agent/bin/missing"');
    await expect(
      installManagedTool({
        executable: "agent/bin/agent",
        fetch: serve(archive),
        source: {
          sha256: "f".repeat(64),
          url: "https://downloads.example.test/agent.tar.gz",
        },
        stateRoot: root,
        tool: "demo",
        version: "1.0.0",
      }),
    ).rejects.toThrow("SHA-256");
  });

  it("reports a cancelled install and installs nothing", async () => {
    const controller = new AbortController();
    const phases: string[] = [];
    const fetch = mock(async (_url: string, init: RequestInit) => {
      controller.abort();
      init.signal?.throwIfAborted();
      return new Response("x");
    });
    await expect(
      installManagedTool({
        executable: "agent",
        fetch,
        onProgress: (progress) => phases.push(progress.phase),
        signal: controller.signal,
        source: { url: "https://downloads.example.test/agent" },
        stateRoot: root,
        tool: "demo",
        version: "1.0.0",
      }),
    ).rejects.toBeDefined();
    expect(phases.at(-1)).toBe("cancelled");
    expect(await readActiveManagedTool("demo", root)).toBe(null);
  });

  it("validates tool ids and versions", async () => {
    expect(() => getManagedToolDirectory("../escape", root)).toThrow(
      ManagedInstallError,
    );
    expect(() => getManagedToolDirectory("acp/../x", root)).toThrow(
      ManagedInstallError,
    );
    await expect(
      installManagedTool({
        executable: "agent",
        fetch: serve(archive),
        source: { url: "https://downloads.example.test/agent" },
        stateRoot: root,
        tool: "demo",
        version: "../1",
      }),
    ).rejects.toThrow("Invalid version");
  });
});
