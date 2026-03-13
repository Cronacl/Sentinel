"use client";

import type { ReactNode } from "react";
import { Disclosure } from "@heroui/react";

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

export function ToolLayout({
  summary,
  isRunning,
  isError,
  isExpandable = true,
  isExpanded,
  onExpandedChange,
  children,
  footer,
  actions,
  errorText,
}: ToolLayoutProps) {
  const hasContent = Boolean(children);
  const canToggle = isExpandable && hasContent;

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
    <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <div>
        {canToggle ? (
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex w-full items-center gap-2 text-left">
              {headerContent}
            </Disclosure.Trigger>
          </Disclosure.Heading>
        ) : (
          <div className="flex items-center gap-2">
            {headerContent}
          </div>
        )}

        {actions ? <div className="mt-1 ml-5">{actions}</div> : null}

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="mt-1 overflow-hidden rounded-xl border border-border/40 bg-surface/20">
              <div className="px-3 py-2">{children}</div>
              {footer ? (
                <div className="border-t border-border/30 px-3 py-1.5 text-[10px] text-foreground/50">
                  {footer}
                </div>
              ) : null}
            </div>
          </Disclosure.Body>
        </Disclosure.Content>

        {errorText ? (
          <div className="mt-1 rounded-lg border border-danger/20 bg-danger-soft px-3 py-1.5 text-[11px] text-danger-soft-foreground">
            {errorText}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
}
