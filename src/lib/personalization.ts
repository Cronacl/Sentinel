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

type PersonalizationPromptInput = {
  aboutUser?: string | null;
  customInstructions?: string | null;
  nickname?: string | null;
  occupation?: string | null;
  personality?: PersonalityPreset | null;
};

export function buildPersonalizationPrompt({
  aboutUser,
  customInstructions,
  nickname,
  occupation,
  personality,
}: PersonalizationPromptInput) {
  const preset = PERSONALITY_PRESETS.find(
    (item) => item.value === (personality ?? DEFAULT_PERSONALITY_PRESET),
  );

  const sections = [
    preset ? `Default personality: ${preset.prompt}` : null,
    nickname?.trim() ? `User nickname: ${nickname.trim()}` : null,
    occupation?.trim() ? `User occupation: ${occupation.trim()}` : null,
    aboutUser?.trim() ? `About the user: ${aboutUser.trim()}` : null,
    customInstructions?.trim()
      ? `Custom instructions: ${customInstructions.trim()}`
      : null,
  ].filter(Boolean);

  return sections.join("\n");
}
