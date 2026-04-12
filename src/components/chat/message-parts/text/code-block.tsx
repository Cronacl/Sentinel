"use client";

import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  highlightToTokensCached,
  tokenLinesToSegments,
  isBundledLanguage,
  languageToVSCodeIcon,
  normalizeLanguage,
  ensureLanguageLoaded,
  type SyntaxSegment,
} from "@/lib/syntax/highlighter";
import { writeTextToClipboard } from "@/lib/desktop/permissions";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

const DEFAULT_MAX_LINES = 10;

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
  const [syntaxLines, setSyntaxLines] = useState<SyntaxSegment[][]>([]);
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
    ? (languageToVSCodeIcon[actualLanguage] ?? "vscode-icons:default-file")
    : null;
  const codeSurfaceStyle = useMemo(
    () =>
      ({
        backgroundColor: "var(--syntax-background)",
        color: "var(--syntax-foreground)",
      }) as const,
    [],
  );

  useEffect(() => {
    setIsCollapsed(isCollapsible);
  }, [isCollapsible]);

  useEffect(() => {
    if (!shouldHighlight) {
      setHasBeenVisible(false);
      setSyntaxLines([]);
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
    const didCopy = await writeTextToClipboard(trimmedCode, {
      errorMessage: "Unable to copy this code block.",
    });
    if (!didCopy) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [trimmedCode]);

  useEffect(() => {
    if (!shouldHighlight || !hasBeenVisible) {
      return;
    }

    let isCancelled = false;

    const highlight = async () => {
      try {
        await ensureLanguageLoaded(normalizedLanguage);
        const tokens = await highlightToTokensCached(
          displayedCode,
          normalizedLanguage,
          theme,
        );
        if (!isCancelled) {
          setSyntaxLines(tokenLinesToSegments(tokens));
        }
      } catch {
        if (!isCancelled) {
          setSyntaxLines([]);
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
          <HugeiconsIcon
            color="currentColor"
            icon={copied ? Tick01Icon : Copy01Icon}
            size={12}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-shiki">
        {shouldHighlight && hasBeenVisible && syntaxLines.length > 0 ? (
          <div className="overflow-x-auto px-2 py-2" style={codeSurfaceStyle}>
            <div className="font-mono text-[11px] leading-[18px]">
              {displayedCode.split("\n").map((line, index) => (
                <div className="whitespace-pre" key={`${index}-${line}`}>
                  {(syntaxLines[index] ?? [{ text: line }]).map(
                    (seg, segIdx) => (
                      <span
                        key={segIdx}
                        style={seg.color ? { color: seg.color } : undefined}
                      >
                        {seg.text}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <pre
            className="m-0 overflow-x-auto px-2 py-2 font-mono text-[11px] leading-[18px]"
            style={codeSurfaceStyle}
          >
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
