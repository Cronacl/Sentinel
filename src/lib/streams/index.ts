import { after } from "next/server";

type StreamListener = {
  close(): void;
  enqueue(chunk: string): void;
  error(error: unknown): void;
};

type ActiveStreamRecord = {
  chunks: string[];
  completion: Promise<void>;
  done: boolean;
  error: unknown;
  listeners: Set<StreamListener>;
  cleanupTimer: NodeJS.Timeout | null;
};

const STREAM_TTL_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveStreams:
    | Map<string, ActiveStreamRecord>
    | undefined;
}

const activeStreams =
  globalThis.__sentinelActiveStreams ??
  (globalThis.__sentinelActiveStreams = new Map<string, ActiveStreamRecord>());

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

function createReplayStream(record: ActiveStreamRecord) {
  let listener: StreamListener | undefined;

  return new ReadableStream<string>({
    start(controller) {
      let closed = false;

      for (const chunk of record.chunks) {
        controller.enqueue(chunk);
      }

      if (record.done) {
        if (record.error != null) {
          controller.error(record.error);
        } else {
          controller.close();
        }
        return;
      }

      const currentListener: StreamListener = {
        close() {
          if (closed) {
            return;
          }
          closed = true;
          controller.close();
          record.listeners.delete(currentListener);
        },
        enqueue(chunk) {
          if (closed) {
            return;
          }
          controller.enqueue(chunk);
        },
        error(error) {
          if (closed) {
            return;
          }
          closed = true;
          controller.error(error);
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

      record.chunks.push(value);
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
      cleanupTimer: null,
      completion: Promise.resolve(),
      done: false,
      error: null,
      listeners: new Set(),
    };

    record.completion = consumeStream(streamId, record, stream).catch(
      (error) => {
        console.error(
          `[Stream] Stream ${streamId} failed:`,
          error instanceof Error ? error.message : error,
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
