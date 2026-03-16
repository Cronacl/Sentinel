"use client";

import { memo, useEffect, useState } from "react";
import { Chip } from "@heroui/react";

import type { RendererProps } from "../../../../renderer";
import type { ToolPart } from "../../../../../types";
import { getToolName } from "../../../../../types";
import { IntegrationToolLayout } from "../../shared/integration-tool-layout";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { getIntegrationToolInteractionState } from "../../shared/state";

type CountOutput = { count: number };
type DistinctOutput = { values: unknown[] };

export const MongoCountTool = memo(function MongoCountTool({
  part,
  onApprove,
  onDeny,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isDistinct = toolName.includes("distinct");
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
      ? (part.input as { collection?: string; field?: string })
      : null;

  const output =
    state.hasOutput && "output" in part
      ? (part.output as CountOutput | DistinctOutput)
      : null;

  const summary = (() => {
    if (state.isRunning) {
      return isDistinct
        ? `MongoDB: Getting distinct values for ${input?.field ?? "field"}...`
        : `MongoDB: Counting documents in ${input?.collection ?? "collection"}...`;
    }
    if (state.isError) {
      return isDistinct
        ? "MongoDB: Distinct failed"
        : "MongoDB: Count failed";
    }
    if (output) {
      if ("count" in output) {
        return `MongoDB: ${output.count.toLocaleString()} documents in ${input?.collection ?? "collection"}`;
      }
      if ("values" in output) {
        return `MongoDB: ${output.values.length} distinct value${output.values.length !== 1 ? "s" : ""} for ${input?.field ?? "field"}`;
      }
    }
    return isDistinct ? "MongoDB: Distinct" : "MongoDB: Count";
  })();

  return (
    <IntegrationToolLayout
      provider="MongoDB"
      providerIcon={
        <IntegrationProviderIcon provider="mongodb" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(output && "values" in output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={state.isError ? state.errorText : undefined}
    >
      {output && "values" in output && output.values.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {output.values.slice(0, 50).map((v, i) => (
            <Chip
              key={i}
              size="sm"
              variant="soft"
              className="h-5 text-[10px] font-mono"
            >
              {String(v)}
            </Chip>
          ))}
          {output.values.length > 50 ? (
            <span className="self-center text-[10px] text-foreground/30">
              +{output.values.length - 50} more
            </span>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
