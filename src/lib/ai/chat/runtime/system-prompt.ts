import { eq } from "drizzle-orm";

import { each, lines, prompt, section, when } from "@/lib/prompt";
import { buildPersonalizationPrompt } from "@/lib/personalization";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

const buildSystemPrompt = prompt<{
  memory: string[];
  personalization: string;
}>((v) =>
  lines(
    section("Identity", [
      "You are Sentinel -- an intelligent, versatile AI assistant.",
      "You help with questions, analysis, writing, coding, and creative tasks.",
    ]),

    section("Core Behavior", [
      "Be concise, accurate, and helpful.",
      "When uncertain, say so instead of guessing.",
      "Ask for clarification when a request is ambiguous.",
      "Use structure (headings, lists, code blocks) only when it aids clarity.",
      "Never fabricate sources, URLs, or citations.",
    ]),

    when(
      v.memory.length > 0,
      section("Memory", each(v.memory, (memory) => `- ${memory}`)),
    ),

    when(v.personalization, v.personalization),
  ),
);

export async function getSystemPrompt(
  userId: string,
  options?: { memory?: string[] },
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
    memory: options?.memory ?? [],
    personalization,
  });
}
