"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Chip, ScrollShadow } from "@heroui/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type QueryField = { name: string; dataType: string };

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function DataTable({
  rows,
  fields,
}: {
  rows: Record<string, unknown>[];
  fields?: QueryField[];
}) {
  const columns = useMemo(() => {
    if (fields && fields.length > 0) return fields.map((f) => f.name);
    if (rows.length > 0) return Object.keys(rows[0]!);
    return [];
  }, [rows, fields]);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-foreground/30">
        No rows returned
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border/30">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-border/30 bg-surface/40">
            {columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-foreground/50"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border/20 last:border-0 hover:bg-foreground/3"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className="max-w-[240px] truncate whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-foreground/70"
                  title={formatCellValue(row[col])}
                >
                  {row[col] === null || row[col] === undefined ? (
                    <span className="italic text-foreground/25">NULL</span>
                  ) : (
                    formatCellValue(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentTable({
  documents,
}: {
  documents: Record<string, unknown>[];
}) {
  const columns = useMemo(() => {
    if (documents.length === 0) return [];
    const keys = new Set<string>();
    for (const doc of documents.slice(0, 20)) {
      for (const key of Object.keys(doc)) keys.add(key);
    }
    return Array.from(keys);
  }, [documents]);

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-foreground/30">
        No documents returned
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border/30">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-border/30 bg-surface/40">
            {columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-foreground/50"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, i) => (
            <tr
              key={i}
              className="border-b border-border/20 last:border-0 hover:bg-foreground/3"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className="max-w-[240px] truncate whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-foreground/70"
                  title={formatCellValue(doc[col])}
                >
                  {doc[col] === null || doc[col] === undefined ? (
                    <span className="italic text-foreground/25">NULL</span>
                  ) : (
                    formatCellValue(doc[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const DbQuerySidebar = memo(function DbQuerySidebar({
  provider,
  providerLabel,
  title,
  query,
  language,
  rows,
  rowCount,
  fields,
}: {
  provider: string;
  providerLabel: string;
  title: string;
  query: string;
  language: "sql" | "json";
  rows?: Record<string, unknown>[];
  rowCount?: number;
  fields?: QueryField[];
}) {
  const { close } = useRightSidebar();
  const [copied, setCopied] = useState(false);

  const handleClose = useCallback(() => close(), [close]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [query]);

  return (
    <div className="flex h-full w-full flex-col bg-transparent px-7 pb-6 pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IntegrationProviderIcon
              provider={provider}
              className="h-5 w-5"
            />
            <h2 className="text-[22px] font-medium text-foreground/78">
              {title}
            </h2>
          </div>
          <p className="mt-1.5 text-[13px] text-muted/90">
            {rowCount !== undefined
              ? `${rowCount} row${rowCount !== 1 ? "s" : ""} returned`
              : "Results"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted/60">
            via {providerLabel}
          </p>
        </div>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted/80 transition-colors hover:text-foreground/80"
          onClick={handleClose}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-scroll-shell min-h-0 flex-1">
        <div className="sentinel-scroll-area flex h-full flex-col gap-4 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                {language === "sql" ? "Query" : "Operation"}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                <Icon
                  icon={
                    copied
                      ? "solar:check-circle-linear"
                      : "solar:copy-linear"
                  }
                  className="h-3 w-3"
                />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="overflow-auto rounded-lg border border-border/30 bg-surface/40 px-3 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                {query}
              </pre>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Results
              </span>
              {rowCount !== undefined ? (
                <Chip
                  size="sm"
                  variant="soft"
                  className="h-5 text-[10px]"
                >
                  {rowCount}
                </Chip>
              ) : null}
            </div>
            {rows ? (
              <ScrollShadow orientation="horizontal">
                <DataTable rows={rows} fields={fields} />
              </ScrollShadow>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

export const DbDocumentSidebar = memo(function DbDocumentSidebar({
  provider,
  providerLabel,
  title,
  query,
  documents,
  count,
}: {
  provider: string;
  providerLabel: string;
  title: string;
  query: string;
  documents: Record<string, unknown>[];
  count?: number;
}) {
  const { close } = useRightSidebar();
  const [copied, setCopied] = useState(false);

  const handleClose = useCallback(() => close(), [close]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [query]);

  return (
    <div className="flex h-full w-full flex-col bg-transparent px-7 pb-6 pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IntegrationProviderIcon
              provider={provider}
              className="h-5 w-5"
            />
            <h2 className="text-[22px] font-medium text-foreground/78">
              {title}
            </h2>
          </div>
          <p className="mt-1.5 text-[13px] text-muted/90">
            {count !== undefined
              ? `${count} document${count !== 1 ? "s" : ""}`
              : "Results"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted/60">
            via {providerLabel}
          </p>
        </div>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted/80 transition-colors hover:text-foreground/80"
          onClick={handleClose}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <div className="sentinel-scroll-shell min-h-0 flex-1">
        <div className="sentinel-scroll-area flex h-full flex-col gap-4 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Operation
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors"
              >
                <Icon
                  icon={
                    copied
                      ? "solar:check-circle-linear"
                      : "solar:copy-linear"
                  }
                  className="h-3 w-3"
                />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="overflow-auto rounded-lg border border-border/30 bg-surface/40 px-3 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                {query}
              </pre>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Documents
              </span>
              {count !== undefined ? (
                <Chip
                  size="sm"
                  variant="soft"
                  className="h-5 text-[10px]"
                >
                  {count}
                </Chip>
              ) : null}
            </div>
            <ScrollShadow orientation="horizontal">
              <DocumentTable documents={documents} />
            </ScrollShadow>
          </div>
        </div>
      </div>
    </div>
  );
});
