"use client";

import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
} from "shiki";

const highlighterPromise = createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: [],
});

const highlightedHtmlCache = new Map<string, string>();
const MAX_HIGHLIGHT_CACHE_SIZE = 200;
const DEFAULT_MAX_LINES = 10;

const languageToVSCodeIcon: Record<string, string> = {
  bash: "vscode-icons:file-type-shell",
  c: "vscode-icons:file-type-c",
  cpp: "vscode-icons:file-type-cpp",
  css: "vscode-icons:file-type-css",
  docker: "vscode-icons:file-type-docker",
  dockerfile: "vscode-icons:file-type-docker",
  go: "vscode-icons:file-type-go",
  graphql: "vscode-icons:file-type-graphql",
  html: "vscode-icons:file-type-html",
  java: "vscode-icons:file-type-java",
  javascript: "vscode-icons:file-type-js",
  json: "vscode-icons:file-type-json",
  jsx: "vscode-icons:file-type-jsx",
  markdown: "vscode-icons:file-type-markdown",
  md: "vscode-icons:file-type-markdown",
  php: "vscode-icons:file-type-php",
  prisma: "vscode-icons:file-type-light-prisma",
  python: "vscode-icons:file-type-python",
  ruby: "vscode-icons:file-type-ruby",
  rust: "vscode-icons:file-type-rust",
  shell: "vscode-icons:file-type-shell",
  sql: "vscode-icons:file-type-sql",
  swift: "vscode-icons:file-type-swift",
  ts: "vscode-icons:file-type-typescript",
  tsx: "vscode-icons:file-type-tsx",
  typescript: "vscode-icons:file-type-typescript",
  vue: "vscode-icons:file-type-vue",
  xml: "vscode-icons:file-type-xml",
  yaml: "vscode-icons:file-type-yaml",
  yml: "vscode-icons:file-type-yaml",
  zsh: "vscode-icons:file-type-shell",
};

function setCachedHighlight(key: string, value: string) {
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

function normalizeLanguage(language: string | undefined) {
  if (!language) return "text";

  const normalized = language
    .replace(/^language-/, "")
    .replace(/^lang-/, "")
    .trim()
    .toLowerCase();

  return normalized || "text";
}

function getLineCount(text: string) {
  return text.split("\n").length;
}

function truncateCodeByLines(text: string, maxLines: number) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return text;
  }

  return lines.slice(0, maxLines).join("\n");
}

function resolveTheme() {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function useResolvedTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const syncTheme = () => setTheme(resolveTheme());
    const observer = new MutationObserver(syncTheme);

    observer.observe(root, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });
    syncTheme();

    return () => observer.disconnect();
  }, []);

  return theme;
}

export function CodeBlock({
  code,
  language,
  shouldHighlight = true,
}: {
  code: string;
  language?: string;
  shouldHighlight?: boolean;
}) {
  const theme = useResolvedTheme();
  const normalizedLanguage = useMemo(
    () => normalizeLanguage(language),
    [language],
  );
  const trimmedCode = useMemo(() => code.replace(/\n$/, ""), [code]);
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(!shouldHighlight);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const actualLanguage =
    normalizedLanguage === "text" ? null : normalizedLanguage;
  const lineCount = useMemo(() => getLineCount(trimmedCode), [trimmedCode]);
  const isCollapsible = lineCount > DEFAULT_MAX_LINES;
  const displayedCode = useMemo(() => {
    if (!isCollapsible || !isCollapsed) {
      return trimmedCode;
    }

    return truncateCodeByLines(trimmedCode, DEFAULT_MAX_LINES);
  }, [isCollapsed, isCollapsible, trimmedCode]);
  const languageIcon = actualLanguage
    ? (languageToVSCodeIcon[actualLanguage] ?? null)
    : null;

  useEffect(() => {
    setIsCollapsed(isCollapsible);
  }, [isCollapsible]);

  useEffect(() => {
    if (!shouldHighlight) {
      setHasBeenVisible(false);
      setHighlightedHtml(null);
      return;
    }

    const container = containerRef.current;
    if (!container || hasBeenVisible) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "240px 0px",
      },
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, [hasBeenVisible, shouldHighlight]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(trimmedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [trimmedCode]);

  useEffect(() => {
    if (!shouldHighlight || !hasBeenVisible) {
      return;
    }

    let isCancelled = false;

    const highlight = async () => {
      const cacheKey = `${theme}:${normalizedLanguage}:${displayedCode}`;
      const cachedHtml = highlightedHtmlCache.get(cacheKey);
      if (cachedHtml) {
        setHighlightedHtml(cachedHtml);
        return;
      }

      try {
        const highlighter = await highlighterPromise;
        const languageKey = normalizedLanguage as BundledLanguage;

        if (
          normalizedLanguage !== "text" &&
          Object.hasOwn(bundledLanguages, languageKey) &&
          !highlighter.getLoadedLanguages().includes(languageKey)
        ) {
          await highlighter.loadLanguage(languageKey);
        }

        const html = highlighter.codeToHtml(displayedCode, {
          lang: Object.hasOwn(bundledLanguages, languageKey)
            ? languageKey
            : "text",
          theme: theme === "light" ? "github-light" : "github-dark",
        });

        setCachedHighlight(cacheKey, html);
        if (!isCancelled) {
          setHighlightedHtml(html);
        }
      } catch {
        if (!isCancelled) {
          setHighlightedHtml(null);
        }
      }
    };

    void highlight();

    return () => {
      isCancelled = true;
    };
  }, [
    displayedCode,
    hasBeenVisible,
    normalizedLanguage,
    shouldHighlight,
    theme,
  ]);

  return (
    <div
      className="sentinel-code-block group relative my-2 w-full max-w-xl overflow-hidden rounded-2xl border border-border/50 bg-background shadow-[0_0_10px_0_rgba(0,0,0,0.01)] dark:border-border/50 dark:bg-surface/50 dark:shadow-none"
      ref={containerRef}
    >
      <div className="flex h-9 items-center justify-between border-b border-border/50 px-3 py-1.5">
        {actualLanguage ? (
          <div className="flex items-center gap-1">
            {languageIcon ? (
              <Icon className="text-md text-default-700" icon={languageIcon} />
            ) : null}
            <span className="select-none text-xs font-medium text-default-600">
              {actualLanguage.charAt(0).toUpperCase() + actualLanguage.slice(1)}
            </span>
          </div>
        ) : (
          <div />
        )}

        <button
          aria-label="Copy code"
          className="flex items-center justify-center cursor-pointer rounded-lg border border-border/20 bg-surface/50 dark:bg-background/70 p-1 hover:bg-surface/20 active:bg-surface"
          onClick={() => void handleCopy()}
          type="button"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={copied ? "copied" : "copy"}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              initial={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={copied ? Tick01Icon : Copy01Icon}
                size={12}
                strokeWidth={1.5}
              />
            </motion.div>
          </AnimatePresence>
        </button>
      </div>

      <div className="sentinel-shiki">
        {shouldHighlight && hasBeenVisible && highlightedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <pre>
            <code>{displayedCode}</code>
          </pre>
        )}
      </div>

      {isCollapsible ? (
        <div className="border-t border-border/50 px-3 py-1.5 text-center">
          <button
            className="inline-flex items-center rounded-full border border-border/50 bg-surface/20 px-3 py-1 text-xs text-default-600 hover:bg-surface/50 hover:text-default-800"
            onClick={() => setIsCollapsed((value) => !value)}
            type="button"
          >
            {isCollapsed
              ? `Show more (${lineCount - DEFAULT_MAX_LINES} lines)`
              : "Show less"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
