"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../../renderer";
import type { ToolPart } from "../../../../../types";
import { DbQuerySidebar } from "./db-query-sidebar";

type QueryOutput = {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: { name: string; dataType: string }[];
};

export function createDbQueryTool(provider: string, providerLabel: string) {
  return memo(function DbQueryTool({ part }: RendererProps) {
    const { open } = useRightSidebar();

    const isRunning =
      part.state === "input-streaming" || part.state === "input-available";
    const isError = part.state === "output-error";
    const hasOutput = part.state === "output-available";

    const output =
      hasOutput && "output" in part ? (part.output as QueryOutput) : null;
    const input =
      "input" in part
        ? (part.input as { sql?: string; database?: string })
        : null;

    const canOpen = Boolean(output && output.rows.length > 0);

    const handleOpenSidebar = useCallback(() => {
      if (!output) return;
      open(
        <DbQuerySidebar
          provider={provider}
          providerLabel={providerLabel}
          title="Query Results"
          query={input?.sql ?? ""}
          language="sql"
          rows={output.rows}
          rowCount={output.rowCount}
          fields={output.fields}
        />,
      );
    }, [open, output, input?.sql]);

    const truncatedSql =
      input?.sql && input.sql.length > 60
        ? `${input.sql.slice(0, 60)}...`
        : input?.sql;

    const label = (() => {
      if (isError) return `${providerLabel}: Query failed`;
      if (isRunning) {
        return truncatedSql
          ? `${providerLabel}: Running query...`
          : `${providerLabel}: Running query...`;
      }
      if (output) {
        return `${providerLabel}: ${output.rowCount} row${output.rowCount !== 1 ? "s" : ""} returned`;
      }
      return `${providerLabel}: Query`;
    })();

    return (
      <button
        type="button"
        disabled={!canOpen}
        onClick={handleOpenSidebar}
        className={`group flex w-full items-center gap-2 text-left text-[13px] ${
          isError
            ? "text-danger"
            : isRunning
              ? "sentinel-thinking-shimmer"
              : "text-foreground/70"
        } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
      >
        <IntegrationProviderIcon
          provider={provider}
          className="h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">{label}</span>
        {canOpen ? (
          <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
            View &rsaquo;
          </span>
        ) : null}
      </button>
    );
  });
}
