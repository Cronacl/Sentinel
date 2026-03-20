import { generateText } from "ai";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  buildFallbackCommitMessage,
  commitAllChanges,
  createAndCheckoutBranch,
  getCommitMessageContext,
  initializeRepository,
  pushCurrentBranch,
  resolveRepoContext,
} from "@/lib/git/repo";
import { lines } from "@/lib/prompt";
import { resolveThreadTitleModel } from "@/lib/ai/chat/title/model";
import { normalizeSelectedModelId } from "@/lib/ai/providers/model-selection";
import { getEnabledModels, parseModelId } from "@/lib/ai/providers/resolver";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { users } from "@/server/db/schema";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

const workspaceInputSchema = z.object({
  workspaceId: z.string().min(1),
});
const openTargetPreferenceSchema = z.object({
  targetId: z.string().trim().min(1).max(255),
});

const COMMIT_MESSAGE_SYSTEM_PROMPT = lines(
  "Generate a concise git commit message for the provided repository changes.",
  "Return a single-line commit subject only.",
  "Use imperative mood.",
  "Prefer concrete wording over generic phrasing.",
  "Keep it under 72 characters when possible.",
  "Do not wrap the result in quotes, markdown, or a prefix label.",
);

function sanitizeCommitMessage(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(commit message|message)\s*:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 120);
}

async function resolveCommitGenerationModel(user: {
  defaultChatModelId?: string | null;
  id: string;
}) {
  const enabledModels = await getEnabledModels(user.id);
  if (enabledModels.length === 0) {
    return null;
  }

  const preferredModelId =
    normalizeSelectedModelId(user.defaultChatModelId ?? null, enabledModels) ??
    enabledModels[0]?.compositeId ??
    null;
  if (!preferredModelId) {
    return null;
  }

  const { provider } = parseModelId(preferredModelId);
  return await resolveThreadTitleModel({
    providerId: provider,
    userId: user.id,
  });
}

async function generateWorkspaceCommitMessage({
  rootPath,
  user,
}: {
  rootPath: string;
  user: {
    defaultChatModelId?: string | null;
    id: string;
  };
}) {
  const commitContext = await getCommitMessageContext(rootPath);
  const fallbackMessage = buildFallbackCommitMessage(commitContext.changes);

  try {
    const model = await resolveCommitGenerationModel(user);
    if (!model) {
      return { message: fallbackMessage };
    }

    const prompt = lines(
      commitContext.branch
        ? `Current branch: ${commitContext.branch}`
        : "Current branch: unknown",
      "",
      "Changed files:",
      ...commitContext.changes.map((change) => `- ${change.type}: ${change.path}`),
      "",
      commitContext.diffStat
        ? `Diff stat:\n${commitContext.diffStat}`
        : "Diff stat: unavailable",
      "",
      "Generate the best commit message now.",
    );

    const result = await generateText({
      model: model.languageModel as Parameters<typeof generateText>[0]["model"],
      prompt,
      system: COMMIT_MESSAGE_SYSTEM_PROMPT,
      temperature: 0.2,
      ...(model.providerOptions ? { providerOptions: model.providerOptions } : {}),
    });

    const message = sanitizeCommitMessage(result.text);
    return {
      message: message || fallbackMessage,
    };
  } catch {
    return {
      message: fallbackMessage,
    };
  }
}

function assertWorkspaceRootPath(rootPath: string | null) {
  if (!rootPath?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This workspace does not have a root path.",
    });
  }

  return rootPath;
}

export const repoRouter = createTRPCRouter({
  getContext: protectedProcedure
    .input(workspaceInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const repoContext = await resolveRepoContext(workspace.rootPath);
      return {
        ...repoContext,
        preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
      };
    }),

  setPreferredOpenTarget: protectedProcedure
    .input(openTargetPreferenceSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          lastProjectOpenTargetId: input.targetId,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        targetId: input.targetId,
      };
    }),

  commit: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        message: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await commitAllChanges(
        assertWorkspaceRootPath(workspace.rootPath),
        input.message,
      );
    }),

  createBranch: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        branchName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await createAndCheckoutBranch(
        assertWorkspaceRootPath(workspace.rootPath),
        input.branchName,
      );
    }),

  generateCommitMessage: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      return await generateWorkspaceCommitMessage({
        rootPath,
        user: ctx.user,
      });
    }),

  createPullRequest: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        branchName: z.string().trim().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);

      let repoContext = await resolveRepoContext(rootPath);
      if (!repoContext.isGitRepo || !repoContext.githubRemote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Create PR requires a GitHub-backed git repository.",
        });
      }

      let createdBranch: string | null = null;
      let commitMessage: string | null = null;

      if (repoContext.isDefaultBranch) {
        if (!input.branchName?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Create PR from the default branch requires a new branch name.",
          });
        }

        const created = await createAndCheckoutBranch(rootPath, input.branchName);
        createdBranch = created.branch;
        repoContext = await resolveRepoContext(rootPath);
      }

      if (repoContext.hasChanges) {
        const generated = await generateWorkspaceCommitMessage({
          rootPath,
          user: ctx.user,
        });
        commitMessage = generated.message;
        await commitAllChanges(rootPath, generated.message);
        repoContext = await resolveRepoContext(rootPath);
      }

      const shouldPush =
        !repoContext.hasUpstream || (repoContext.aheadCount ?? 0) > 0;
      if (shouldPush) {
        await pushCurrentBranch(rootPath);
        repoContext = await resolveRepoContext(rootPath);
      }

      if (!repoContext.githubRemote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unable to resolve the GitHub repository for this branch.",
        });
      }

      const pullRequestUrl =
        repoContext.githubRemote.pullRequestUrl ??
        repoContext.githubRemote.pullRequestsUrl;

      return {
        branch: repoContext.branch,
        commitMessage,
        createdBranch,
        pullRequestUrl,
      };
    }),

  init: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await initializeRepository(
        assertWorkspaceRootPath(workspace.rootPath),
      );
    }),

  push: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await pushCurrentBranch(
        assertWorkspaceRootPath(workspace.rootPath),
      );
    }),
});
