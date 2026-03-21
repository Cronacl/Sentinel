"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import type { ToolPart } from "../../../../types";

type UserOutput = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  active: boolean;
  admin: boolean;
};

type UserListOutput = { users: UserOutput[] };

export const LinearUsersTool = memo(function LinearUsersTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });

  const output =
    state.hasOutput && "output" in part
      ? (part.output as UserListOutput)
      : null;

  const users = output?.users ?? [];
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = state.isRunning
    ? "Fetching users\u2026"
    : state.isError
      ? "Failed to fetch users"
      : `Listed ${users.length} user${users.length !== 1 ? "s" : ""}`;

  return (
    <IntegrationToolLayout
      provider="Linear"
      providerIcon={
        <IntegrationProviderIcon provider="linear" className="h-4 w-4" />
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
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2.5 rounded-lg p-2">
            {u.avatarUrl ? (
              <img
                src={u.avatarUrl}
                alt={u.displayName}
                className="h-5 w-5 shrink-0 rounded-full"
              />
            ) : (
              <Icon
                icon="solar:user-circle-linear"
                className="h-5 w-5 shrink-0 text-foreground/40"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                {u.displayName}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-foreground/40">
                <span>{u.email}</span>
                {u.admin ? (
                  <span className="rounded bg-foreground/5 px-1 py-0.5 text-[9px]">
                    Admin
                  </span>
                ) : null}
                {!u.active ? (
                  <span className="text-foreground/30">Inactive</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationToolLayout>
  );
});
