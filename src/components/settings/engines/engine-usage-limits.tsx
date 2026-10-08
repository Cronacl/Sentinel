"use client";

import { AlertDialog, Button, Spinner } from "@heroui/react";
import { useCallback, useState } from "react";
import { sileo } from "sileo";

import { EngineIcon } from "@/components/engines/descriptors";
import { UsageLimitsWindows } from "@/components/engines/usage-limits-chip";
import {
  describeUsageCheckedAt,
  getUsageLimitsNotice,
  isUsageLimitsSnapshot,
  isUsageLimitsStale,
} from "@/components/engines/usage-limits";
import type {
  EngineSnapshot,
  EngineUsageLimits,
} from "@/lib/ai/chat/engines/contract";
import { api } from "@/trpc/react";

function formatCheckedAtTitle(checkedAt: string | undefined) {
  if (!checkedAt) return undefined;
  const date = new Date(checkedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

function useApplyUsageLimits() {
  const utils = api.useUtils();
  return useCallback(
    (instanceId: string, limits: EngineUsageLimits | null) => {
      // The snapshot event does the same; this covers a stream that is down.
      utils.engines.usage.get.setData({ instanceId }, limits);
      utils.engines.snapshots.setData(undefined, (current) =>
        current?.map((item) =>
          item.instanceId === instanceId
            ? { ...item, usageLimits: limits }
            : item,
        ),
      );
    },
    [utils.engines],
  );
}

function UsageLimitsRow({ snapshot }: { snapshot: EngineSnapshot }) {
  const refresh = api.engines.usage.refresh.useMutation();
  const readKeychain = api.engines.usage.readCursorKeychain.useMutation();
  const applyUsageLimits = useApplyUsageLimits();
  const [confirmKeychain, setConfirmKeychain] = useState(false);

  const limits = snapshot.usageLimits;
  const notice = getUsageLimitsNotice(snapshot);
  const now = Date.now();
  const checkedAt = describeUsageCheckedAt(limits?.checkedAt, now);
  const isStale = isUsageLimitsStale(snapshot, now);
  const canReadKeychain = limits?.unavailable?.action === "read-keychain";
  const isBusy = refresh.isPending || readKeychain.isPending;

  const handleRefresh = useCallback(async () => {
    try {
      applyUsageLimits(
        snapshot.instanceId,
        await refresh.mutateAsync({ instanceId: snapshot.instanceId }),
      );
    } catch (error) {
      sileo.error({
        description:
          error instanceof Error ? error.message : "Unable to read usage.",
      });
    }
  }, [applyUsageLimits, refresh, snapshot.instanceId]);

  const handleReadKeychain = useCallback(async () => {
    try {
      applyUsageLimits(
        snapshot.instanceId,
        await readKeychain.mutateAsync({ instanceId: snapshot.instanceId }),
      );
      setConfirmKeychain(false);
    } catch (error) {
      setConfirmKeychain(false);
      sileo.error({
        description:
          error instanceof Error
            ? error.message
            : "Unable to read the login from the Keychain.",
      });
    }
  }, [applyUsageLimits, readKeychain, snapshot.instanceId]);

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <EngineIcon
            className="h-3.5 w-3.5 shrink-0"
            driver={snapshot.driver}
            iconUrl={snapshot.iconUrl}
          />
          <span className="text-foreground truncate text-[13px] font-medium">
            {snapshot.label}
          </span>
          {checkedAt && !limits?.unavailable ? (
            <span
              className={`text-[11px] ${isStale ? "text-warning" : "text-muted"}`}
              title={formatCheckedAtTitle(limits?.checkedAt)}
            >
              {checkedAt}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {canReadKeychain ? (
            <Button
              className="h-6 min-w-0 px-2 text-[11px]"
              isDisabled={isBusy}
              onPress={() => setConfirmKeychain(true)}
              size="sm"
              variant="secondary"
            >
              Read login from Keychain
            </Button>
          ) : null}
          <Button
            className="h-6 min-w-0 px-2 text-[11px]"
            isDisabled={isBusy || !snapshot.usable}
            isPending={refresh.isPending}
            onPress={() => void handleRefresh()}
            size="sm"
            variant="secondary"
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-2">
        {notice ? (
          <p className="text-muted text-[11px]">{notice}</p>
        ) : limits ? (
          <>
            <div className={isStale ? "opacity-60" : undefined}>
              <UsageLimitsWindows limits={limits} now={now} />
            </div>
            {isStale && !snapshot.usable ? (
              <p className="text-muted mt-1.5 text-[11px]">
                Last known usage: {snapshot.label} needs to be ready to read it
                again.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <AlertDialog.Backdrop
        isOpen={confirmKeychain}
        onOpenChange={(isOpen) => {
          if (!isOpen && !readKeychain.isPending) setConfirmKeychain(false);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="sm:max-w-[460px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>
                Read Cursor&apos;s login from the Keychain?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="space-y-2 text-sm">
                <p className="text-foreground">
                  The Cursor CLI keeps its login in the macOS Keychain. Sentinel
                  reads it once with the system security tool to show{" "}
                  {snapshot.label}&apos;s plan usage.
                </p>
                <p className="text-muted">
                  macOS will ask you to allow the access. The login stays in
                  Sentinel&apos;s memory until it restarts and is only sent to
                  Cursor.
                </p>
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={readKeychain.isPending}
                onPress={() => setConfirmKeychain(false)}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={readKeychain.isPending}
                onPress={() => void handleReadKeychain()}
                variant="primary"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Read login
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}

/** Settings → Engines: each instance's plan usage. */
export function EngineUsageLimitsSection({
  snapshots,
}: {
  snapshots: EngineSnapshot[];
}) {
  const withUsage = snapshots.filter(isUsageLimitsSnapshot);
  if (withUsage.length === 0) {
    return null;
  }

  return (
    <div className="border-separator/20 bg-surface rounded-2xl border">
      <div className="border-separator/20 border-b px-3 py-2">
        <p className="text-foreground text-[13px] font-medium">Usage limits</p>
        <p className="text-muted text-[11px]">
          Plan usage each engine account reports, read every few minutes while
          the engine is ready and live during runs.
        </p>
      </div>
      <div className="divide-separator/20 divide-y">
        {withUsage.map((snapshot) => (
          <UsageLimitsRow key={snapshot.instanceId} snapshot={snapshot} />
        ))}
      </div>
    </div>
  );
}
