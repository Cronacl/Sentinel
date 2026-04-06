"use client";

import type { RepoDiffMode } from "@/lib/git/repo";
import { enqueueBackgroundTask } from "@/lib/browser/background-task-runner";

type RepoWarmupCandidate = {
  threadId: string;
  workspaceId: string;
};

type RepoWarmupStrategy = "fetch" | "prefetch";

type RepoWarmupUtils = {
  repo: {
    getContext: Record<
      RepoWarmupStrategy,
      (input: { threadId: string; workspaceId: string }) => Promise<unknown>
    >;
    getDiffPanelData: Record<
      RepoWarmupStrategy,
      (input: {
        mode: RepoDiffMode;
        threadId: string;
        workspaceId: string;
      }) => Promise<unknown>
    >;
  };
};

export const BACKGROUND_REPO_WARMUP_INTERVAL_MS = 45_000;

export function queueRepoBackgroundWarmup(args: {
  candidates: RepoWarmupCandidate[];
  minIntervalMs?: number;
  modes: RepoDiffMode[];
  strategy: RepoWarmupStrategy;
  utils: RepoWarmupUtils;
}) {
  const method = args.strategy;

  for (const { threadId, workspaceId } of args.candidates) {
    enqueueBackgroundTask({
      key: `repo-context:${workspaceId}:${threadId}`,
      minIntervalMs: args.minIntervalMs,
      run: () => args.utils.repo.getContext[method]({ threadId, workspaceId }),
    });

    for (const mode of args.modes) {
      enqueueBackgroundTask({
        key: `repo-diff:${workspaceId}:${threadId}:${mode}`,
        minIntervalMs: args.minIntervalMs,
        run: () =>
          args.utils.repo.getDiffPanelData[method]({
            mode,
            threadId,
            workspaceId,
          }),
      });
    }
  }
}
