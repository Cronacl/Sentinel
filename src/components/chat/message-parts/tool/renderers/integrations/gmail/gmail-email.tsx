"use client";

import { memo, useMemo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type EmailOutput = {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  date: string;
  attachments: Array<{ filename: string; mimeType: string; size: number }>;
};

function buildEmailSrcDoc(body: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body {
    margin: 0; padding: 0;
    background: transparent !important;
    color: rgba(255,255,255,0.8);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    overflow-x: hidden;
    word-break: break-word;
  }
  a { color: #60a5fa; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100% !important; }
  * { max-width: 100% !important; box-sizing: border-box; }
</style></head><body>${body}</body></html>`;
}

export const GmailEmailTool = memo(function GmailEmailTool({
  part,
}: RendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as EmailOutput) : null;

  const srcDoc = useMemo(
    () => (output?.body ? buildEmailSrcDoc(output.body) : ""),
    [output?.body],
  );

  const summary = isRunning
    ? "Reading email…"
    : hasOutput && output
      ? `Email: ${output.subject || "(no subject)"}`
      : isError
        ? "Failed to read email"
        : "Reading email…";

  return (
    <IntegrationToolLayout
      provider="Gmail"
      providerIcon={
        <IntegrationProviderIcon provider="gmail" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable={Boolean(output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      footer={
        output?.attachments?.length ? (
          <span className="flex items-center gap-1">
            <Icon icon="solar:paperclip-2-linear" className="h-3 w-3" />
            {output.attachments.length} attachment
            {output.attachments.length !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
    >
      {output ? (
        <div className="space-y-3">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:user-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">{output.from}</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:users-group-rounded-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground">{output.to}</span>
            </div>
            {output.cc ? (
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:copy-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <span className="text-foreground">{output.cc}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:clock-circle-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground/70">{output.date}</span>
            </div>
          </div>

          <div className="border-t border-border/30 pt-2">
            <iframe
              srcDoc={srcDoc}
              sandbox="allow-popups"
              className="w-full border-0"
              style={{
                height: 320,
                background: "transparent",
                colorScheme: "dark",
              }}
              title="Email body"
            />
          </div>

          {output.attachments?.length ? (
            <div className="space-y-1.5 border-t border-border/30 pt-2">
              <div className="flex items-center gap-1 text-[10px] font-medium text-foreground/50">
                <Icon icon="solar:paperclip-2-linear" className="h-3 w-3" />
                <span>Attachments</span>
              </div>
              {output.attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-foreground/5 px-2 py-1 text-[11px] text-foreground/60"
                >
                  <Icon
                    icon="solar:file-linear"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="truncate">{att.filename}</span>
                  <span className="ml-auto shrink-0 text-foreground/30">
                    {Math.round(att.size / 1024)}KB
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
