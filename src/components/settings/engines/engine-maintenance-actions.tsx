"use client";

import {
  AlertDialog,
  Button,
  Description,
  Label,
  Radio,
  RadioGroup,
  Spinner,
} from "@heroui/react";
import { useState } from "react";
import { sileo } from "sileo";

import {
  getMaintenanceAction,
  getMaintenanceProgressText,
  getMaintenanceResult,
  isMaintenanceRunning,
} from "@/components/engines/maintenance-status";
import type { EngineSnapshot } from "@/lib/ai/chat/engines/contract";
import { api, type RouterOutputs } from "@/trpc/react";

type MaintenanceStatus = RouterOutputs["engines"]["maintenance"]["status"];

function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="border-separator/20 bg-background/60 text-foreground overflow-x-auto rounded-lg border px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-all">
      {command}
    </pre>
  );
}

function InstallChoices({
  onSelect,
  selectedId,
  status,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;
  status: MaintenanceStatus;
}) {
  if (status.installOptions.length === 0) {
    return (
      <p className="text-muted text-xs">
        {status.installHint ?? "Nothing can be installed from Sentinel."}
      </p>
    );
  }

  const selected = status.installOptions.find(
    (option) => option.id === selectedId,
  );
  return (
    <div className="space-y-2">
      {status.installOptions.length > 1 ? (
        <RadioGroup
          aria-label="Install method"
          className="gap-1"
          onChange={onSelect}
          value={selectedId ?? undefined}
        >
          {status.installOptions.map((option) => (
            <Radio
              isDisabled={!option.available}
              key={option.id}
              value={option.id}
            >
              <Radio.Content className="gap-2">
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                <span className="flex min-w-0 flex-col">
                  <Label className="text-[12px]">{option.label}</Label>
                  <Description className="text-[11px]">
                    {option.reason ?? option.description ?? ""}
                  </Description>
                </span>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      ) : null}
      {selected?.command ? <CommandBlock command={selected.command} /> : null}
      {selected && !selected.available && status.installOptions.length === 1 ? (
        <p className="text-warning text-xs">{selected.reason}</p>
      ) : null}
    </div>
  );
}

function UpdateSummary({ status }: { status: MaintenanceStatus }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="text-foreground">
        {status.currentVersion ?? "The installed version"}
        {status.latestVersion ? ` → ${status.latestVersion}` : ""}
        {status.updateOwner ? ` · ${status.updateOwner}` : ""}
      </p>
      {status.updateCommand ? (
        <CommandBlock command={status.updateCommand} />
      ) : (
        <p className="text-warning">
          {status.updateBlockedReason ?? "No update command is available."}
        </p>
      )}
      <p className="text-muted">
        When it finishes, Sentinel restarts {status.label}; turns running on it
        stop.
      </p>
    </div>
  );
}

function firstAvailableOption(status: MaintenanceStatus | undefined) {
  return status?.installOptions.find((option) => option.available)?.id ?? null;
}

/**
 * Install or Update for the instance card header: opens a confirmation that
 * shows the exact command, which runs only once the user confirms it.
 */
export function EngineMaintenanceButton({
  snapshot,
}: {
  snapshot: EngineSnapshot;
}) {
  const action = getMaintenanceAction(snapshot);
  const [isOpen, setIsOpen] = useState(false);
  const [chosenOption, setChosenOption] = useState<string | null>(null);
  const utils = api.useUtils();
  const statusQuery = api.engines.maintenance.status.useQuery(
    { instanceId: snapshot.instanceId },
    { enabled: isOpen, staleTime: 0 },
  );
  const onError = (error: {
    data?: { code?: string } | null;
    message: string;
  }) => {
    sileo.error({ description: error.message });
    if (error.data?.code === "CONFLICT") {
      void statusQuery.refetch();
    }
  };
  const onStarted = () => {
    setIsOpen(false);
    void utils.engines.snapshots.invalidate();
  };
  const update = api.engines.maintenance.update.useMutation({
    onError,
    onSuccess: onStarted,
  });
  const install = api.engines.maintenance.install.useMutation({
    onError,
    onSuccess: onStarted,
  });

  if (!action) {
    return null;
  }

  const status = statusQuery.data;
  const optionId = chosenOption ?? firstAvailableOption(status);
  const option = status?.installOptions.find((entry) => entry.id === optionId);
  const isInstall = action.kind === "install";
  const canConfirm = isInstall
    ? option?.available === true
    : Boolean(status?.canUpdate && status.updateCommand);
  const isPending = update.isPending || install.isPending;

  const confirm = () => {
    if (!status) {
      return;
    }
    if (isInstall && option) {
      install.mutate({
        expectedCommand: option.command,
        instanceId: snapshot.instanceId,
        optionId: option.id,
      });
    } else if (!isInstall && status.updateCommand) {
      update.mutate({
        expectedCommand: status.updateCommand,
        instanceId: snapshot.instanceId,
      });
    }
  };

  return (
    <>
      <Button
        className="h-6 min-w-0 px-2 text-[11px]"
        onPress={() => {
          setChosenOption(null);
          setIsOpen(true);
        }}
        size="sm"
        variant="primary"
      >
        {action.label}
      </Button>
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="sm:max-w-[520px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>
                {isInstall
                  ? `Install ${snapshot.label}?`
                  : `Update ${snapshot.label}?`}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {status ? (
                <div className="space-y-3 text-sm">
                  <p className="text-muted text-xs">
                    Sentinel runs this command on your computer, as you.
                  </p>
                  {isInstall ? (
                    <InstallChoices
                      onSelect={setChosenOption}
                      selectedId={optionId}
                      status={status}
                    />
                  ) : (
                    <UpdateSummary status={status} />
                  )}
                </div>
              ) : statusQuery.error ? (
                <p className="text-danger text-xs">
                  {statusQuery.error.message}
                </p>
              ) : (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={isPending}
                onPress={() => setIsOpen(false)}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isDisabled={!canConfirm}
                isPending={isPending}
                onPress={confirm}
                variant="primary"
              >
                {({ isPending: pending }) => (
                  <>
                    {pending ? <Spinner color="current" size="sm" /> : null}
                    {isInstall ? "Install" : "Update"}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

/** Progress of a running install or update, then its outcome. */
export function EngineMaintenanceProgress({
  snapshot,
}: {
  snapshot: EngineSnapshot;
}) {
  const [showOutput, setShowOutput] = useState(false);
  const cancel = api.engines.maintenance.cancel.useMutation({
    onError: (error) => sileo.error({ description: error.message }),
  });
  const running = isMaintenanceRunning(snapshot);
  const progress = getMaintenanceProgressText(snapshot);
  const result = running ? null : getMaintenanceResult(snapshot);
  const output = running ? snapshot.updateState?.output : result?.output;

  if (!running && !result) {
    return null;
  }

  const toneClass =
    result?.tone === "success"
      ? "border-success/20 bg-success-soft text-success-soft-foreground"
      : result?.tone === "danger"
        ? "border-danger/20 bg-danger-soft text-danger-soft-foreground"
        : result?.tone === "warning"
          ? "border-warning/20 bg-warning-soft text-warning-soft-foreground"
          : "border-separator/20 bg-background/60 text-foreground";

  return (
    <div
      className={`mt-2 rounded-lg border px-2 py-1.5 text-[11px] ${toneClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {running ? <Spinner size="sm" /> : null}
          <span className="break-words">
            {running ? progress : result?.message}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {output ? (
            <Button
              className="h-5 min-w-0 px-1.5 text-[10px]"
              onPress={() => setShowOutput((current) => !current)}
              size="sm"
              variant="secondary"
            >
              {showOutput ? "Hide output" : "Output"}
            </Button>
          ) : null}
          {running ? (
            <Button
              className="h-5 min-w-0 px-1.5 text-[10px]"
              isPending={cancel.isPending}
              onPress={() => cancel.mutate({ instanceId: snapshot.instanceId })}
              size="sm"
              variant="danger"
            >
              Stop
            </Button>
          ) : null}
        </span>
      </div>
      {showOutput && output ? (
        <pre className="mt-1.5 max-h-40 overflow-auto font-mono text-[10px] whitespace-pre-wrap break-all">
          {output}
        </pre>
      ) : null}
    </div>
  );
}
