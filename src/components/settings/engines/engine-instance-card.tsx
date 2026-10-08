"use client";

import { Button, Chip } from "@heroui/react";
import { type ReactNode, useState } from "react";

import { EngineIcon } from "@/components/engines/descriptors";
import {
  getAccountDisplay,
  getAuthLabel,
  getInstallLabel,
  getInstallSourceLabel,
  getSnapshotBadge,
  getSnapshotNotice,
} from "@/components/engines/snapshot-status";
import { getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import type { EngineSnapshot } from "@/lib/ai/chat/engines/contract";

import { EngineAdvisoryBadges } from "./engine-advisory-badges";
import {
  EngineMaintenanceButton,
  EngineMaintenanceProgress,
} from "./engine-maintenance-actions";
import { EngineAuthPanel } from "./engine-auth-panel";

const MASKED_VALUE = "••••••••";

const STABILITY_DESCRIPTIONS = {
  beta: "Beta integration; some features may be missing.",
  experimental:
    "Experimental integration; behavior may change or fail unexpectedly.",
} as const;

function AccountValue({ snapshot }: { snapshot: EngineSnapshot }) {
  const [revealed, setRevealed] = useState(false);
  const account = getAccountDisplay(snapshot.auth);

  return (
    <div className="flex items-center gap-2">
      <span>
        {account.isSensitive && !revealed ? MASKED_VALUE : account.value}
      </span>
      {account.isSensitive ? (
        <Button
          className="h-5 min-w-0 px-1.5 text-[10px]"
          onPress={() => setRevealed((current) => !current)}
          size="sm"
          variant="secondary"
        >
          {revealed ? "Hide" : "Show"}
        </Button>
      ) : null}
    </div>
  );
}

/** One engine instance in Settings → Engines, rendered from its snapshot. */
export function EngineInstanceCard({
  isRefreshing,
  onRefresh,
  snapshot,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
  snapshot: EngineSnapshot;
}) {
  const badge = getSnapshotBadge(snapshot);
  const notice = getSnapshotNotice(snapshot);
  const stability = getDriverMeta(snapshot.driver)?.stability ?? "stable";
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Runtime", value: getInstallLabel(snapshot) },
    ...(snapshot.install.installed
      ? [{ label: "Source", value: getInstallSourceLabel(snapshot) }]
      : []),
    { label: "Auth", value: getAuthLabel(snapshot) },
    { label: "Models", value: `${snapshot.models.length} available` },
    { label: "Account", value: <AccountValue snapshot={snapshot} /> },
  ];

  return (
    <div className="border-separator/20 rounded-2xl border bg-surface px-3 py-2.5">
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
          {snapshot.isDefaultInstance ? null : (
            <Chip size="sm" variant="soft">
              {snapshot.instanceId}
            </Chip>
          )}
          {stability !== "stable" ? (
            <Chip
              aria-label={STABILITY_DESCRIPTIONS[stability]}
              color="warning"
              size="sm"
              variant="soft"
            >
              {stability === "beta" ? "Beta" : "Unstable"}
            </Chip>
          ) : null}
          <EngineAdvisoryBadges snapshot={snapshot} />
        </div>
        <div className="flex items-center gap-1.5">
          <EngineMaintenanceButton snapshot={snapshot} />
          <Button
            className="h-6 min-w-0 px-2 text-[11px]"
            isDisabled={isRefreshing || snapshot.availability === "unavailable"}
            isPending={isRefreshing}
            onPress={onRefresh}
            size="sm"
            variant="secondary"
          >
            Reload
          </Button>
          <Chip color={badge.color} size="sm" variant="soft">
            {badge.label}
          </Chip>
        </div>
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {rows.map((row) => (
          <div className="flex items-center justify-between" key={row.label}>
            <span className="text-muted">{row.label}</span>
            <span className="text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
      <EngineMaintenanceProgress snapshot={snapshot} />
      {notice ? (
        <p className="border-warning/20 bg-warning-soft text-warning-soft-foreground mt-2 rounded-lg border px-2 py-1 text-[11px]">
          {notice}
        </p>
      ) : null}
      <EngineAuthPanel snapshot={snapshot} />
    </div>
  );
}
