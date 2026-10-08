import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  realpath as nodeRealpath,
  rename as nodeRename,
  rm as nodeRm,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { RequestError } from "@agentclientprotocol/sdk";

import { readNonEmptyString, readNumber, readString } from "./schema";

// fs/read_text_file and fs/write_text_file for agents that ask the client to
// touch files (design §2.13). Paths must be absolute and inside the allowed
// roots (the thread's workspace, extra directories), symlinks resolved, so an
// agent cannot read or write outside the workspace. Writes are authorized by
// the run (`authorizeWrite`: permission mode, an approved edit, or a fresh
// approval) and land atomically (temp file, then rename).

export type ClientFsDeps = {
  mkdir?: typeof nodeMkdir;
  readFile?: typeof nodeReadFile;
  realpath?: (target: string) => Promise<string>;
  rename?: typeof nodeRename;
  rm?: typeof nodeRm;
  writeFile?: typeof nodeWriteFile;
};

export type ClientFsPolicy = ClientFsDeps & {
  /** Asked before every write; false rejects it. */
  authorizeWrite(input: {
    content: string;
    path: string;
    previous: string | null;
  }): Promise<boolean>;
  /** Absolute directories the agent may use. */
  roots: readonly string[];
};

function isInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/** realpath of the deepest existing ancestor, plus the missing tail. */
async function resolveReal(
  target: string,
  realpath: (target: string) => Promise<string>,
): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const real = await realpath(current);
      return path.join(real, ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return target;
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/** The checked absolute path, or an invalidParams error for anything outside the roots. */
export async function resolveAllowedPath(
  rawPath: unknown,
  policy: Pick<ClientFsPolicy, "realpath" | "roots">,
) {
  if (typeof rawPath !== "string" || !path.isAbsolute(rawPath)) {
    throw RequestError.invalidParams({ message: "path must be absolute" });
  }
  const realpath = policy.realpath ?? nodeRealpath;
  const target = await resolveReal(path.resolve(rawPath), realpath);
  for (const root of policy.roots) {
    const realRoot = await resolveReal(path.resolve(root), realpath);
    if (isInside(realRoot, target)) {
      return target;
    }
  }
  throw RequestError.invalidParams({
    message: `${rawPath} is outside the workspace`,
  });
}

function sliceLines(
  content: string,
  line: number | null,
  limit: number | null,
) {
  if (line == null && limit == null) {
    return content;
  }
  const lines = content.split("\n");
  const start = Math.max(0, (line ?? 1) - 1);
  const end = limit != null ? start + Math.max(0, limit) : lines.length;
  return lines.slice(start, end).join("\n");
}

export async function readClientTextFile(
  params: unknown,
  policy: ClientFsPolicy,
) {
  const target = await resolveAllowedPath(readString(params, "path"), policy);
  let content: string;
  try {
    content = await (policy.readFile ?? nodeReadFile)(target, "utf8");
  } catch {
    throw RequestError.resourceNotFound(target);
  }
  return {
    content: sliceLines(
      content,
      readNumber(params, "line"),
      readNumber(params, "limit"),
    ),
  };
}

export async function writeClientTextFile(
  params: unknown,
  policy: ClientFsPolicy,
) {
  const target = await resolveAllowedPath(readString(params, "path"), policy);
  const content = readString(params, "content");
  if (content == null) {
    throw RequestError.invalidParams({ message: "content is required" });
  }
  const previous = await (policy.readFile ?? nodeReadFile)(
    target,
    "utf8",
  ).catch(() => null);
  if (!(await policy.authorizeWrite({ content, path: target, previous }))) {
    throw new RequestError(-32603, `Writing ${target} was not allowed.`);
  }

  const directory = path.dirname(target);
  await (policy.mkdir ?? nodeMkdir)(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.sentinel-${randomUUID()}.tmp`,
  );
  try {
    await (policy.writeFile ?? nodeWriteFile)(temporary, content, "utf8");
    await (policy.rename ?? nodeRename)(temporary, target);
  } catch (error) {
    await (policy.rm ?? nodeRm)(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return {};
}

export function readFsSessionId(params: unknown) {
  return readNonEmptyString(params, "sessionId");
}
