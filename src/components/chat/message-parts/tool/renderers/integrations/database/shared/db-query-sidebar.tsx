"use client";

import { memo, useCallback, useMemo } from "react";
import { Chip, CloseButton, ScrollShadow, Separator } from "@heroui/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { CodeBlock } from "@/components/chat/message-parts/text/code-block";

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
                className="whitespace-nowrap px-3 py-2 text-[11px] font-medium text-foreground/50"
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
                className="whitespace-nowrap px-3 py-2 text-[11px] font-medium text-foreground/50"
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

  const handleClose = useCallback(() => close(), [close]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider={provider}
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {title}
        </span>
        {rowCount !== undefined ? (
          <span className="shrink-0 text-[11px] text-foreground/35">
            {rowCount} row{rowCount !== 1 ? "s" : ""}
          </span>
        ) : null}
        <CloseButton aria-label="Close sidebar" onPress={handleClose} />
      </header>

      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        <ScrollShadow className="h-full px-3 py-3" orientation="vertical">
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-foreground/40">
                {language === "sql" ? "Query" : "Operation"}
              </span>
              <CodeBlock code={query} language={language} />
            </div>

            {rows ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-foreground/40">
                    Results
                  </span>
                  {rowCount !== undefined ? (
                    <Chip size="sm" variant="soft" className="h-5 text-[10px]">
                      {rowCount}
                    </Chip>
                  ) : null}
                </div>
                <ScrollShadow orientation="horizontal">
                  <DataTable rows={rows} fields={fields} />
                </ScrollShadow>
              </div>
            ) : null}
          </div>
        </ScrollShadow>
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

  const handleClose = useCallback(() => close(), [close]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        <IntegrationProviderIcon
          provider={provider}
          className="h-4 w-4 shrink-0 ml-2"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {title}
        </span>
        {count !== undefined ? (
          <span className="shrink-0 text-[11px] text-foreground/35">
            {count} document{count !== 1 ? "s" : ""}
          </span>
        ) : null}
        <CloseButton aria-label="Close sidebar" onPress={handleClose} />
      </header>

      <Separator variant="tertiary" />

      <div className="min-h-0 flex-1">
        <ScrollShadow className="h-full px-3 py-3" orientation="vertical">
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-foreground/40">
                Operation
              </span>
              <CodeBlock code={query} language="json" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-foreground/40">
                  Documents
                </span>
                {count !== undefined ? (
                  <Chip size="sm" variant="soft" className="h-5 text-[10px]">
                    {count}
                  </Chip>
                ) : null}
              </div>
              <ScrollShadow orientation="horizontal">
                <DocumentTable documents={documents} />
              </ScrollShadow>
            </div>
          </div>
        </ScrollShadow>
      </div>
    </div>
  );
});
