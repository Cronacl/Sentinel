"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";

type UserOutput = {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  isBot: boolean;
  isActive: boolean;
  avatar: string | null;
  timezone: string | null;
};

type ListOutput = { users: UserOutput[]; totalCount: number };

export const SlackUsersTool = memo(function SlackUsersTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "slack_list_users";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as UserOutput | ListOutput)
      : null;

  const users: UserOutput[] = output
    ? "users" in output
      ? output.users
      : [output as UserOutput]
    : [];

  const totalCount =
    output && "totalCount" in output ? output.totalCount : users.length;

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Listing users\u2026"
      : "Fetching user\u2026"
    : state.isError
      ? "Failed to fetch"
      : isList
        ? `${totalCount} user${totalCount !== 1 ? "s" : ""}`
        : users.length > 0
          ? users[0]!.realName || users[0]!.displayName || users[0]!.name
          : "User details";

  return (
    <IntegrationToolLayout
      provider="Slack"
      providerIcon={
        <IntegrationProviderIcon provider="slack" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={users.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-0.5 p-1">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <Icon
                  icon="solar:user-circle-linear"
                  className="h-5 w-5 text-foreground/40"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-foreground">
                {user.realName || user.displayName || user.name}
              </p>
              {user.displayName && user.displayName !== user.realName ? (
                <p className="text-[11px] text-foreground/50">
                  @{user.name}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-foreground/45">
                {user.isAdmin ? (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    Admin
                  </span>
                ) : null}
                {!user.isActive ? (
                  <span className="inline-flex items-center rounded bg-foreground/4 px-1.5 py-0.5">
                    Deactivated
                  </span>
                ) : null}
                {user.timezone ? (
                  <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                    <Icon icon="solar:clock-circle-linear" className="h-3 w-3" />
                    {user.timezone}
                  </span>
                ) : null}
                {user.email ? (
                  <span className="inline-flex items-center gap-1 rounded bg-foreground/4 px-1.5 py-0.5">
                    <Icon icon="solar:letter-linear" className="h-3 w-3" />
                    {user.email}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
