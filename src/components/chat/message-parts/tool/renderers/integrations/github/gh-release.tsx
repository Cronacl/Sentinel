"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type ReleaseOutput = {
  id: number;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string;
  author: string;
  assets: { name: string; downloadUrl: string; size: number }[];
};

type ListReleasesOutput = { releases: ReleaseOutput[] };

export const GHReleaseTool = memo(function GHReleaseTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "gh_list_releases";
  const isCreate = toolName === "gh_create_release";
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    if (state.needsApproval) setIsExpanded(true);
  }, [part.toolCallId, state.needsApproval]);

  const output =
    state.hasOutput && "output" in part
      ? (part.output as ReleaseOutput | ListReleasesOutput)
      : null;
  const input = "input" in part
    ? (part.input as Record<string, unknown>)
    : null;

  const releases: ReleaseOutput[] = output
    ? "releases" in output
      ? output.releases
      : [output as ReleaseOutput]
    : [];

  const summary = state.isRunning
    ? isList
      ? "Fetching releases\u2026"
      : "Creating release\u2026"
    : state.isError
      ? isList
        ? "Failed to list releases"
        : "Failed to create release"
      : state.needsApproval
        ? `Create release \u201c${input?.tagName ?? ""}\u201d \u2014 awaiting approval`
        : isList
          ? `Listed ${releases.length} release${releases.length !== 1 ? "s" : ""}`
          : releases.length > 0
            ? `${isCreate ? "Created" : ""} ${releases[0]!.tagName} ${releases[0]!.name}`.trim()
            : "Release";

  return (
    <IntegrationToolLayout
      actions={
        state.showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onApprove?.(state.approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onDeny?.(state.approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      errorText={state.isError ? state.errorText : undefined}
      provider="GitHub"
      providerIcon={
        <IntegrationProviderIcon provider="github" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={releases.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {releases.map((r) => (
          <a
            key={r.id}
            href={r.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/5"
          >
            <Icon
              icon="solar:tag-linear"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-foreground">
                {r.tagName}
                {r.name && r.name !== r.tagName ? ` \u2014 ${r.name}` : ""}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-foreground/40">
                <span>{r.author}</span>
                <span>
                  {r.publishedAt
                    ? new Date(r.publishedAt).toLocaleDateString()
                    : "Draft"}
                </span>
                {r.draft ? (
                  <span className="rounded bg-foreground/5 px-1 py-0.5 text-[9px]">
                    Draft
                  </span>
                ) : null}
                {r.prerelease ? (
                  <span className="rounded bg-warning/10 px-1 py-0.5 text-[9px] text-warning">
                    Pre-release
                  </span>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
