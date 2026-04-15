import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueueBackgroundTask = mock((task: unknown) => task);

mock.module("@/lib/browser/background-task-runner", () => ({
  enqueueBackgroundTask,
}));

const {
  hydrateRepoDiffBundleCaches,
  queueRepoBackgroundWarmup,
  warmRepoDiffBundleCandidate,
} = await import("./repo-background-warmup");

const bundle = {
  diffs: {
    branch: { mode: "branch", sourceLabel: "Branch" },
    staged: { mode: "staged", sourceLabel: "Staged" },
    unstaged: { mode: "unstaged", sourceLabel: "Unstaged" },
  },
  repoContext: { branch: "feature/test", preferredOpenTargetId: "cursor" },
} as const;

function createWarmupUtils() {
  const fetch = mock(async () => bundle);
  const getData = mock(() => bundle);
  const prefetch = mock(async () => undefined);
  const setContextData = mock(() => undefined);
  const setDiffData = mock(() => undefined);

  return {
    repo: {
      getContext: {
        setData: setContextData,
      },
      getDiffPanelBundle: {
        fetch,
        getData,
        prefetch,
      },
      getDiffPanelData: {
        setData: setDiffData,
      },
    },
    spies: {
      fetch,
      getData,
      prefetch,
      setContextData,
      setDiffData,
    },
  };
}

describe("repo background warmup", () => {
  beforeEach(() => {
    enqueueBackgroundTask.mockClear();
  });

  it("hydrates repo context and each diff mode from one bundle payload", () => {
    const { repo, spies } = createWarmupUtils();

    hydrateRepoDiffBundleCaches({
      bundle,
      candidate: { threadId: "thread-1", workspaceId: "workspace-1" },
      modes: ["unstaged", "staged", "branch"],
      utils: { repo },
    });

    expect(spies.setContextData).toHaveBeenCalledWith(
      { threadId: "thread-1", workspaceId: "workspace-1" },
      bundle.repoContext,
    );
    expect(spies.setDiffData).toHaveBeenCalledTimes(3);
    expect(spies.setDiffData).toHaveBeenCalledWith(
      { mode: "branch", threadId: "thread-1", workspaceId: "workspace-1" },
      {
        diff: bundle.diffs.branch,
        repoContext: bundle.repoContext,
      },
    );
  });

  it("uses the prefetched bundle cache before falling back to a direct fetch", async () => {
    const { repo, spies } = createWarmupUtils();

    const result = await warmRepoDiffBundleCandidate({
      candidate: { threadId: "thread-1", workspaceId: "workspace-1" },
      modes: ["unstaged", "staged", "branch"],
      strategy: "prefetch",
      utils: { repo },
    });

    expect(result).toBe(bundle);
    expect(spies.prefetch).toHaveBeenCalledTimes(1);
    expect(spies.getData).toHaveBeenCalledTimes(1);
    expect(spies.fetch).not.toHaveBeenCalled();
  });

  it("queues one background bundle task per candidate", async () => {
    const { repo } = createWarmupUtils();

    queueRepoBackgroundWarmup({
      candidates: [
        { threadId: "thread-1", workspaceId: "workspace-1" },
        { threadId: "thread-2", workspaceId: "workspace-2" },
      ],
      modes: ["unstaged", "staged", "branch"],
      strategy: "fetch",
      utils: { repo },
    });

    expect(enqueueBackgroundTask).toHaveBeenCalledTimes(2);
    await enqueueBackgroundTask.mock.calls[0]?.[0]?.run();
    expect(repo.getDiffPanelBundle.fetch).toHaveBeenCalledWith({
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
  });
});
