const CODEX_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const CODEX_TITLE_LEAD_INS = [
  /^please\s+/i,
  /^can you\s+/i,
  /^could you\s+/i,
  /^would you\s+/i,
  /^help me\s+/i,
  /^i need(?: you)? to\s+/i,
  /^we need(?: you)? to\s+/i,
];

function titleCaseWord(word: string, index: number) {
  if (word.length <= 1) {
    return word.toUpperCase();
  }

  if (/[A-Z].*[A-Z]/.test(word)) {
    return word;
  }

  const lower = word.toLowerCase();
  if (index > 0 && CODEX_TITLE_STOP_WORDS.has(lower)) {
    return lower;
  }

  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

export function getCodexAssistantParentMessageId(input: {
  submittedUserMessageId: string | null;
  userParentMessageId: string | null;
}) {
  return input.submittedUserMessageId ?? input.userParentMessageId;
}

export function buildCodexBootstrapTitle(firstUserText: string | null) {
  const normalized = firstUserText?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return "New thread";
  }

  const strippedLeadIn = CODEX_TITLE_LEAD_INS.reduce(
    (value, pattern) => value.replace(pattern, ""),
    normalized,
  );
  const stripped = strippedLeadIn
    .replace(/^["'`([{<\s]+/, "")
    .replace(/[.?!,:;\-–—]+$/g, "")
    .trim();

  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) {
    return "New thread";
  }

  return words.map((word, index) => titleCaseWord(word, index)).join(" ");
}
