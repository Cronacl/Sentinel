import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
  type ThemedToken,
} from "shiki";

export type { ThemedToken };

export const highlighterPromise = createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: [],
});

const highlightedHtmlCache = new Map<string, string>();
const MAX_HIGHLIGHT_CACHE_SIZE = 200;

export function setCachedHighlightHtml(key: string, value: string) {
  if (highlightedHtmlCache.has(key)) {
    highlightedHtmlCache.delete(key);
  }

  highlightedHtmlCache.set(key, value);

  if (highlightedHtmlCache.size <= MAX_HIGHLIGHT_CACHE_SIZE) {
    return;
  }

  const oldestKey = highlightedHtmlCache.keys().next().value;
  if (oldestKey) {
    highlightedHtmlCache.delete(oldestKey);
  }
}

export function getCachedHighlightHtml(key: string): string | undefined {
  return highlightedHtmlCache.get(key);
}

export const languageToVSCodeIcon: Record<string, string> = {
  bash: "vscode-icons:file-type-shell",
  c: "vscode-icons:file-type-c",
  cpp: "vscode-icons:file-type-cpp",
  css: "vscode-icons:file-type-css",
  dart: "vscode-icons:file-type-dart",
  docker: "vscode-icons:file-type-docker",
  dockerfile: "vscode-icons:file-type-docker",
  env: "vscode-icons:file-type-dotenv",
  go: "vscode-icons:file-type-go",
  graphql: "vscode-icons:file-type-graphql",
  html: "vscode-icons:file-type-html",
  image: "vscode-icons:file-type-image",
  java: "vscode-icons:file-type-java",
  javascript: "vscode-icons:file-type-js",
  json: "vscode-icons:file-type-json",
  jsonc: "vscode-icons:file-type-json",
  jsx: "vscode-icons:file-type-jsx",
  kotlin: "vscode-icons:file-type-kotlin",
  lua: "vscode-icons:file-type-lua",
  makefile: "vscode-icons:file-type-makefile",
  markdown: "vscode-icons:file-type-markdown",
  md: "vscode-icons:file-type-markdown",
  mdx: "vscode-icons:file-type-markdown",
  php: "vscode-icons:file-type-php",
  prisma: "vscode-icons:file-type-light-prisma",
  python: "vscode-icons:file-type-python",
  ruby: "vscode-icons:file-type-ruby",
  rust: "vscode-icons:file-type-rust",
  sass: "vscode-icons:file-type-sass",
  scss: "vscode-icons:file-type-scss",
  shell: "vscode-icons:file-type-shell",
  sql: "vscode-icons:file-type-sql",
  svelte: "vscode-icons:file-type-svelte",
  svg: "vscode-icons:file-type-svg",
  swift: "vscode-icons:file-type-swift",
  text: "vscode-icons:file-type-text",
  toml: "vscode-icons:file-type-toml",
  ts: "vscode-icons:file-type-typescript",
  tsx: "vscode-icons:file-type-typescript",
  typescript: "vscode-icons:file-type-typescript",
  vue: "vscode-icons:file-type-vue",
  xml: "vscode-icons:file-type-xml",
  yaml: "vscode-icons:file-type-yaml",
  yml: "vscode-icons:file-type-yaml",
  zig: "vscode-icons:file-type-zig",
  zsh: "vscode-icons:file-type-shell",
};

const extensionToLanguage: Record<string, string> = {
  bash: "bash",
  bmp: "image",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  css: "css",
  csv: "text",
  cxx: "cpp",
  dart: "dart",
  dockerfile: "dockerfile",
  env: "env",
  gif: "image",
  go: "go",
  graphql: "graphql",
  h: "c",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ico: "image",
  java: "java",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "javascript",
  kt: "kotlin",
  lock: "json",
  lua: "lua",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  png: "image",
  prisma: "prisma",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  svg: "svg",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vue: "vue",
  webp: "image",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "bash",
};

export function normalizeLanguage(language: string | undefined): string {
  if (!language) return "text";

  const normalized = language
    .replace(/^language-/, "")
    .replace(/^lang-/, "")
    .trim()
    .toLowerCase();

  return normalized || "text";
}

export function detectLanguageFromPath(path: string): string {
  const fileName = path.split("/").pop() ?? "";

  if (fileName.toLowerCase() === "dockerfile") return "dockerfile";
  if (fileName.toLowerCase() === "makefile") return "makefile";

  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  if (!ext) return "text";

  return extensionToLanguage[ext] ?? "text";
}

export function resolveTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function getShikiThemeName(theme: "light" | "dark") {
  return theme === "light" ? "github-light" : "github-dark";
}

export async function ensureLanguageLoaded(language: string) {
  const highlighter = await highlighterPromise;
  const languageKey = language as BundledLanguage;

  if (
    language !== "text" &&
    Object.hasOwn(bundledLanguages, languageKey) &&
    !highlighter.getLoadedLanguages().includes(languageKey)
  ) {
    await highlighter.loadLanguage(languageKey);
  }
}

export function isBundledLanguage(language: string): boolean {
  return Object.hasOwn(bundledLanguages, language as BundledLanguage);
}

export async function highlightToTokens(
  code: string,
  language: string,
  theme: "light" | "dark",
): Promise<ThemedToken[][]> {
  const highlighter = await highlighterPromise;
  await ensureLanguageLoaded(language);

  const lang = isBundledLanguage(language)
    ? (language as BundledLanguage)
    : ("text" as BundledLanguage);

  return highlighter.codeToTokensBase(code, {
    lang,
    theme: getShikiThemeName(theme),
  });
}
