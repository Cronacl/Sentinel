import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  ArchiveError,
  crc32,
  detectArchiveKind,
  extractArchive,
  toSafeRelativePath,
} = await import("./archive");
const { buildTar, buildTarGz, buildZip } = await import("./testing");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-archive-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function extract(
  kind: "tar" | "tar.gz" | "zip",
  data: Buffer,
  limits?: { maxEntries?: number; maxTotalBytes?: number },
) {
  const archivePath = path.join(root, `archive.${kind}`);
  await writeFile(archivePath, data);
  const destination = path.join(root, "out");
  const result = await extractArchive({
    archivePath,
    destination,
    kind,
    limits,
  });
  return { destination, result };
}

async function listTree(directory: string, prefix = ""): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    names.push(entry.isDirectory() ? `${relative}/` : relative);
    if (entry.isDirectory()) {
      names.push(
        ...(await listTree(path.join(directory, entry.name), `${relative}/`)),
      );
    }
  }
  return names.sort();
}

describe("toSafeRelativePath", () => {
  it("normalizes relative member paths", () => {
    expect(toSafeRelativePath("./bin/agent")).toBe("bin/agent");
    expect(toSafeRelativePath("bin\\agent.exe")).toBe("bin/agent.exe");
    expect(toSafeRelativePath("a//b/./c")).toBe("a/b/c");
    expect(toSafeRelativePath("./")).toBe(null);
  });

  it("refuses anything that could escape", () => {
    for (const name of [
      "../evil",
      "bin/../../evil",
      "/etc/passwd",
      "C:\\Windows\\evil",
      "c:evil",
      "a\0b",
      "..\\evil",
    ]) {
      expect(() => toSafeRelativePath(name)).toThrow(ArchiveError);
    }
  });
});

describe("detectArchiveKind", () => {
  it("reads the kind from a URL or a file name", () => {
    expect(detectArchiveKind("https://x.test/agent-1.0.zip")).toBe("zip");
    expect(detectArchiveKind("https://x.test/a.tar.gz?sig=1")).toBe("tar.gz");
    expect(detectArchiveKind("agent.tgz")).toBe("tar.gz");
    expect(detectArchiveKind("agent.tar")).toBe("tar");
    expect(detectArchiveKind("https://x.test/agent")).toBe("raw");
    expect(() => detectArchiveKind("agent.tar.bz2")).toThrow(ArchiveError);
    expect(() => detectArchiveKind("agent.tar.xz")).toThrow(ArchiveError);
  });
});

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("extractArchive: tar", () => {
  it("extracts files, directories, safe links and modes", async () => {
    const { destination, result } = await extract(
      "tar.gz",
      buildTarGz([
        { name: "pkg/", type: "5" },
        { data: "#!/bin/sh\necho hi\n", mode: 0o4755, name: "pkg/bin/agent" },
        { data: "readme", mode: 0o666, name: "pkg/README.md" },
        { linkname: "bin/agent", name: "pkg/agent", type: "2" },
        { linkname: "pkg/README.md", name: "pkg/README.copy", type: "1" },
        { name: "pkg/fifo", type: "6" },
      ]),
    );

    expect(await listTree(destination)).toEqual([
      "pkg/",
      "pkg/README.copy",
      "pkg/README.md",
      "pkg/agent",
      "pkg/bin/",
      "pkg/bin/agent",
    ]);
    expect(
      (await stat(path.join(destination, "pkg/bin/agent"))).mode & 0o7777,
    ).toBe(0o755);
    expect(
      (await stat(path.join(destination, "pkg/README.md"))).mode & 0o7777,
    ).toBe(0o644);
    expect(await readlink(path.join(destination, "pkg/agent"))).toBe(
      "bin/agent",
    );
    expect(
      await readFile(path.join(destination, "pkg/README.copy"), "utf8"),
    ).toBe("readme");
    expect(result.entries).toBe(5);
  });

  it("reads GNU long names", async () => {
    const longName = `${"d".repeat(120)}/agent`;
    const { destination } = await extract(
      "tar",
      buildTar([
        { data: `${longName}\0`, name: "././@LongLink", type: "L" },
        { data: "x", name: longName.slice(0, 100) },
      ]),
    );
    expect(await readFile(path.join(destination, longName), "utf8")).toBe("x");
  });

  it("refuses traversal, absolute paths and escaping links", async () => {
    for (const entries of [
      [{ data: "x", name: "../evil" }],
      [{ data: "x", name: "/tmp/evil" }],
      [{ linkname: "/etc/passwd", name: "link", type: "2" }],
      [{ linkname: "../../outside", name: "dir/link", type: "2" }],
      [{ linkname: "../outside", name: "hard", type: "1" }],
    ]) {
      await rm(path.join(root, "out"), { force: true, recursive: true });
      await expect(extract("tar", buildTar(entries))).rejects.toThrow(
        ArchiveError,
      );
    }
    expect(await readdir(root)).not.toContain("evil");
  });

  it("does not write through a symlink planted by an earlier member", async () => {
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await expect(
      extract(
        "tar",
        buildTar([
          { linkname: ".", name: "inner", type: "2" },
          { name: "escape", linkname: "inner/..", type: "2" },
          { data: "pwned", name: "escape/outside/file" },
        ]),
      ),
    ).rejects.toThrow(ArchiveError);
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a chain of links that climbs out of the tree", async () => {
    await expect(
      extract(
        "tar",
        buildTar([
          { linkname: "x/..", name: "b", type: "2" },
          { linkname: ".", name: "x", type: "2" },
        ]),
      ),
    ).rejects.toThrow("points outside");
  });

  it("caps the expanded size and the member count", async () => {
    await expect(
      extract("tar.gz", buildTarGz([{ data: "x".repeat(4096), name: "big" }]), {
        maxTotalBytes: 1024,
      }),
    ).rejects.toThrow("size cap");
    await rm(path.join(root, "out"), { force: true, recursive: true });
    await expect(
      extract(
        "tar",
        buildTar([
          { data: "1", name: "a" },
          { data: "2", name: "b" },
        ]),
        { maxEntries: 1 },
      ),
    ).rejects.toThrow("too many members");
  });

  it("refuses duplicate members and corrupt headers", async () => {
    await expect(
      extract(
        "tar",
        buildTar([
          { data: "1", name: "a" },
          { data: "2", name: "a" },
        ]),
      ),
    ).rejects.toThrow("duplicated");

    await rm(path.join(root, "out"), { force: true, recursive: true });
    const corrupt = buildTar([{ data: "1", name: "a" }]);
    corrupt[0] = 0x41;
    await expect(extract("tar", corrupt)).rejects.toThrow("corrupt header");

    await rm(path.join(root, "out"), { force: true, recursive: true });
    const truncated = buildTar([
      { data: "x".repeat(2000), name: "a" },
    ]).subarray(0, 1024);
    await expect(extract("tar", truncated)).rejects.toThrow("truncated");
  });
});

describe("extractArchive: zip", () => {
  it("extracts stored and deflated members with their modes and links", async () => {
    const { destination } = await extract(
      "zip",
      buildZip([
        { mode: 0o040755, name: "agent/" },
        { data: "binary", mode: 0o100755, name: "agent/bin/agent" },
        { data: "notes", method: 0, mode: 0o100644, name: "agent/NOTES" },
        { data: "bin/agent", mode: 0o120777, name: "agent/run" },
      ]),
    );

    expect(await listTree(destination)).toEqual([
      "agent/",
      "agent/NOTES",
      "agent/bin/",
      "agent/bin/agent",
      "agent/run",
    ]);
    expect(
      await readFile(path.join(destination, "agent/bin/agent"), "utf8"),
    ).toBe("binary");
    expect(
      (await stat(path.join(destination, "agent/bin/agent"))).mode & 0o777,
    ).toBe(0o755);
    expect(
      (await lstat(path.join(destination, "agent/run"))).isSymbolicLink(),
    ).toBe(true);
  });

  it("refuses traversal, escaping links and failed CRCs", async () => {
    for (const entries of [
      [{ data: "x", name: "../evil" }],
      [{ data: "/etc/passwd", mode: 0o120777, name: "link" }],
      [{ crc: 1, data: "hello", name: "bad" }],
    ]) {
      await rm(path.join(root, "out"), { force: true, recursive: true });
      await expect(extract("zip", buildZip(entries))).rejects.toThrow(
        ArchiveError,
      );
    }
  });

  it("refuses data that is not a zip and caps zip bombs", async () => {
    await expect(extract("zip", Buffer.from("not a zip"))).rejects.toThrow(
      "not a zip",
    );
    await rm(path.join(root, "out"), { force: true, recursive: true });
    await expect(
      extract("zip", buildZip([{ data: "0".repeat(1 << 16), name: "bomb" }]), {
        maxTotalBytes: 1024,
      }),
    ).rejects.toThrow("size cap");
  });
});
