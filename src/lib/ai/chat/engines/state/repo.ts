import { z } from "zod";

const repoComparePullRequestSchema = z.object({
  base: z.string(),
  createdAt: z.string(),
  draft: z.literal(false),
  head: z.string(),
  kind: z.literal("compare"),
  repoFullName: z.string(),
  url: z.string(),
});

const repoGithubPullRequestSchema = z.object({
  base: z.string(),
  createdAt: z.string(),
  draft: z.boolean(),
  head: z.string(),
  kind: z.literal("github"),
  number: z.number().int(),
  repoFullName: z.string(),
  state: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});

export const repoLastPullRequestSchema = z.discriminatedUnion("kind", [
  repoComparePullRequestSchema,
  repoGithubPullRequestSchema,
]);

export const repoProjectModeSchema = z.enum(["local", "worktree"]);

export const repoThreadStateSchema = z.object({
  activeBranch: z.string().nullish(),
  checkpointAnchorMessageId: z.string().nullish(),
  checkpointCursorId: z.string().nullish(),
  checkpointLatestId: z.string().nullish(),
  checkpointProjectPath: z.string().nullish(),
  lastPullRequest: repoLastPullRequestSchema.nullish(),
  projectMode: repoProjectModeSchema.nullish(),
  worktreePath: z.string().nullish(),
});

export type RepoLastPullRequest = z.infer<typeof repoLastPullRequestSchema>;
export type RepoProjectMode = z.infer<typeof repoProjectModeSchema>;
export type RepoThreadState = z.infer<typeof repoThreadStateSchema>;
