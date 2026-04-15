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
    getContext: {
      setData: (...args: any[]) => void;
    };
    getDiffPanelBundle: {
      fetch: (...args: any[]) => Promise<{
        diffs: Record<RepoDiffMode, unknown>;
        repoContext: unknown;
      }>;
      getData: (...args: any[]) =>
        | {
            diffs: Record<RepoDiffMode, unknown>;
            repoContext: unknown;
          }
        | undefined;
      prefetch: (...args: any[]) => Promise<unknown>;
    };
    getDiffPanelData: {
      setData: (...args: any[]) => void;
    };
  };
};

export const BACKGROUND_REPO_WARMUP_INTERVAL_MS = 45_000;

export function hydrateRepoDiffBundleCaches(args: {
  bundle: {
    diffs: Record<RepoDiffMode, unknown>;
    repoContext: unknown;
  };
  candidate: RepoWarmupCandidate;
  modes: RepoDiffMode[];
  utils: RepoWarmupUtils;
}) {
  const { threadId, workspaceId } = args.candidate;

  args.utils.repo.getContext.setData(
    { threadId, workspaceId },
    args.bundle.repoContext,
  );

  for (const mode of args.modes) {
    args.utils.repo.getDiffPanelData.setData(
      { mode, threadId, workspaceId },
      {
        diff: args.bundle.diffs[mode],
        repoContext: args.bundle.repoContext,
      },
    );
  }
}

export async function warmRepoDiffBundleCandidate(args: {
  candidate: RepoWarmupCandidate;
  modes: RepoDiffMode[];
  strategy: RepoWarmupStrategy;
  utils: RepoWarmupUtils;
}) {
  const bundleInput = {
    threadId: args.candidate.threadId,
    workspaceId: args.candidate.workspaceId,
  };

  const bundle =
    args.strategy === "prefetch"
      ? await args.utils.repo.getDiffPanelBundle
          .prefetch(bundleInput)
          .then(
            () =>
              args.utils.repo.getDiffPanelBundle.getData(bundleInput) ??
              args.utils.repo.getDiffPanelBundle.fetch(bundleInput),
          )
      : await args.utils.repo.getDiffPanelBundle.fetch(bundleInput);

  hydrateRepoDiffBundleCaches({
    bundle,
    candidate: args.candidate,
    modes: args.modes,
    utils: args.utils,
  });

  return bundle;
}

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
      key: `repo-diff-bundle:${workspaceId}:${threadId}`,
      minIntervalMs: args.minIntervalMs,
      run: () =>
        warmRepoDiffBundleCandidate({
          candidate: { threadId, workspaceId },
          modes: args.modes,
          strategy: method,
          utils: args.utils,
        }),
    });
  }
}
