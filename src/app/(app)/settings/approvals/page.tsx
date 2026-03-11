"use client";

import {
  AlertDialog,
  Button,
  Chip,
  Skeleton,
  Spinner,
  Switch,
} from "@heroui/react";
import { ValidationApprovalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import type { EffectiveToolApprovalPolicy } from "@/lib/ai/chat/tool-approval-policy";
import { api } from "@/trpc/react";

function ApprovalsSkeleton() {
  return (
    <section className="border-separator bg-surface rounded-xl border">
      <div className="divide-separator divide-y">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="flex items-start justify-between gap-4 px-5 py-4"
            key={index}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-4 w-64 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-9 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </section>
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
    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-foreground text-sm font-medium">{tool.label}</h2>
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
  const [pendingToggleKey, setPendingToggleKey] = useState<string | null>(null);
  const [pendingDisableTool, setPendingDisableTool] =
    useState<EffectiveToolApprovalPolicy | null>(null);

  const updateApprovals = api.approvals.update.useMutation({
    onMutate: async (input) => {
      const previousApprovals = utils.approvals.get.getData();

      utils.approvals.get.setData(undefined, (current) =>
        applyUpdates(current, input),
      );

      return { previousApprovals };
    },
    onError: (_error, _input, context) => {
      utils.approvals.get.setData(undefined, context?.previousApprovals ?? []);
    },
  });

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
      setPendingToggleKey((current) =>
        current === toolName ? null : current,
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
      setPendingDisableTool(tool);
      return;
    }

    await executeToggle(tool.toolName, true);
  };

  const handleConfirmDisable = async () => {
    if (!pendingDisableTool) {
      return;
    }

    const toolName = pendingDisableTool.toolName;
    setPendingDisableTool(null);
    await executeToggle(toolName, false);
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
        <ApprovalsSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="border-separator bg-surface rounded-xl border p-5">
            <p className="text-muted text-sm">
              Approval rules apply per tool. Disabling approval skips the pause
              step only; workspace boundaries, permission mode restrictions, and
              tool-specific limits still apply.
            </p>
          </section>

          <section className="border-separator bg-surface rounded-xl border">
            <div className="divide-separator divide-y">
              {approvals.data?.map((tool) => (
                <ToolApprovalRow
                  isPending={pendingToggleKey === tool.toolName}
                  key={tool.toolName}
                  onToggle={handleToggle}
                  tool={tool}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <AlertDialog.Backdrop
        isOpen={Boolean(pendingDisableTool)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDisableTool(null);
          }
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="border-separator w-full border sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Disable approval?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-foreground">
                Sentinel will be allowed to run{" "}
                <span className="font-medium">
                  {pendingDisableTool?.label ?? "this tool"}
                </span>{" "}
                immediately.
              </p>
              <p className="text-muted mt-2 text-xs">
                {pendingDisableTool?.riskSummary}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                onPress={() => setPendingDisableTool(null)}
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
