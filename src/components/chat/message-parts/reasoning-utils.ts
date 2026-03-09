export interface ReasoningStep {
  title: string;
  content: string;
}

export const parseReasoning = (reasoning: string): ReasoningStep[] => {
  if (!reasoning || typeof reasoning !== "string") return [];

  const text = normalizeContent(reasoning);
  if (!text) return [];

  const headingSteps = parseHeadingSteps(text);
  if (headingSteps.length > 0) return headingSteps;

  const steps: ReasoningStep[] = [];
  let i = 0;
  const len = text.length;
  let currentTitle: string | null = null;
  let contentStart = 0;

  while (i < len) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const titleStart = i + 2;
      let titleEnd = -1;

      for (let j = titleStart; j < len - 1; j++) {
        if (text[j] === "*" && text[j + 1] === "*") {
          titleEnd = j;
          break;
        }

        if (text[j] === "\n" || (text[j] === "\\" && text[j + 1] === "n")) {
          break;
        }
      }

      if (titleEnd > titleStart) {
        if (currentTitle !== null) {
          const content = extractContent(text, contentStart, i);
          if (content) {
            steps.push({ title: currentTitle, content });
          }
        }

        currentTitle = text.slice(titleStart, titleEnd).trim();
        contentStart = titleEnd + 2;
        i = contentStart;
        continue;
      }
    }

    if (text[i] === "\\" && text[i + 1] === "n") {
      i += 2;
      continue;
    }

    i++;
  }

  if (currentTitle !== null) {
    const content = extractContent(text, contentStart, len);
    if (content) {
      steps.push({ title: currentTitle, content });
    }
  }

  if (steps.length === 0 && text.length > 0) {
    return [{ title: "Planning next moves", content: normalizeContent(text) }];
  }

  return steps;
};

function parseHeadingSteps(text: string): ReasoningStep[] {
  const lines = text.split("\n");
  const steps: ReasoningStep[] = [];
  let currentTitle: string | null = null;
  let currentContent: string[] = [];

  const pushCurrent = () => {
    if (!currentTitle) return;

    const content = normalizeContent(currentContent.join("\n"));
    steps.push({
      title: currentTitle,
      content,
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    const boldHeadingMatch = trimmed.match(/^\*\*([^*\n]+)\*\*:?\s*$/);

    if (headingMatch || boldHeadingMatch) {
      pushCurrent();
      currentTitle = (headingMatch?.[1] ?? boldHeadingMatch?.[1] ?? "").trim();
      currentContent = [];
      continue;
    }

    if (currentTitle === null) {
      currentTitle = "Planning next moves";
    }

    currentContent.push(line);
  }

  pushCurrent();

  return steps.filter((step) => step.title || step.content);
}

const extractContent = (text: string, start: number, end: number) => {
  if (start >= end) return "";
  return normalizeContent(text.slice(start, end));
};

const normalizeContent = (content: string) => {
  content = content.replace(/\\n/g, "\n");
  content = content.trim();
  content = content.replace(/\n{3,}/g, "\n\n");
  return content;
};

export const extractLastTitle = (reasoning: string): string | null => {
  if (!reasoning || typeof reasoning !== "string") return null;

  const text = reasoning.trim();
  if (!text) return null;

  const len = text.length;

  for (let i = len - 3; i >= 0; i--) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const afterPos = i + 2;

      let hasClosingAfter = false;
      for (let j = afterPos; j < len - 1; j++) {
        if (text[j] === "*" && text[j + 1] === "*") {
          hasClosingAfter = true;
          break;
        }
        if (text[j] === "\n" || (text[j] === "\\" && text[j + 1] === "n")) {
          break;
        }
      }

      if (hasClosingAfter) {
        const titleStart = afterPos;
        for (let j = titleStart; j < len - 1; j++) {
          if (text[j] === "*" && text[j + 1] === "*") {
            const title = text.slice(titleStart, j).trim();
            if (title) return title;
            break;
          }
          if (text[j] === "\n" || (text[j] === "\\" && text[j + 1] === "n")) {
            break;
          }
        }
      }
    }
  }

  return null;
};
