import { lines, prompt, when } from "@/lib/prompt";

export const PERSONALITY_PRESET_VALUES = [
  "friendly",
  "pragmatic",
  "analytical",
  "mentor",
] as const;

export type PersonalityPreset = (typeof PERSONALITY_PRESET_VALUES)[number];

export const DEFAULT_PERSONALITY_PRESET: PersonalityPreset = "pragmatic";

export const PERSONALITY_PRESETS = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm, collaborative, and easy to work with.",
    prompt:
      "Use a warm, collaborative, and helpful tone while staying concise.",
  },
  {
    value: "pragmatic",
    label: "Pragmatic",
    description: "Concise, task-focused, and direct.",
    prompt:
      "Prioritize direct answers, clear tradeoffs, and practical next steps.",
  },
  {
    value: "analytical",
    label: "Analytical",
    description: "Structured, precise, and evidence-oriented.",
    prompt:
      "Favor structure, careful reasoning, and explicit assumptions or risks.",
  },
  {
    value: "mentor",
    label: "Mentor",
    description: "Thoughtful, explanatory, and supportive.",
    prompt:
      "Teach clearly, explain the why behind decisions, and guide the user forward.",
  },
] as const;

export type PersonalizationPromptInput = {
  aboutUser?: string | null;
  customInstructions?: string | null;
  nickname?: string | null;
  occupation?: string | null;
  personality?: PersonalityPreset | null;
};

export const buildPersonalizationPrompt = prompt<PersonalizationPromptInput>(
  (v) => {
    const preset = PERSONALITY_PRESETS.find(
      (item) => item.value === (v.personality ?? DEFAULT_PERSONALITY_PRESET),
    );

    return lines(
      when(preset, () => `Default personality: ${preset!.prompt}`),
      when(v.nickname?.trim(), () => `User nickname: ${v.nickname!.trim()}`),
      when(v.occupation?.trim(), () => `User occupation: ${v.occupation!.trim()}`),
      when(v.aboutUser?.trim(), () => `About the user: ${v.aboutUser!.trim()}`),
      when(v.customInstructions?.trim(), () =>
        `Custom instructions: ${v.customInstructions!.trim()}`,
      ),
    );
  },
);
