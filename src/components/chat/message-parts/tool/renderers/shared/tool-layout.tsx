"use client";

import { type ReactNode, memo, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

type ToolLayoutProps = {
  summary: ReactNode;
  isRunning?: boolean;
  isError?: boolean;
  isExpandable?: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  errorText?: string;
};

export const ToolLayout = memo(function ToolLayout({
  summary,
  isRunning,
  isError,
  isExpandable = true,
  isExpanded: _isExpanded,
  onExpandedChange,
  children,
  footer,
  actions,
  errorText,
}: ToolLayoutProps) {
  const hasContent = Boolean(children);
  const canToggle = isExpandable && hasContent;
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const effectiveExpanded = canToggle ? (userExpanded ?? false) : false;
  const prefersReducedMotion = useReducedMotion();
  const [shouldRenderContent, setShouldRenderContent] =
    useState(effectiveExpanded);

  useEffect(() => {
    if (effectiveExpanded) {
      setShouldRenderContent(true);
      return;
    }

    if (prefersReducedMotion) {
      setShouldRenderContent(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShouldRenderContent(false);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [effectiveExpanded, prefersReducedMotion]);

  const headerContent = (
    <p
      className={`min-w-0 flex-1 text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      }`}
    >
      {summary}
    </p>
  );

  return (
    <div>
      {canToggle ? (
        <button
          className="flex w-full items-center gap-2 text-left"
          onClick={() => {
            const nextExpanded = !effectiveExpanded;
            setUserExpanded(nextExpanded);
            onExpandedChange(nextExpanded);
          }}
          type="button"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-center gap-2">{headerContent}</div>
      )}

      {actions ? <div className="mt-1 ml-5">{actions}</div> : null}

      {canToggle ? (
        <div
          aria-hidden={!effectiveExpanded}
          className="grid transition-[grid-template-rows,opacity,margin] duration-180 ease-out"
          style={{
            gridTemplateRows: effectiveExpanded ? "1fr" : "0fr",
            marginTop: effectiveExpanded ? "0.25rem" : "0rem",
            opacity: effectiveExpanded ? 1 : 0,
            transitionDuration: prefersReducedMotion ? "0ms" : undefined,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            {shouldRenderContent ? (
              <div
                className="rounded-xl border border-border/40 bg-surface/20"
                style={{
                  contain: "layout paint style",
                  contentVisibility: effectiveExpanded ? "visible" : "auto",
                }}
              >
                <div className="px-3 py-2">{children}</div>
                {footer ? (
                  <div className="border-t border-border/30 px-3 py-1.5 text-[10px] text-foreground/50">
                    {footer}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {errorText ? (
        <div className="mt-1 rounded-lg border border-danger/20 bg-danger-soft px-3 py-1.5 text-[11px] text-danger-soft-foreground">
          {errorText}
        </div>
      ) : null}
    </div>
  );
});
