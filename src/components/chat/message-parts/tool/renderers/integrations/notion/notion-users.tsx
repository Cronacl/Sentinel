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
  type: string;
  avatarUrl: string | null;
  email: string | null;
};

type UsersListOutput = { users: UserOutput[] };

export const NotionUsersTool = memo(function NotionUsersTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const toolName = getToolName(part as ToolPart);
  const isList = toolName === "notion_list_users";

  const output =
    state.hasOutput && "output" in part
      ? (part.output as UserOutput | UsersListOutput)
      : null;

  const users: UserOutput[] = output
    ? "users" in output
      ? output.users
      : [output as UserOutput]
    : [];

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? isList
      ? "Listing users\u2026"
      : "Fetching user\u2026"
    : state.isError
      ? "Failed"
      : isList
        ? `${users.length} user${users.length !== 1 ? "s" : ""}`
        : users.length > 0
          ? users[0]!.name
          : "User details";

  return (
    <IntegrationToolLayout
      provider="Notion"
      providerIcon={
        <IntegrationProviderIcon provider="notion" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      errorText={state.isError ? state.errorText : undefined}
      isExpandable={users.length > 0}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <div className="space-y-1 p-1">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2.5 rounded-lg p-2"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-6 w-6 shrink-0 rounded-full"
              />
            ) : (
              <Icon
                icon="solar:user-circle-linear"
                className="h-6 w-6 shrink-0 text-foreground/30"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                {user.name}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-foreground/40">
                <span className="capitalize">{user.type}</span>
                {user.email ? <span>{user.email}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
