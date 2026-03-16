"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft02Icon,
  Attachment01Icon,
  Mail01Icon,
  MailOpen01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Chip,
  CloseButton,
  ScrollShadow,
  Separator,
  Spinner,
} from "@heroui/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { useRightSidebar } from "@/components/shell/shell-context";

type EmailResult = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  to?: string;
  cc?: string;
  body?: string;
  isUnread: boolean;
  isStarred: boolean;
  attachmentCount?: number;
};

type EmailDetail = {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  date: string;
  attachmentCount: number;
};

function extractName(from: string): string {
  const cleaned = from.replace(/"/g, "");
  const firstPart = cleaned.split("<")[0]?.trim();
  if (firstPart) return firstPart;
  const secondPart = cleaned.split("<")?.[1]?.trim();
  if (secondPart) return secondPart.split(">")[0] ?? secondPart;
  return cleaned;
}

function extractAddress(from: string) {
  const match = /<(.*)>/.exec(from);
  return match?.[1] ?? "";
}

function decodeSnippet(snippet?: string | null) {
  if (!snippet) return "";
  return snippet
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200C\u200D\uFEFF]/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function formatRelativeDate(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateString;
  }
}

function formatFullDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function buildEmailSrcDoc(content: string, isHtml: boolean) {
  const body = isHtml ? content : `<pre>${escapeHtml(content)}</pre>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <base target="_blank" />
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0; padding: 0;
        background: #ffffff; color: #111827;
        font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body { padding: 16px; word-break: break-word; overflow-wrap: anywhere; }
      pre { margin: 0; white-space: pre-wrap; font: inherit; }
      img, table, video { max-width: 100%; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function SenderInitial({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background border border-border/50 text-[11px] font-medium text-foreground/50">
      {letter}
    </div>
  );
}

const EmailRow = memo(function EmailRow({
  email,
  onSelect,
}: {
  email: EmailResult;
  onSelect: (email: EmailResult) => void;
}) {
  const name = extractName(email.from);

  return (
    <button
      type="button"
      onClick={() => onSelect(email)}
      className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-foreground/4"
    >
      <SenderInitial name={name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center ">
          <span
            className={`min-w-0 truncate text-[12.5px] ${email.isUnread ? "font-medium text-foreground" : "text-foreground/60"}`}
          >
            {name}
          </span>
          {email.isStarred ? (
            <HugeiconsIcon
              icon={StarIcon}
              size={11}
              strokeWidth={2}
              className="shrink-0 text-warning"
            />
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-foreground/30">
            {formatRelativeDate(email.date)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground/90">
          {email.subject || "(no subject)"}
        </p>

        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-foreground/38">
          {decodeSnippet(email.snippet)}
        </p>
      </div>
    </button>
  );
});

function EmailIframe({ body, subject }: { body: string; subject: string }) {
  const isHtml = looksLikeHtml(body);
  return (
    <iframe
      title={`Email: ${subject || "message"}`}
      className="h-full w-full border-0 bg-white"
      referrerPolicy="no-referrer"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={buildEmailSrcDoc(body, isHtml)}
    />
  );
}

function SidebarHeader({
  query,
  totalResults,
  selectedEmail,
  onBack,
  onClose,
}: {
  query: string;
  totalResults: number;
  selectedEmail: EmailResult | null;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-2">
      {selectedEmail ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl cursor-pointer text-foreground/50 transition-colors bg-background/50 border border-border/20 hover:text-foreground"
          aria-label="Back to results"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <IntegrationProviderIcon
          provider="gmail"
          className="h-4 w-4 shrink-0 ml-2"
        />
      )}

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {selectedEmail ? extractName(selectedEmail.from) : "Gmail"}
      </span>

      {!selectedEmail ? (
        <span className="shrink-0 text-[11px] text-foreground/35">
          {totalResults} result{totalResults !== 1 ? "s" : ""}
        </span>
      ) : null}

      <CloseButton aria-label="Close sidebar" onPress={onClose} />
    </header>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/4">
        <HugeiconsIcon
          icon={Mail01Icon}
          size={18}
          strokeWidth={1.6}
          className="text-foreground/30"
        />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium text-foreground/50">
          No emails found
        </p>
        <p className="mt-0.5 text-[11px] text-foreground/30">
          Try a different search query.
        </p>
      </div>
    </div>
  );
}

function ResultsView({
  emails,
  onSelect,
}: {
  emails: EmailResult[];
  onSelect: (email: EmailResult) => void;
}) {
  if (emails.length === 0) return <EmptyState />;

  return (
    <ScrollShadow className="h-full px-1.5 py-1" orientation="vertical">
      <div className="flex flex-col">
        {emails.map((email, index) => (
          <div key={email.id}>
            <EmailRow email={email} onSelect={onSelect} />
            {index < emails.length - 1 ? (
              <Separator className="my-0.5 ml-10" variant="tertiary" />
            ) : null}
          </div>
        ))}
      </div>
    </ScrollShadow>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11.5px]">
      <span className="w-3 shrink-0 text-right text-foreground/35">
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground/60">{value}</span>
    </div>
  );
}

function EmailView({
  email,
  detail,
  isLoading,
  error,
}: {
  email: EmailResult;
  detail: EmailDetail | null;
  isLoading: boolean;
  error: string | null;
}) {
  const from = detail?.from ?? email.from;
  const to = detail?.to ?? email.to ?? "";
  const cc = detail?.cc ?? email.cc ?? "";
  const subject = detail?.subject ?? email.subject;
  const date = detail?.date ?? email.date;
  const attachments = detail?.attachmentCount ?? email.attachmentCount ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <SenderInitial name={extractName(from)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12.5px] font-medium text-foreground">
                {extractName(from)}
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-foreground/30">
                {formatRelativeDate(date)}
              </span>
            </div>
            {extractAddress(from) ? (
              <p className="truncate text-[11px] text-foreground/35">
                {extractAddress(from)}
              </p>
            ) : null}
          </div>
        </div>

        <h3 className="text-[13.5px] font-medium text-foreground">
          {subject || "(no subject)"}
        </h3>

        <div className="space-y-0.5">
          {to ? <MetaRow label="To" value={to} /> : null}
          {cc ? <MetaRow label="Cc" value={cc} /> : null}
          <MetaRow label="" value={formatFullDate(date)} />
        </div>

        {attachments > 0 || email.isUnread ? (
          <div className="flex items-center gap-1.5">
            {email.isUnread ? (
              <Chip size="sm" color="accent" variant="soft">
                <HugeiconsIcon
                  icon={MailOpen01Icon}
                  size={11}
                  strokeWidth={1.8}
                />
                <Chip.Label>Unread</Chip.Label>
              </Chip>
            ) : null}
            {attachments > 0 ? (
              <Chip size="sm" variant="tertiary">
                <HugeiconsIcon
                  icon={Attachment01Icon}
                  size={11}
                  strokeWidth={1.8}
                />
                <Chip.Label>
                  {attachments} file{attachments !== 1 ? "s" : ""}
                </Chip.Label>
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>

      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1 bg-background">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="sm" color="current" className="text-foreground/30" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[12px] font-medium text-danger">
              Failed to load email
            </p>
            <p className="text-[11px] text-foreground/35">{error}</p>
          </div>
        ) : detail?.body ? (
          <EmailIframe body={detail.body} subject={subject} />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-[12px] text-foreground/35">
              No content available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export const GmailSearchSidebar = memo(function GmailSearchSidebar({
  query,
  emails,
  totalResults,
}: {
  query: string;
  emails: EmailResult[];
  totalResults: number;
}) {
  const { close } = useRightSidebar();
  const [selectedEmail, setSelectedEmail] = useState<EmailResult | null>(null);
  const [emailDetails, setEmailDetails] = useState<Record<string, EmailDetail>>(
    {},
  );
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({});
  const [loadingEmailId, setLoadingEmailId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedEmail((current) => {
      if (!current) return null;
      return emails.find((email) => email.id === current.id) ?? null;
    });
  }, [emails]);

  useEffect(() => {
    if (!selectedEmail || emailDetails[selectedEmail.id]) return;

    const controller = new AbortController();
    const selectedId = selectedEmail.id;

    setLoadingEmailId(selectedId);
    setEmailErrors((current) => {
      if (!(selectedId in current)) return current;
      const next = { ...current };
      delete next[selectedId];
      return next;
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/integrations/gmail/messages/${encodeURIComponent(selectedId)}`,
          { cache: "no-store", signal: controller.signal },
        );

        const data = (await response.json()) as
          | ({ error?: string } & Partial<EmailDetail>)
          | undefined;

        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to fetch Gmail message.");
        }

        setEmailDetails((current) => ({
          ...current,
          [selectedId]: {
            attachmentCount:
              data?.attachmentCount ?? selectedEmail.attachmentCount ?? 0,
            body: data?.body ?? "",
            cc: data?.cc ?? "",
            date: data?.date ?? selectedEmail.date,
            from: data?.from ?? selectedEmail.from,
            id: selectedId,
            subject: data?.subject ?? selectedEmail.subject,
            to: data?.to ?? selectedEmail.to ?? "",
          },
        }));
      } catch (error) {
        if (controller.signal.aborted) return;

        setEmailErrors((current) => ({
          ...current,
          [selectedId]:
            error instanceof Error
              ? error.message
              : "Unable to load the email body.",
        }));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingEmailId((current) =>
            current === selectedId ? null : current,
          );
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [emailDetails, selectedEmail]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  const handleBack = useCallback(() => {
    setSelectedEmail(null);
  }, []);

  const selectedEmailDetail = selectedEmail
    ? (emailDetails[selectedEmail.id] ?? null)
    : null;
  const selectedEmailError = selectedEmail
    ? (emailErrors[selectedEmail.id] ?? null)
    : null;
  const isSelectedEmailLoading = selectedEmail
    ? loadingEmailId === selectedEmail.id
    : false;

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <SidebarHeader
        query={query}
        totalResults={totalResults}
        selectedEmail={selectedEmail}
        onBack={handleBack}
        onClose={handleClose}
      />
      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        {selectedEmail ? (
          <EmailView
            email={selectedEmail}
            detail={selectedEmailDetail}
            error={selectedEmailError}
            isLoading={isSelectedEmailLoading}
          />
        ) : (
          <ResultsView emails={emails} onSelect={setSelectedEmail} />
        )}
      </div>
    </div>
  );
});
