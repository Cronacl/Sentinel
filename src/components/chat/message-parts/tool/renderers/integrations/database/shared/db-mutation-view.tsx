"use client";

import { memo, useEffect, useState } from "react";
import { Chip } from "@heroui/react";

import type { RendererProps } from "../../../../renderer";
import type { ToolPart } from "../../../../../types";
import { IntegrationToolLayout } from "../../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { getIntegrationToolInteractionState } from "../../shared/state";

type ExecuteOutput = {
  affectedRows: number;
  command: string;
};

type MongoMutationOutput = {
  insertedId?: string;
  insertedCount?: number;
  insertedIds?: string[];
  matchedCount?: number;
  modifiedCount?: number;
};

export function createDbExecuteTool(
  provider: string,
  providerLabel: string,
) {
  return memo(function DbExecuteTool({
    part,
    onApprove,
    onDeny,
  }: RendererProps) {
    const state = getIntegrationToolInteractionState(part as ToolPart, {
      onApprove,
      onDeny,
    });
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
      if (state.hasOutput) setIsExpanded(true);
    }, [state.hasOutput]);

    const input =
      "input" in part
        ? (part.input as { sql?: string })
        : null;
    const output =
      state.hasOutput && "output" in part
        ? (part.output as ExecuteOutput)
        : null;

    const summary = state.isRunning
      ? `${providerLabel}: Executing statement...`
      : state.isError
        ? `${providerLabel}: Execution failed`
        : output
          ? `${providerLabel}: ${output.command} — ${output.affectedRows} row${output.affectedRows !== 1 ? "s" : ""} affected`
          : `${providerLabel}: Execute`;

    return (
      <IntegrationToolLayout
        provider={providerLabel}
        providerIcon={
          <IntegrationProviderIcon provider={provider} className="h-4 w-4" />
        }
        summary={summary}
        isRunning={state.isRunning}
        isError={state.isError}
        isExpandable={Boolean(output || input)}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        errorText={state.isError ? state.errorText : undefined}
      >
        <div className="space-y-2">
          {input?.sql ? (
            <div className="overflow-auto rounded-lg border border-border/30 bg-surface/40 px-3 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60">
                {input.sql.length > 300
                  ? `${input.sql.slice(0, 300)}...`
                  : input.sql}
              </pre>
            </div>
          ) : null}
          {output ? (
            <div className="flex items-center gap-2 text-xs text-foreground/60">
              <Chip
                size="sm"
                color="success"
                variant="soft"
                className="h-5 text-[10px]"
              >
                {output.command}
              </Chip>
              <span>
                {output.affectedRows} row
                {output.affectedRows !== 1 ? "s" : ""} affected
              </span>
            </div>
          ) : null}
        </div>
      </IntegrationToolLayout>
    );
  });
}

export function createDbMongoMutationTool(
  provider: string,
  providerLabel: string,
) {
  return memo(function DbMongoMutationTool({
    part,
    onApprove,
    onDeny,
  }: RendererProps) {
    const state = getIntegrationToolInteractionState(part as ToolPart, {
      onApprove,
      onDeny,
    });
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
      if (state.hasOutput) setIsExpanded(true);
    }, [state.hasOutput]);

    const input =
      "input" in part
        ? (part.input as {
            collection?: string;
            document?: object;
            filter?: object;
            update?: object;
          })
        : null;
    const output =
      state.hasOutput && "output" in part
        ? (part.output as MongoMutationOutput)
        : null;

    const operationType = (() => {
      if (output?.insertedId || output?.insertedCount) return "Insert";
      if (output?.modifiedCount !== undefined) return "Update";
      return "Mutation";
    })();

    const resultSummary = (() => {
      if (!output) return "";
      if (output.insertedId) return `Inserted 1 document`;
      if (output.insertedCount)
        return `Inserted ${output.insertedCount} document${output.insertedCount !== 1 ? "s" : ""}`;
      if (output.modifiedCount !== undefined)
        return `Matched ${output.matchedCount}, modified ${output.modifiedCount}`;
      return "Done";
    })();

    const summary = state.isRunning
      ? `${providerLabel}: ${operationType}ing into ${input?.collection ?? "collection"}...`
      : state.isError
        ? `${providerLabel}: ${operationType} failed`
        : output
          ? `${providerLabel}: ${resultSummary}`
          : `${providerLabel}: ${operationType}`;

    return (
      <IntegrationToolLayout
        provider={providerLabel}
        providerIcon={
          <IntegrationProviderIcon provider={provider} className="h-4 w-4" />
        }
        summary={summary}
        isRunning={state.isRunning}
        isError={state.isError}
        isExpandable={Boolean(output)}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        errorText={state.isError ? state.errorText : undefined}
      >
        {output ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <Chip
              size="sm"
              color="success"
              variant="soft"
              className="h-5 text-[10px]"
            >
              {operationType}
            </Chip>
            <span>{resultSummary}</span>
          </div>
        ) : null}
      </IntegrationToolLayout>
    );
  });
}
