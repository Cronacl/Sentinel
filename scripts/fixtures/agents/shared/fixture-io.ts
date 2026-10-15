// Process plumbing shared by the protocol fixtures in scripts/fixtures/agents.
// The fixtures run as child processes of bun tests, so everything here writes
// synchronously enough that a deliberate crash never loses earlier frames.
import { appendFileSync, readFileSync } from "node:fs";
import type { Readable } from "node:stream";

export type JsonObject = Record<string, unknown>;

/**
 * Reads a scenario from `jsonVar` (inline JSON) or `fileVar` (a path to a JSON
 * file). The inline variable wins when both are set. A malformed scenario is a
 * fixture bug, so it exits with code 2 and a message on stderr.
 */
export function loadScenarioFromEnv<T extends object>(
  jsonVar: string,
  fileVar: string,
): T {
  const inline = process.env[jsonVar];
  const file = process.env[fileVar];
  const source = inline ?? (file ? readFileSync(file, "utf8") : undefined);
  if (source === undefined || source.trim() === "") return {} as T;
  try {
    const parsed: unknown = JSON.parse(source);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("the scenario must be a JSON object");
    }
    return parsed as T;
  } catch (error) {
    process.stderr.write(
      `[fixture] invalid scenario in ${inline !== undefined ? jsonVar : fileVar}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(2);
  }
}

/** Appends one JSON object per line to `path`; a no-op when `path` is unset. */
export function createJsonlLog(path: string | undefined) {
  return (record: JsonObject) => {
    if (!path) return;
    try {
      appendFileSync(
        path,
        `${JSON.stringify({ ts: Date.now(), ...record })}\n`,
      );
    } catch {
      // Logging must never take the fixture down.
    }
  };
}

/** Reads a JSONL file written by {@link createJsonlLog}; missing files read as empty. */
export function readJsonl<T = JsonObject>(path: string): T[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

export type StdoutWriterOptions = {
  /** Writes every frame in chunks of this many bytes, yielding between chunks. */
  splitFramesBytes?: number;
};

/**
 * Serialises every stdout write (protocol frames and injected noise) through
 * one queue, so noise lands exactly between frames and `flush()` resolves only
 * once the bytes reached the pipe.
 */
export function createStdoutWriter(options: StdoutWriterOptions = {}) {
  const encoder = new TextEncoder();
  let queue: Promise<void> = Promise.resolve();

  const writeChunk = (chunk: Uint8Array) =>
    new Promise<void>((resolve) => {
      process.stdout.write(chunk, () => resolve());
    });

  const write = (data: string | Uint8Array): Promise<void> => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    const size = options.splitFramesBytes ?? 0;
    queue = queue.then(async () => {
      if (size <= 0 || bytes.byteLength <= size) {
        await writeChunk(bytes);
        return;
      }
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        await writeChunk(bytes.subarray(offset, offset + size));
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    });
    return queue;
  };

  const stream = new WritableStream<Uint8Array>({
    write: (chunk) => write(chunk),
  });

  return { write, flush: () => queue, stream };
}

/** Wraps a Node readable (stdin) as a web stream of bytes. */
export function nodeReadableToWeb(
  readable: Readable,
): ReadableStream<Uint8Array> {
  let done = false;
  let detach = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer | string) => {
        if (done) return;
        controller.enqueue(
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk),
        );
      };
      const onEnd = () => {
        if (done) return;
        done = true;
        controller.close();
      };
      const onError = (error: Error) => {
        if (done) return;
        done = true;
        controller.error(error);
      };
      readable.on("data", onData);
      readable.on("end", onEnd);
      readable.on("error", onError);
      detach = () => {
        readable.off("data", onData);
        readable.off("end", onEnd);
        readable.off("error", onError);
      };
    },
    cancel() {
      done = true;
      detach();
      // Keep draining so the pipe still reaches EOF and the process can close.
      readable.resume();
    },
  });
}

/** Writes `text` to stderr `repeat` times and waits for the pipe to accept it. */
export function writeStderr(text: string, repeat = 1): Promise<void> {
  const payload = text.repeat(Math.max(1, repeat));
  return new Promise((resolve) => {
    process.stderr.write(payload, () => resolve());
  });
}

/** Floods stderr with roughly `bytes` bytes of log-like lines. */
export async function floodStderr(bytes: number): Promise<void> {
  const line =
    "[fixture] stderr flood: lorem ipsum dolor sit amet consectetur\n";
  const count = Math.ceil(bytes / line.length);
  for (let written = 0; written < count; written += 256) {
    await writeStderr(line, Math.min(256, count - written));
  }
}

/** Resolves after `ms`, or rejects with the signal's reason once it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Never resolves; rejects once `signal` aborts (when given). */
export function waitForAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

/**
 * Replaces `{{name}}` placeholders in every string of `value`. A string that is
 * exactly one placeholder takes the variable's raw value, so `"{{promptId}}"`
 * can stay a string while `"id: {{promptId}}"` interpolates.
 */
export function applyTemplate<T>(value: T, vars: Record<string, unknown>): T {
  if (typeof value === "string") {
    const whole = /^\{\{(\w+)\}\}$/.exec(value);
    if (whole?.[1] !== undefined && whole[1] in vars) {
      return vars[whole[1]] as T;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
      name in vars ? String(vars[name] ?? "") : match,
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => applyTemplate(item, vars)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        applyTemplate(item, vars),
      ]),
    ) as T;
  }
  return value;
}

export function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
