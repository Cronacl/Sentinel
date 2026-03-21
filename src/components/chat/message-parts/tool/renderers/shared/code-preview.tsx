"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollShadow } from "@heroui/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";

import {
  detectLanguageFromPath,
  highlightToTokens,
  languageToVSCodeIcon,
  type ThemedToken,
} from "@/lib/syntax/highlighter";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";

type LineData = {
  number: number;
  text: string;
};

function tokenLinesToSegments(
  tokenLines: ThemedToken[][] | null,
): Array<Array<{ color?: string; text: string }>> {
  if (!tokenLines) return [];
  return tokenLines.map((tokens) =>
    tokens.map((t) => ({ color: t.color, text: t.content })),
  );
}

function SyntaxLine({
  segments,
  fallbackText,
}: {
  fallbackText: string;
  segments?: Array<{ color?: string; text: string }>;
}) {
  if (!segments) {
    return <span>{fallbackText}</span>;
  }

  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={seg.color ? { color: seg.color } : undefined}>
          {seg.text}
        </span>
      ))}
    </>
  );
}

export function CodePreview({
  code,
  language: languageOverride,
  lines,
  maxHeight = "max-h-[300px]",
  path,
  showHeader = true,
  showLineNumbers = true,
}: {
  code?: string;
  language?: string;
  lines?: LineData[];
  maxHeight?: string;
  path: string;
  showHeader?: boolean;
  showLineNumbers?: boolean;
}) {
  const theme = useResolvedTheme();
  const [copied, setCopied] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [syntaxLines, setSyntaxLines] = useState<
    Array<Array<{ color?: string; text: string }>>
  >([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const language = languageOverride ?? detectLanguageFromPath(path);
  const fileIcon = languageToVSCodeIcon[language] ?? null;
  const fileName = path.split("/").pop() ?? path;
  const isFullPath = path.includes("/");

  const codeLines = useMemo(() => {
    if (lines) return lines;
    if (!code) return [];
    return code.split("\n").map((text, i) => ({ number: i + 1, text }));
  }, [code, lines]);

  const rawCode = useMemo(
    () => codeLines.map((l) => l.text).join("\n"),
    [codeLines],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [hasBeenVisible]);

  useEffect(() => {
    if (!hasBeenVisible || language === "text" || codeLines.length === 0)
      return;

    let cancelled = false;

    const run = async () => {
      try {
        const tokens = await highlightToTokens(rawCode, language, theme);
        if (!cancelled) {
          setSyntaxLines(tokenLinesToSegments(tokens));
        }
      } catch {
        // best-effort
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [hasBeenVisible, language, theme, rawCode, codeLines.length]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(rawCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [rawCode]);

  const gutterWidth =
    codeLines.length > 0
      ? `${Math.max(3, String(codeLines[codeLines.length - 1]!.number).length) * 8 + 16}px`
      : "32px";

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg border border-border/40"
    >
      {showHeader ? (
        <div className="flex items-center justify-between border-b border-border/30 bg-foreground/2 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {fileIcon ? (
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-foreground/50"
                icon={fileIcon}
              />
            ) : null}
            <span
              className="truncate font-mono text-[11px] text-foreground/50"
              title={path}
            >
              {isFullPath ? (
                <>
                  <span className="text-foreground/30">
                    {path.slice(0, path.length - fileName.length)}
                  </span>
                  <span className="text-foreground/60">{fileName}</span>
                </>
              ) : (
                <span className="text-foreground/60">{path}</span>
              )}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] text-foreground/30">
              {codeLines.length} line{codeLines.length !== 1 ? "s" : ""}
            </span>
            <button
              aria-label="Copy code"
              className="flex cursor-pointer items-center justify-center rounded p-0.5 text-foreground/30 transition-colors hover:text-foreground/60"
              onClick={() => void handleCopy()}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={copied ? Tick01Icon : Copy01Icon}
                size={11}
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>
      ) : null}

      <ScrollShadow className={`${maxHeight} overflow-x-auto`}>
        <div className="font-mono text-[11px] leading-[18px]">
          {codeLines.map((line, idx) => (
            <div key={`${line.number}-${idx}`} className="flex">
              {showLineNumbers ? (
                <span
                  className="shrink-0 select-none border-r border-border/15 pr-1.5 text-right text-[10px] leading-[18px] text-foreground/15"
                  style={{
                    width: gutterWidth,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {line.number}
                </span>
              ) : null}
              <span className="whitespace-pre pl-3 pr-3">
                <SyntaxLine
                  fallbackText={line.text}
                  segments={syntaxLines[idx]}
                />
              </span>
            </div>
          ))}
        </div>
      </ScrollShadow>
    </div>
  );
}
