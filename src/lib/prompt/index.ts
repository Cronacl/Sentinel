type Falsy = false | 0 | "" | null | undefined;

/**
 * Creates a reusable, type-safe prompt function. The render function receives
 * typed variables and returns a string built from the other helpers.
 */
export function prompt<T>(renderFn: (vars: T) => string): (vars: T) => string {
  return renderFn;
}

/**
 * Composition primitive. Filters out falsy/empty values, joins the rest with
 * paragraph spacing (`\n\n`), and trims the result.
 */
export function lines(
  ...parts: Array<string | Falsy>
): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join("\n\n")
    .trim();
}

/**
 * Creates a Markdown-headed section. String arrays become bullet lists.
 */
export function section(title: string, content: string | string[]): string {
  const body = Array.isArray(content)
    ? content.map((item) => `- ${item}`).join("\n")
    : content;
  return `## ${title}\n\n${body}`;
}

/**
 * Conditional block. Returns content when condition is truthy, empty string
 * (or elseContent) when falsy. Accepts lazy functions to avoid null-access
 * errors when content depends on the condition.
 */
export function when(
  condition: unknown,
  content: string | (() => string),
  elseContent?: string | (() => string),
): string {
  if (condition) {
    return typeof content === "function" ? content() : content;
  }
  if (elseContent !== undefined) {
    return typeof elseContent === "function" ? elseContent() : elseContent;
  }
  return "";
}

/**
 * Maps an array to text and joins with a separator (default `\n`).
 */
export function each<T>(
  items: T[],
  mapFn: (item: T, index: number) => string,
  separator: string = "\n",
): string {
  return items.map(mapFn).join(separator);
}
