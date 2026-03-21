"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../../renderer";
import { DbDocumentSidebar } from "../shared/db-query-sidebar";

type FindInput = {
  collection?: string;
  query?: object;
  sort?: object;
  projection?: object;
  limit?: number;
  skip?: number;
  database?: string;
};

type FindOutput = {
  documents: Record<string, unknown>[];
  count: number;
};

type FindOneOutput = {
  document: Record<string, unknown> | null;
};

export const MongoFindTool = memo(function MongoFindTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part
      ? (part.output as FindOutput | FindOneOutput)
      : null;
  const input = "input" in part ? (part.input as FindInput) : null;

  const documents: Record<string, unknown>[] = (() => {
    if (!output) return [];
    if ("documents" in output) return output.documents;
    if ("document" in output && output.document) return [output.document];
    return [];
  })();

  const count = output && "count" in output ? output.count : documents.length;
  const canOpen = documents.length > 0;

  const queryStr = input?.query ? JSON.stringify(input.query, null, 2) : "{}";

  const handleOpenSidebar = useCallback(() => {
    if (!canOpen) return;
    open(
      <DbDocumentSidebar
        provider="mongodb"
        providerLabel="MongoDB"
        title={`${input?.collection ?? "Collection"} Results`}
        query={queryStr}
        documents={documents}
        count={count}
      />,
    );
  }, [open, canOpen, input?.collection, queryStr, documents, count]);

  const label = (() => {
    if (isError) return "MongoDB: Find failed";
    if (isRunning) {
      return input?.collection
        ? `MongoDB: Querying ${input.collection}...`
        : "MongoDB: Finding documents...";
    }
    if (output) {
      return `MongoDB: ${count} document${count !== 1 ? "s" : ""} from ${input?.collection ?? "collection"}`;
    }
    return "MongoDB: Find";
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
        provider="mongodb"
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
