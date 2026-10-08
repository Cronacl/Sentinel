"use client";

import { AlertDialog, Button, Dropdown, Label } from "@heroui/react";
import { MoreHorizontalIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { sileo } from "sileo";

import { EngineIcon } from "@/components/engines/descriptors";
import { getDriverLabel, getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import type {
  EngineInstanceSummary,
  EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/trpc/react";

import {
  EngineCustomModelsDialog,
  type EngineCustomModelsTarget,
} from "./engine-custom-models-dialog";
import {
  EngineInstanceDialog,
  useInvalidateEngineInstances,
  type EngineInstanceDialogTarget,
} from "./engine-instance-dialog";
import {
  canAddEngineInstance,
  describeEngineInstanceReferences,
  describeInstanceChange,
  getInstanceIsolationNote,
  type InstanceChangeAction,
  type InstanceChangeConfirmation,
} from "./instance-management";

const CONFIRM_LABELS: Record<InstanceChangeAction, string> = {
  disable: "Disable",
  remove: "Remove",
  reset: "Reset",
};

function InstanceActionsMenu({
  isDisabled,
  onAction,
  snapshot,
  summary,
}: {
  isDisabled: boolean;
  onAction: (key: string) => void;
  snapshot: EngineSnapshot;
  summary: EngineInstanceSummary | null;
}) {
  const meta = getDriverMeta(snapshot.driver);
  const manageable = Boolean(
    summary && meta?.status === "available" && meta.runtime === "external",
  );
  const items = [
    ...(manageable ? [{ id: "edit", label: "Edit…" }] : []),
    ...(manageable &&
    summary?.availability === "available" &&
    snapshot.capabilities.supportsCustomModels
      ? [{ id: "models", label: "Custom models…" }]
      : []),
    ...(manageable && summary?.availability === "available"
      ? [
          summary.enabled
            ? { id: "disable", label: "Disable" }
            : { id: "enable", label: "Enable" },
        ]
      : []),
    ...(summary && !summary.isDefault
      ? [{ danger: true, id: "remove", label: "Remove…" }]
      : []),
    ...(summary?.isDefault && summary.persisted && manageable
      ? [{ danger: true, id: "reset", label: "Reset to defaults…" }]
      : []),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <Dropdown>
      <Button
        aria-label={`Manage ${snapshot.label}`}
        className="h-6 w-6 min-w-0"
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        variant="ghost"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={MoreHorizontalIcon}
          size={14}
          strokeWidth={1.6}
        />
      </Button>
      <Dropdown.Popover className="min-w-[180px]" placement="bottom end">
        <Dropdown.Menu onAction={(key) => onAction(String(key))}>
          {items.map((item) => (
            <Dropdown.Item
              id={item.id}
              key={item.id}
              textValue={item.label}
              variant={"danger" in item ? "danger" : "default"}
            >
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/** A driver's instances in Settings → Engines, with "Add instance". */
export function EngineDriverSection({
  children,
  driver,
  onAdd,
}: {
  children: ReactNode;
  driver: string;
  onAdd?: () => void;
}) {
  const note = onAdd ? getInstanceIsolationNote(driver) : null;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <EngineIcon className="h-3.5 w-3.5 shrink-0" driver={driver} />
          <h2 className="text-foreground text-[13px] font-medium">
            {getDriverLabel(driver)}
          </h2>
        </div>
        {onAdd ? (
          <Button
            className="h-6 min-w-0 gap-1 px-2 text-[11px]"
            onPress={onAdd}
            size="sm"
            variant="tertiary"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={PlusSignIcon}
              size={12}
              strokeWidth={1.6}
            />
            Add instance
          </Button>
        ) : null}
      </div>
      <div className="grid gap-1.5">{children}</div>
      {note ? <p className="text-muted px-1 text-[11px]">{note}</p> : null}
    </section>
  );
}

/**
 * Add, edit, enable/disable, remove and custom models for engine
 * instances. Renders per-card action menus and the dialogs they open; the
 * page places them.
 */
export function useEngineInstanceManager() {
  const utils = api.useUtils();
  const instancesQuery = api.engines.instances.list.useQuery();
  const setEnabledMutation = api.engines.instances.setEnabled.useMutation();
  const removeMutation = api.engines.instances.remove.useMutation();
  const invalidate = useInvalidateEngineInstances();
  const [dialog, setDialog] = useState<EngineInstanceDialogTarget | null>(null);
  const [modelsTarget, setModelsTarget] =
    useState<EngineCustomModelsTarget | null>(null);
  const [confirm, setConfirm] = useState<InstanceChangeConfirmation | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const summaries = useMemo(
    () =>
      new Map(
        (instancesQuery.data ?? []).map((summary) => [summary.id, summary]),
      ),
    [instancesQuery.data],
  );

  const run = useCallback(
    async (work: () => Promise<string | null>) => {
      setBusy(true);
      try {
        const message = await work();
        await invalidate();
        if (message) {
          sileo.success({ description: message });
        }
      } catch (error) {
        sileo.error({
          description: getErrorMessage(error, "Unable to update the engine."),
        });
      } finally {
        setBusy(false);
      }
    },
    [invalidate],
  );

  const askOrRun = useCallback(
    async (summary: EngineInstanceSummary, action: InstanceChangeAction) => {
      let references;
      try {
        references = await utils.engines.instances.references.fetch({
          instanceId: summary.id,
        });
      } catch (error) {
        sileo.error({
          description: getErrorMessage(error, "Unable to check the instance."),
        });
        return;
      }
      const inUseBy = describeEngineInstanceReferences(references);
      if (action === "disable" && !inUseBy) {
        await run(async () => {
          await setEnabledMutation.mutateAsync({
            enabled: false,
            instanceId: summary.id,
          });
          return `${summary.label} disabled.`;
        });
        return;
      }
      setConfirm({
        action,
        inUseBy,
        summary,
        userDefault: references.userDefault,
      });
    },
    [run, setEnabledMutation, utils.engines.instances.references],
  );

  const confirmChange = useCallback(async () => {
    if (!confirm) {
      return;
    }
    const { action, inUseBy, summary } = confirm;
    const force = inUseBy !== null;
    setConfirm(null);
    await run(async () => {
      if (action === "disable") {
        await setEnabledMutation.mutateAsync({
          enabled: false,
          force,
          instanceId: summary.id,
        });
        return `${summary.label} disabled.`;
      }
      await removeMutation.mutateAsync({ force, instanceId: summary.id });
      return action === "reset"
        ? `${summary.label} reset to its defaults.`
        : `${summary.label} removed.`;
    });
  }, [confirm, removeMutation, run, setEnabledMutation]);

  const handleAction = useCallback(
    (snapshot: EngineSnapshot, key: string) => {
      const summary = summaries.get(snapshot.instanceId);
      if (!summary) {
        return;
      }
      switch (key) {
        case "edit":
          setDialog({ mode: "edit", summary });
          return;
        case "models":
          setModelsTarget({ models: snapshot.models, summary });
          return;
        case "enable":
          void run(async () => {
            await setEnabledMutation.mutateAsync({
              enabled: true,
              instanceId: summary.id,
            });
            return `${summary.label} enabled.`;
          });
          return;
        case "disable":
        case "remove":
        case "reset":
          void askOrRun(summary, key);
          return;
      }
    },
    [askOrRun, run, setEnabledMutation, summaries],
  );

  const renderActions = useCallback(
    (snapshot: EngineSnapshot) => (
      <InstanceActionsMenu
        isDisabled={busy}
        onAction={(key) => handleAction(snapshot, key)}
        snapshot={snapshot}
        summary={summaries.get(snapshot.instanceId) ?? null}
      />
    ),
    [busy, handleAction, summaries],
  );

  const openCreate = useCallback((driver: string) => {
    setDialog({ driver, mode: "create" });
  }, []);

  const confirmText = confirm ? describeInstanceChange(confirm) : null;
  const dialogs = (
    <>
      <EngineInstanceDialog onClose={() => setDialog(null)} target={dialog} />
      <EngineCustomModelsDialog
        onClose={() => setModelsTarget(null)}
        target={modelsTarget}
      />
      <AlertDialog.Backdrop
        isOpen={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>{confirmText?.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-foreground text-sm">{confirmText?.body}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button onPress={() => setConfirm(null)} variant="tertiary">
                Cancel
              </Button>
              <Button onPress={() => void confirmChange()} variant="danger">
                {confirm
                  ? `${CONFIRM_LABELS[confirm.action]}${confirm.inUseBy ? " anyway" : ""}`
                  : ""}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );

  return {
    canAdd: canAddEngineInstance,
    dialogs,
    openCreate,
    renderActions,
  };
}
