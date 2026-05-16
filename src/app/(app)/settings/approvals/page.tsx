"use client";

import {
  AlertDialog,
  Button,
  Chip,
  Disclosure,
  DisclosureGroup,
  Input,
  Spinner,
  Switch,
} from "@heroui/react";
import { useMemo, useState } from "react";
import { sileo } from "sileo";

import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import { SentinelLogoMark } from "@/components/shared/logo";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  TOOL_APPROVAL_GROUPS,
  type EffectiveToolApprovalPolicy,
} from "@/lib/ai/chat/tools/policy";
import { api } from "@/trpc/react";
import type { IntegrationProvider } from "@/server/db/enums";

type GroupId = keyof typeof TOOL_APPROVAL_GROUPS;

type ApprovalGroupView = {
  description: string;
  groupId: GroupId | "built_in";
  label: string;
  riskSummary: string;
  tools: EffectiveToolApprovalPolicy[];
};

type PendingDisableState =
  | {
      groupId: GroupId;
      kind: "group";
      label: string;
      riskSummary: string;
    }
  | {
      kind: "tool";
      label: string;
      riskSummary: string;
      toolName: EffectiveToolApprovalPolicy["toolName"];
    };

function normalizeForSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(haystack: string, query: string) {
  if (!query) {
    return true;
  }

  return normalizeForSearch(haystack).includes(query);
}

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

function ApprovalGroupIcon({
  groupId,
}: {
  groupId: ApprovalGroupView["groupId"];
}) {
  if (groupId === "built_in") {
    return <SentinelLogoMark className="h-4 w-4" />;
  }

  return (
    <IntegrationProviderIcon
      className="h-4 w-4"
      provider={groupId as IntegrationProvider}
    />
  );
}

function applyUpdates(
  current: EffectiveToolApprovalPolicy[] | undefined,
  input:
    | {
        requireApproval: boolean;
        toolName: EffectiveToolApprovalPolicy["toolName"];
      }
    | {
        policies: Array<{
          requireApproval: boolean;
          toolName: EffectiveToolApprovalPolicy["toolName"];
        }>;
      },
) {
  if (!current) {
    return current;
  }

  const updates = "policies" in input ? input.policies : [input];
  const updateMap = new Map(
    updates.map((update) => [update.toolName, update.requireApproval]),
  );

  return current.map((tool) => {
    const nextRequireApproval = updateMap.get(tool.toolName);

    if (typeof nextRequireApproval !== "boolean") {
      return tool;
    }

    return {
      ...tool,
      isDefault: nextRequireApproval === tool.defaultRequireApproval,
      requireApproval: nextRequireApproval,
    };
  });
}

function applyGroupUpdate(
  current: EffectiveToolApprovalPolicy[] | undefined,
  input: {
    groupId: GroupId;
    requireApproval: boolean;
  },
) {
  const group = TOOL_APPROVAL_GROUPS[input.groupId];
  if (!group || !current) {
    return current;
  }

  return current.map((tool) => {
    if (!group.toolNames.includes(tool.toolName)) {
      return tool;
    }

    return {
      ...tool,
      isDefault: input.requireApproval === tool.defaultRequireApproval,
      requireApproval: input.requireApproval,
    };
  });
}

function ToolApprovalRow({
  isPending,
  onToggle,
  tool,
}: {
  isPending: boolean;
  onToggle: (
    tool: EffectiveToolApprovalPolicy,
    requireApproval: boolean,
  ) => void | Promise<void>;
  tool: EffectiveToolApprovalPolicy;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 pl-10 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-foreground text-sm font-medium">{tool.label}</h3>
          <Chip
            color={tool.requireApproval ? "success" : "warning"}
            size="sm"
            variant="soft"
          >
            {tool.requireApproval ? "Required" : "Disabled"}
          </Chip>
          {!tool.isDefault ? (
            <Chip size="sm" variant="soft">
              Custom
            </Chip>
          ) : null}
          <Chip size="sm" variant="soft">
            {tool.toolName}
          </Chip>
        </div>

        <p className="text-muted mt-1 text-sm">{tool.description}</p>
      </div>

      <Switch.Root
        aria-label={`Require approval for ${tool.label}`}
        className={isPending ? "shrink-0 opacity-60" : "shrink-0"}
        isSelected={tool.requireApproval}
        onChange={(requireApproval) => void onToggle(tool, requireApproval)}
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Require approval</p>
            <p className="text-muted text-xs">
              {tool.requireApproval
                ? "Pause before running."
                : "Run immediately."}
            </p>
          </div>
        </Switch.Content>
      </Switch.Root>
    </div>
  );
}

export default function ApprovalsSettingsPage() {
  const utils = api.useUtils();
  const approvals = api.approvals.get.useQuery();
  const [actionError, setActionError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingToggleKey, setPendingToggleKey] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] =
    useState<PendingDisableState | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string | number>>(
    new Set(),
  );

  const updateApprovals = api.approvals.update.useMutation({
    onMutate: async (input) => {
      const previousApprovals = utils.approvals.get.getData();

      utils.approvals.get.setData(undefined, (current) => {
        if ("groupId" in input) {
          return applyGroupUpdate(current, {
            groupId: input.groupId as GroupId,
            requireApproval: input.requireApproval,
          });
        }

        return applyUpdates(current, input);
      });

      return { previousApprovals };
    },
    onError: (error, _input, context) => {
      utils.approvals.get.setData(undefined, context?.previousApprovals ?? []);
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update approval setting.",
      });
    },
    onSuccess: (data) => {
      utils.approvals.get.setData(undefined, data);
    },
  });

  const groupedApprovals = useMemo<ApprovalGroupView[]>(() => {
    const groupMap = new Map<string, EffectiveToolApprovalPolicy[]>();
    const builtInTools: EffectiveToolApprovalPolicy[] = [];

    for (const tool of approvals.data ?? []) {
      if (tool.group) {
        const currentTools = groupMap.get(tool.group) ?? [];
        currentTools.push(tool);
        groupMap.set(tool.group, currentTools);
      } else {
        builtInTools.push(tool);
      }
    }

    const groups = Object.entries(TOOL_APPROVAL_GROUPS)
      .map(([groupId, meta]) => ({
        description: meta.description,
        groupId: groupId as GroupId,
        label: meta.label,
        riskSummary: meta.riskSummary,
        tools: groupMap.get(groupId) ?? [],
      }))
      .filter((group) => group.tools.length > 0);

    if (builtInTools.length > 0) {
      groups.unshift({
        description:
          "Core Sentinel tools for local workspace access, editing, search, and shell execution.",
        groupId: "built_in",
        label: "Built-in tools",
        riskSummary:
          "Sentinel can inspect files, edit the workspace, run shell commands, search the web, and manage local memory without a confirmation pause.",
        tools: builtInTools,
      });
    }

    return groups;
  }, [approvals.data]);

  const normalizedSearchQuery = normalizeForSearch(searchQuery);

  const visibleGroups = useMemo(() => {
    return groupedApprovals
      .map((group) => {
        const groupMatches = matchesSearch(
          `${group.label} ${group.description} ${group.riskSummary}`,
          normalizedSearchQuery,
        );

        const tools = group.tools.filter((tool) => {
          return matchesSearch(
            `${tool.label} ${tool.description} ${tool.toolName} ${tool.riskSummary}`,
            normalizedSearchQuery,
          );
        });

        if (!groupMatches && tools.length === 0) {
          return null;
        }

        return {
          ...group,
          tools,
        };
      })
      .filter((group): group is ApprovalGroupView => Boolean(group))
      .filter(
        (group) => group.tools.length > 0 || normalizedSearchQuery === "",
      );
  }, [groupedApprovals, normalizedSearchQuery]);

  const executeToggle = async (
    toolName: EffectiveToolApprovalPolicy["toolName"],
    requireApproval: boolean,
  ) => {
    if (pendingToggleKey) {
      return;
    }

    setActionError("");
    setPendingToggleKey(toolName);

    try {
      await updateApprovals.mutateAsync({ requireApproval, toolName });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update that approval.",
      );
    } finally {
      setPendingToggleKey((current) => (current === toolName ? null : current));
    }
  };

  const executeGroupToggle = async (
    groupId: GroupId,
    requireApproval: boolean,
  ) => {
    if (pendingToggleKey) {
      return;
    }

    setActionError("");
    setPendingToggleKey(`group:${groupId}`);

    try {
      await updateApprovals.mutateAsync({ groupId, requireApproval });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update that approval group.",
      );
    } finally {
      setPendingToggleKey((current) =>
        current === `group:${groupId}` ? null : current,
      );
    }
  };

  const handleToggle = async (
    tool: EffectiveToolApprovalPolicy,
    requireApproval: boolean,
  ) => {
    if (requireApproval === tool.requireApproval) {
      return;
    }

    if (!requireApproval) {
      setPendingDisable({
        kind: "tool",
        label: tool.label,
        riskSummary: tool.riskSummary,
        toolName: tool.toolName,
      });
      return;
    }

    await executeToggle(tool.toolName, true);
  };

  const handleGroupToggle = async (
    group: ApprovalGroupView,
    requireApproval: boolean,
  ) => {
    if (group.groupId === "built_in") {
      return;
    }

    const currentValue = group.tools.every((tool) => tool.requireApproval);
    if (requireApproval === currentValue) {
      return;
    }

    if (!requireApproval) {
      setPendingDisable({
        groupId: group.groupId,
        kind: "group",
        label: group.label,
        riskSummary: group.riskSummary,
      });
      return;
    }

    await executeGroupToggle(group.groupId, true);
  };

  const handleConfirmDisable = async () => {
    if (!pendingDisable) {
      return;
    }

    const nextAction = pendingDisable;
    setPendingDisable(null);

    if (nextAction.kind === "group") {
      await executeGroupToggle(nextAction.groupId, false);
      return;
    }

    await executeToggle(nextAction.toolName, false);
  };

  return (
    <SettingsPageWrapper
      subtitle="Choose which tools must pause for confirmation before Sentinel can use them."
      title="Approvals"
    >
      {approvals.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {approvals.error.message}
        </p>
      ) : null}

      {actionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {actionError}
        </p>
      ) : null}

      {approvals.isPending && !approvals.data ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Input
              fullWidth
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tools..."
              value={searchQuery}
              variant="secondary"
            />
          </div>

          <section className="border-separator/20 bg-surface overflow-hidden rounded-2xl border">
            {visibleGroups.length > 0 ? (
              <DisclosureGroup
                allowsMultipleExpanded
                expandedKeys={expandedGroups}
                onExpandedChange={setExpandedGroups}
              >
                <div className="divide-separator/20 divide-y">
                  {visibleGroups.map((group) => {
                    const enabledTools = group.tools.filter(
                      (tool) => tool.requireApproval,
                    ).length;
                    const groupIsPending =
                      pendingToggleKey === `group:${group.groupId}`;
                    const allRequireApproval =
                      group.tools.length > 0 &&
                      group.tools.every((tool) => tool.requireApproval);

                    return (
                      <Disclosure id={group.groupId} key={group.groupId}>
                        <Disclosure.Heading>
                          <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
                            <div className="border-separator/60 bg-background/80 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                              <ApprovalGroupIcon groupId={group.groupId} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-foreground text-sm font-medium">
                                  {group.label}
                                </span>
                                <Chip size="sm" variant="soft">
                                  {group.tools.length}
                                </Chip>
                                {group.groupId !== "built_in" ? (
                                  <Chip
                                    color={
                                      allRequireApproval ? "success" : "warning"
                                    }
                                    size="sm"
                                    variant="soft"
                                  >
                                    {allRequireApproval
                                      ? "Approval required"
                                      : "Some disabled"}
                                  </Chip>
                                ) : null}
                              </div>
                            </div>

                            <div className="ml-auto flex items-center gap-3">
                              <Chip
                                className="hidden sm:inline-flex"
                                size="sm"
                                variant="soft"
                              >
                                {enabledTools}/{group.tools.length}
                              </Chip>
                              {group.groupId !== "built_in" ? (
                                <div
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Switch.Root
                                    aria-label={`Require approval for all ${group.label} tools`}
                                    className={
                                      groupIsPending ? "opacity-60" : undefined
                                    }
                                    isSelected={allRequireApproval}
                                    onChange={(value) =>
                                      void handleGroupToggle(group, value)
                                    }
                                  >
                                    <Switch.Control>
                                      <Switch.Thumb />
                                    </Switch.Control>
                                  </Switch.Root>
                                </div>
                              ) : null}
                              <Disclosure.Indicator />
                            </div>
                          </Disclosure.Trigger>
                        </Disclosure.Heading>
                        <Disclosure.Content>
                          <Disclosure.Body className="border-separator/20 border-t px-4 pb-3 pt-3">
                            {group.tools.length > 0 ? (
                              <div className="divide-separator/10 divide-y">
                                {group.tools.map((tool) => (
                                  <ToolApprovalRow
                                    isPending={
                                      pendingToggleKey === tool.toolName
                                    }
                                    key={tool.toolName}
                                    onToggle={handleToggle}
                                    tool={tool}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="px-2 py-4 text-sm text-muted">
                                No tools match your search.
                              </div>
                            )}
                          </Disclosure.Body>
                        </Disclosure.Content>
                      </Disclosure>
                    );
                  })}
                </div>
              </DisclosureGroup>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-foreground text-sm font-medium">
                  No approval rules match that search.
                </p>
                <p className="text-muted mt-1 text-sm">
                  Try a tool name like <code>shell_command</code> or an
                  integration like GitHub.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      <AlertDialog.Backdrop
        isOpen={Boolean(pendingDisable)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDisable(null);
          }
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className=" sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Disable approval?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Sentinel will be allowed to run{" "}
                <span className="font-medium">
                  {pendingDisable?.label ?? "this tool"}
                </span>{" "}
                immediately.
              </p>
              <p className="text-muted mt-2 text-xs">
                {pendingDisable?.riskSummary}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => setPendingDisable(null)}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={updateApprovals.isPending}
                onPress={handleConfirmDisable}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Disable approval
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </SettingsPageWrapper>
  );
}
