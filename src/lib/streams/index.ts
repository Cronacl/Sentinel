import { after } from "next/server";

import { createLogger } from "@/lib/logger";

type StreamListener = {
  close(): void;
  enqueue(chunk: string): void;
  error(error: unknown): void;
};

type ActiveStreamRecord = {
  chunks: string[];
  chunkBytes: number[];
  completion: Promise<void>;
  done: boolean;
  error: unknown;
  listeners: Set<StreamListener>;
  cleanupTimer: NodeJS.Timeout | null;
  retainedBytes: number;
};

const STREAM_TTL_MS = 60_000;
const MAX_RETAINED_STREAM_BYTES = 512 * 1024;
const MAX_RETAINED_STREAM_CHUNKS = 128;

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveStreams: Map<string, ActiveStreamRecord> | undefined;
}

const activeStreams =
  globalThis.__sentinelActiveStreams ??
  (globalThis.__sentinelActiveStreams = new Map<string, ActiveStreamRecord>());

function isSettledControllerError(error: unknown) {
  return error instanceof TypeError;
}

export function safelyCloseReadableStreamController<T>(
  controller: ReadableStreamDefaultController<T> | null | undefined,
) {
  if (!controller) {
    return false;
  }

  try {
    controller.close();
    return true;
  } catch (error) {
    if (isSettledControllerError(error)) {
      return false;
    }

    throw error;
  }
}

export function safelyEnqueueReadableStreamController<T>(
  controller: ReadableStreamDefaultController<T> | null | undefined,
  chunk: T,
) {
  if (!controller) {
    return false;
  }

  try {
    controller.enqueue(chunk);
    return true;
  } catch (error) {
    if (isSettledControllerError(error)) {
      return false;
    }

    throw error;
  }
}

export function safelyErrorReadableStreamController<T>(
  controller: ReadableStreamDefaultController<T> | null | undefined,
  error: unknown,
) {
  if (!controller) {
    return false;
  }

  try {
    controller.error(error);
    return true;
  } catch (controllerError) {
    if (isSettledControllerError(controllerError)) {
      return false;
    }

    throw controllerError;
  }
}

function scheduleCleanup(streamId: string) {
  const record = activeStreams.get(streamId);
  if (!record) {
    return;
  }

  if (record.cleanupTimer) {
    clearTimeout(record.cleanupTimer);
  }

  record.cleanupTimer = setTimeout(() => {
    activeStreams.delete(streamId);
  }, STREAM_TTL_MS);
}

function clearScheduledCleanup(record: ActiveStreamRecord) {
  if (!record.cleanupTimer) {
    return;
  }

  clearTimeout(record.cleanupTimer);
  record.cleanupTimer = null;
}

function trimRetainedChunks(record: ActiveStreamRecord) {
  while (
    record.chunks.length > 1 &&
    (record.retainedBytes > MAX_RETAINED_STREAM_BYTES ||
      record.chunks.length > MAX_RETAINED_STREAM_CHUNKS)
  ) {
    record.chunks.shift();
    const droppedBytes = record.chunkBytes.shift() ?? 0;
    record.retainedBytes = Math.max(0, record.retainedBytes - droppedBytes);
  }
}

function retainChunk(record: ActiveStreamRecord, chunk: string) {
  const chunkBytes = Buffer.byteLength(chunk, "utf8");
  record.chunks.push(chunk);
  record.chunkBytes.push(chunkBytes);
  record.retainedBytes += chunkBytes;
  trimRetainedChunks(record);
}

function createReplayStream(record: ActiveStreamRecord) {
  let listener: StreamListener | undefined;

  return new ReadableStream<string>({
    start(controller) {
      let closed = false;

      for (const chunk of record.chunks) {
        if (!safelyEnqueueReadableStreamController(controller, chunk)) {
          closed = true;
          return;
        }
      }

      if (record.done) {
        if (record.error != null) {
          safelyErrorReadableStreamController(controller, record.error);
        } else {
          safelyCloseReadableStreamController(controller);
        }
        return;
      }

      const currentListener: StreamListener = {
        close() {
          if (closed) {
            return;
          }
          closed = true;
          safelyCloseReadableStreamController(controller);
          record.listeners.delete(currentListener);
        },
        enqueue(chunk) {
          if (closed) {
            return;
          }
          if (!safelyEnqueueReadableStreamController(controller, chunk)) {
            closed = true;
            record.listeners.delete(currentListener);
          }
        },
        error(error) {
          if (closed) {
            return;
          }
          closed = true;
          safelyErrorReadableStreamController(controller, error);
          record.listeners.delete(currentListener);
        },
      };

      listener = currentListener;
      record.listeners.add(currentListener);
    },
    cancel() {
      if (listener) {
        record.listeners.delete(listener);
        listener = undefined;
      }
      return;
    },
  });
}

async function consumeStream(
  streamId: string,
  record: ActiveStreamRecord,
  stream: ReadableStream<string>,
) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      retainChunk(record, value);
      for (const listener of record.listeners) {
        listener.enqueue(value);
      }
    }
  } catch (error) {
    record.error = error;
    for (const listener of record.listeners) {
      listener.error(error);
    }
  } finally {
    record.done = true;
    for (const listener of record.listeners) {
      listener.close();
    }
    record.listeners.clear();
    scheduleCleanup(streamId);
    reader.releaseLock();
  }
}

export const streamContext = {
  async createNewResumableStream(
    streamId: string,
    makeStream: () => ReadableStream<string>,
  ) {
    const existing = activeStreams.get(streamId);
    if (existing) {
      clearScheduledCleanup(existing);
    }

    const stream = makeStream();
    const record: ActiveStreamRecord = {
      chunks: [],
      chunkBytes: [],
      cleanupTimer: null,
      completion: Promise.resolve(),
      done: false,
      error: null,
      listeners: new Set(),
      retainedBytes: 0,
    };

    const streamLog = createLogger("Stream");
    record.completion = consumeStream(streamId, record, stream).catch(
      (error) => {
        streamLog.error(
          `Stream ${streamId} failed: ${error instanceof Error ? error.message : error}`,
        );
      },
    );
    activeStreams.set(streamId, record);
    try {
      after(record.completion);
    } catch {
      // The manager still works in local scripts/tests without a request scope.
    }
  },

  async resumeExistingStream(streamId: string) {
    const record = activeStreams.get(streamId);

    if (!record) {
      return undefined;
    }

    clearScheduledCleanup(record);
    return createReplayStream(record);
  },
};
