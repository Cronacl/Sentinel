import { afterEach, describe, expect, it, mock } from "bun:test";

const generateText = mock(async () => ({ text: 'Title: "Broken Thread Title."' }));

mock.module("ai", () => ({
  generateText,
}));

const {
  buildTitlePrompt,
  generateThreadTitle,
  TITLE_SYSTEM_PROMPT,
} = await import("./generate");

afterEach(() => {
  mock.restore();
});

describe("generateThreadTitle", () => {
  it("uses the stronger title prompt instructions", async () => {
    const firstUserText =
      "Please help me debug the broken dashboard filter and fix the loading state.";

    await generateThreadTitle({
      firstUserText,
      model: {
        languageModel: { kind: "title-model" },
        providerId: "openai",
        providerOptions: { openai: { reasoningEffort: "minimal" } },
        requestedModelId: "openai:gpt-4.1-nano",
        responseModelId: "gpt-4.1-nano",
      },
    });

    expect(TITLE_SYSTEM_PROMPT).toContain(
      "Generate a concise, specific chat thread title of 2 to 6 words.",
    );
    expect(TITLE_SYSTEM_PROMPT).toContain(
      "Avoid filler such as Help, Question, Task, Chat, Please, Need to, or Can you.",
    );
    expect(buildTitlePrompt(firstUserText)).toContain("First user message:");
    expect(buildTitlePrompt(firstUserText)).toContain(
      "Generate the best thread title now.",
    );
    expect(generateText).toHaveBeenCalledWith({
      model: { kind: "title-model" },
      prompt: buildTitlePrompt(firstUserText),
      providerOptions: { openai: { reasoningEffort: "minimal" } },
      system: TITLE_SYSTEM_PROMPT,
      temperature: 0.2,
    });
  });

  it("sanitizes labels, quotes, and trailing punctuation from generated titles", async () => {
    const title = await generateThreadTitle({
      firstUserText: "Fix the broken auth redirect on first load",
      model: {
        languageModel: { kind: "title-model" },
        providerId: "openai",
        requestedModelId: "openai:gpt-4.1-nano",
        responseModelId: "gpt-4.1-nano",
      },
    });

    expect(title).toBe("Broken Thread Title");
  });
});
