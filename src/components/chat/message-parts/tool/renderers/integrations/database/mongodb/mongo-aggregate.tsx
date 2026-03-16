"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../../renderer";
import { DbDocumentSidebar } from "../shared/db-query-sidebar";

type AggregateInput = {
  collection?: string;
  pipeline?: object[];
  database?: string;
};

type AggregateOutput = {
  documents: Record<string, unknown>[];
};

export const MongoAggregateTool = memo(function MongoAggregateTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part
      ? (part.output as AggregateOutput)
      : null;
  const input = "input" in part ? (part.input as AggregateInput) : null;

  const documents = output?.documents ?? [];
  const canOpen = documents.length > 0;

  const pipelineStr = input?.pipeline
    ? JSON.stringify(input.pipeline, null, 2)
    : "[]";

  const handleOpenSidebar = useCallback(() => {
    if (!canOpen) return;
    open(
      <DbDocumentSidebar
        provider="mongodb"
        providerLabel="MongoDB"
        title={`${input?.collection ?? "Collection"} Aggregation`}
        query={pipelineStr}
        documents={documents}
        count={documents.length}
      />,
    );
  }, [open, canOpen, input?.collection, pipelineStr, documents]);

  const label = (() => {
    if (isError) return "MongoDB: Aggregation failed";
    if (isRunning) {
      return input?.collection
        ? `MongoDB: Aggregating ${input.collection}...`
        : "MongoDB: Running aggregation...";
    }
    if (output) {
      return `MongoDB: ${documents.length} result${documents.length !== 1 ? "s" : ""} from ${input?.collection ?? "collection"} aggregation`;
    }
    return "MongoDB: Aggregate";
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
