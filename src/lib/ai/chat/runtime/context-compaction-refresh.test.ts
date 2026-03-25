// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const checkpointState = {
  coveredThroughMessageId: null as string | null,
  summary: null as string | null,
  updatedAt: null as Date | null,
};
let checkpointVersion = 0;

function cloneCheckpoint() {
  return {
    coveredThroughMessageId: checkpointState.coveredThroughMessageId,
    summary: checkpointState.summary,
    updatedAt: checkpointState.updatedAt
      ? new Date(checkpointState.updatedAt.getTime())
      : null,
  };
}

function setCheckpoint(input: {
  coveredThroughMessageId: string | null;
  summary: string | null;
  updatedAt?: Date | null;
}) {
  checkpointState.coveredThroughMessageId = input.coveredThroughMessageId;
  checkpointState.summary = input.summary;
  checkpointState.updatedAt =
    input.updatedAt === undefined ? null : input.updatedAt;
}

function createDeferred() {
  let resolve: (value: any) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function createCompactionResult(updatedCheckpoint) {
  return {
    checkpointWasInvalid: false,
    didCompact: true,
    inputTokens: 240,
    thresholdTokens: 200,
    transcript: [],
    updatedCheckpoint,
  };
}

const applyContextCompaction = mock(async () =>
  createCompactionResult({
    coveredThroughMessageId: "message-13",
    summary: "summary",
  }),
);
const getThreadContextCompactionCheckpoint = mock(async () =>
  cloneCheckpoint(),
);
const updateThreadContextCompactionCheckpoint = mock(
  (_threadId, checkpoint) => {
    checkpointVersion += 1;
    checkpointState.coveredThroughMessageId =
      checkpoint.coveredThroughMessageId;
    checkpointState.summary = checkpoint.summary;
    checkpointState.updatedAt = checkpoint.summary
      ? new Date(Date.parse("2026-03-10T10:00:00.000Z") + checkpointVersion)
      : null;
  },
);

mock.module("../persistence", () => ({
  getThreadContextCompactionCheckpoint,
  updateThreadContextCompactionCheckpoint,
}));

mock.module("./context-compaction", () => ({
  applyContextCompaction,
}));

mock.module("@/lib/logger", () => ({
  createLogger: () => ({
    debug: mock(() => {}),
    warn: mock(() => {}),
  }),
}));

const { refreshThreadContextCompactionCheckpoint } =
  await import("./context-compaction-refresh");
mock.restore();

beforeEach(() => {
  checkpointVersion = 0;
  setCheckpoint({
    coveredThroughMessageId: null,
    summary: null,
    updatedAt: null,
  });
  applyContextCompaction.mockImplementation(async () =>
    createCompactionResult({
      coveredThroughMessageId: "message-13",
      summary: "summary",
    }),
  );
  getThreadContextCompactionCheckpoint.mockImplementation(async () =>
    cloneCheckpoint(),
  );
});

afterEach(() => {
  mock.clearAllMocks();
  mock.restore();
});

describe("refreshThreadContextCompactionCheckpoint", () => {
  it("skips a stale background write when a newer checkpoint wins the race", async () => {
    const firstCompaction = createDeferred();
    const secondCompaction = createDeferred();

    applyContextCompaction
      .mockImplementationOnce(() => firstCompaction.promise)
      .mockImplementationOnce(() => secondCompaction.promise);

    const firstRefreshPromise = refreshThreadContextCompactionCheckpoint({
      enabled: true,
      languageModel: { kind: "chat-model" },
      staleWriteProtection: true,
      threadId: "thread-1",
      transcript: [],
      windowPercent: 50,
    });
    const secondRefreshPromise = refreshThreadContextCompactionCheckpoint({
      enabled: true,
      languageModel: { kind: "chat-model" },
      staleWriteProtection: true,
      threadId: "thread-1",
      transcript: [],
      windowPercent: 50,
    });

    secondCompaction.resolve(
      createCompactionResult({
        coveredThroughMessageId: "message-14",
        summary: "newer summary",
      }),
    );
    const secondResult = await secondRefreshPromise;

    firstCompaction.resolve(
      createCompactionResult({
        coveredThroughMessageId: "message-13",
        summary: "older summary",
      }),
    );
    const firstResult = await firstRefreshPromise;

    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledTimes(1);
    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledWith(
      "thread-1",
      {
        coveredThroughMessageId: "message-14",
        summary: "newer summary",
      },
    );
    expect(secondResult.didPersistCheckpoint).toBe(true);
    expect(secondResult.skippedPersistDueToStaleWrite).toBe(false);
    expect(firstResult.didPersistCheckpoint).toBe(false);
    expect(firstResult.skippedPersistDueToStaleWrite).toBe(true);
    expect(checkpointState.coveredThroughMessageId).toBe("message-14");
    expect(checkpointState.summary).toBe("newer summary");
  });
});
