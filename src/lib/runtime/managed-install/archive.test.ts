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
  kind: "tar" | "tar.bz2" | "tar.gz" | "zip",
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

// Windows has no POSIX permission bits (stat reports 0o666, or 0o444 when
// read-only), so modes are only checked elsewhere.
async function expectPosixMode(filePath: string, mode: number) {
  if (process.platform !== "win32") {
    expect((await stat(filePath)).mode & 0o7777).toBe(mode);
  }
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
      "bin/agent:stream",
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
    expect(detectArchiveKind("https://x.test/goose.tar.bz2")).toBe("tar.bz2");
    expect(detectArchiveKind("agent.tbz2")).toBe("tar.bz2");
    expect(() => detectArchiveKind("agent.bz2")).toThrow(ArchiveError);
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
    await expectPosixMode(path.join(destination, "pkg/bin/agent"), 0o755);
    await expectPosixMode(path.join(destination, "pkg/README.md"), 0o644);
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

  it("never creates a link's directories through an earlier link", async () => {
    // Each target is inside the tree on paper; `esc` really points at the
    // tree's parent, and a recursive mkdir for `esc/escaped/l` would have
    // created `escaped` there before any check ran.
    await expect(
      extract(
        "tar",
        buildTar([
          { linkname: "../../..", name: "a/b/c/up", type: "2" },
          { linkname: "a/b/c/up/..", name: "esc", type: "2" },
          { linkname: "x", name: "esc/escaped/l", type: "2" },
        ]),
      ),
    ).rejects.toThrow("inside another link");
    expect(await readdir(root)).not.toContain("escaped");
  });

  // Windows resolves `..` in a link target against the link's path text, not
  // through `x`, so there this chain stays inside the tree (the lexical check
  // already covers it).
  it.skipIf(process.platform === "win32")(
    "refuses a chain of links that climbs out of the tree",
    async () => {
      await expect(
        extract(
          "tar",
          buildTar([
            { linkname: "x/..", name: "b", type: "2" },
            { linkname: ".", name: "x", type: "2" },
          ]),
        ),
      ).rejects.toThrow("points outside");
    },
  );

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

// `bzip2 -1` of buildTar([pkg/, pkg/bin/agent (0755), pkg/data.bin]):
// two blocks, with long runs (RLE1 and RUNA/RUNB) in data.bin.
const TAR_BZ2_FIXTURE = Buffer.from(
  [
    "QlpoMTFBWSZTWVJbsUsADk5/////////////////////////////////////////////4A",
    "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",
    "rbrGVWMDh8KlgcP/4u5IpwoSCkt2KWA=",
  ].join(""),
  "base64",
);

function tarBz2FixtureData() {
  const data = Buffer.alloc(150_000);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = index % 1000 === 0 ? 0x41 : (index >> 6) & 0xff;
  }
  return data;
}

describe("extractArchive: tar.bz2", () => {
  it("decodes a multi-block bzip2 tar in process", async () => {
    const { destination } = await extract("tar.bz2", TAR_BZ2_FIXTURE);

    expect(await listTree(destination)).toEqual([
      "pkg/",
      "pkg/bin/",
      "pkg/bin/agent",
      "pkg/data.bin",
    ]);
    await expectPosixMode(path.join(destination, "pkg/bin/agent"), 0o755);
    expect(
      (await readFile(path.join(destination, "pkg/data.bin"))).equals(
        tarBz2FixtureData(),
      ),
    ).toBe(true);
  });

  it("refuses corrupt bzip2 data and output past the size limit", async () => {
    const corrupt = Buffer.from(TAR_BZ2_FIXTURE);
    // The first block's stored CRC (after "BZh1" and the block magic).
    corrupt[10]! ^= 0x01;
    await expect(extract("tar.bz2", corrupt)).rejects.toThrow(ArchiveError);
    await rm(path.join(root, "out"), { force: true, recursive: true });

    await expect(
      extract("tar.bz2", TAR_BZ2_FIXTURE, { maxEntries: 4, maxTotalBytes: 1 }),
    ).rejects.toThrow(ArchiveError);
    await rm(path.join(root, "out"), { force: true, recursive: true });

    await expect(
      extract("tar.bz2", Buffer.from("not bzip2 at all")),
    ).rejects.toThrow(ArchiveError);
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
    await expectPosixMode(path.join(destination, "agent/bin/agent"), 0o755);
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
