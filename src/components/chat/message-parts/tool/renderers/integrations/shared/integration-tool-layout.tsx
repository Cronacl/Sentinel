"use client";

import { type ReactNode, memo } from "react";
import { ToolLayout } from "../../shared/tool-layout";

type IntegrationToolLayoutProps = {
  provider: string;
  providerIcon: ReactNode;
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

export const IntegrationToolLayout = memo(function IntegrationToolLayout({
  providerIcon,
  summary,
  ...props
}: IntegrationToolLayoutProps) {
  return (
    <ToolLayout
      summary={
        <span className="inline-flex items-center gap-1.5">
          <span className="shrink-0 text-[13px]">{providerIcon}</span>
          {summary}
        </span>
      }
      {...props}
    />
  );
});
