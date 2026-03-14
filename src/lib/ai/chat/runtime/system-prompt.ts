import { eq } from "drizzle-orm";

import { buildPersonalizationPrompt } from "@/lib/personalization";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import type { ThreadPromptContext } from "../prompt-context";
import { buildSystemPrompt } from "./system-prompt-builder";

export async function getSystemPrompt(
  userId: string,
  promptContext: ThreadPromptContext,
): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      aboutUser: true,
      customInstructions: true,
      nickname: true,
      occupation: true,
      personalityPreset: true,
    },
  });

  const personalization = user
    ? buildPersonalizationPrompt({
        aboutUser: user.aboutUser,
        customInstructions: user.customInstructions,
        nickname: user.nickname,
        occupation: user.occupation,
        personality: user.personalityPreset,
      })
    : "";

  return buildSystemPrompt({
    personalization,
    promptContext,
  });
}
