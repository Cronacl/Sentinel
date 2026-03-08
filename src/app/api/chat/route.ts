import { type UIMessage, convertToModelMessages, streamText } from "ai";

import {
  getReasoningProviderOptions,
  type ReasoningEffort,
} from "@/lib/ai/models";
import { getLanguageModel, parseModelId } from "@/lib/ai/resolver";
import { serializeThreadUIMessage } from "@/lib/ai/ui-messages";
import { db } from "@/server/db";
import { getLocalSession } from "@/server/local-profile";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getLocalSession();
  const userId = session.user.id;

  const body = (await req.json()) as {
    id: string;
    messages: UIMessage[];
    modelId: string;
    reasoningEffort?: ReasoningEffort;
    workspaceId: string;
  };

  const {
    id: threadId,
    messages,
    modelId,
    reasoningEffort,
    workspaceId,
  } = body;

  if (!threadId || !modelId || !workspaceId || !messages?.length) {
    return new Response("Missing required fields", { status: 400 });
  }

  try {
    const firstUserMessage = messages.find((m) => m.role === "user");
    const titleText =
      firstUserMessage?.parts
        ?.find(
          (
            p,
          ): p is Extract<
            (typeof firstUserMessage.parts)[number],
            { type: "text" }
          > => p.type === "text",
        )
        ?.text.slice(0, 100) ?? "New thread";

    await db.thread.upsert({
      where: { id: threadId },
      create: {
        id: threadId,
        title: titleText,
        userId,
        workspaceId,
      },
      update: {},
    });

    const model = await getLanguageModel(userId, modelId);
    const parsedModel = parseModelId(modelId);
    const providerOptions = getReasoningProviderOptions(
      parsedModel.provider,
      parsedModel.model,
      reasoningEffort,
    );

    const result = streamText({
      model,
      messages: await convertToModelMessages(messages),
      ...(providerOptions ? { providerOptions } : {}),
    });

    result.consumeStream();

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: finalMessages }) => {
        await db.$transaction([
          db.threadMessage.deleteMany({
            where: { threadId },
          }),
          db.threadMessage.createMany({
            data: finalMessages.map((message) => ({
              ...serializeThreadUIMessage(message),
              threadId,
            })),
          }),
          db.thread.update({
            where: { id: threadId },
            data: { updatedAt: new Date() },
          }),
        ]);
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(message, { status: 500 });
  }
}
