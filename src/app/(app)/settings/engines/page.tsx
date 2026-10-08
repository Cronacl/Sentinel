"use client";

import { Spinner } from "@heroui/react";
import { useCallback, useState } from "react";
import { sileo } from "sileo";

import { useEngineSnapshots } from "@/components/engines/use-engine-snapshots";
import { EngineInstanceCard } from "@/components/settings/engines/engine-instance-card";
import { EngineModelsList } from "@/components/settings/engines/engine-models-list";
import { EngineNetworkSettings } from "@/components/settings/engines/engine-network-settings";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getDriverMeta } from "@/lib/ai/chat/engines/catalog";
import type { EngineSnapshot } from "@/lib/ai/chat/engines/contract";
import { api } from "@/trpc/react";

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
}

/**
 * Instances shown on this page: every external engine's instance, and
 * instances of drivers this build does not know (reported unavailable). The
 * built-in engine has nothing to detect.
 */
function isRuntimeSnapshot(snapshot: EngineSnapshot) {
  return getDriverMeta(snapshot.driver)?.runtime !== "builtin";
}

export default function EnginesPage() {
  const snapshotsQuery = useEngineSnapshots();
  const refresh = api.engines.refresh.useMutation();
  const utils = api.useUtils();
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const snapshots = (snapshotsQuery.data ?? []).filter(isRuntimeSnapshot);

  const handleRefresh = useCallback(
    async (snapshot: EngineSnapshot) => {
      if (refreshing) {
        return;
      }

      setActionError("");
      setRefreshing(snapshot.instanceId);

      try {
        const next = await refresh.mutateAsync({
          instanceId: snapshot.instanceId,
        });
        utils.engines.snapshots.setData(undefined, (current) =>
          current?.map((item) =>
            item.instanceId === next.instanceId ? next : item,
          ),
        );
        await Promise.all([
          utils.engines.composerCatalog.invalidate(),
          utils.engines.models.invalidate(),
        ]);

        if (!next.usable && next.message) {
          sileo.error({ description: next.message });
        } else {
          sileo.success({
            description: `${next.label} detection reloaded.`,
          });
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to reload runtime detection.",
        );
      } finally {
        setRefreshing((current) =>
          current === snapshot.instanceId ? null : current,
        );
      }
    },
    [refresh, refreshing, utils.engines],
  );

  return (
    <SettingsPageWrapper
      subtitle="Inspect local coding engines, detected runtimes, and engine-specific model options."
      title="Engines"
    >
      {snapshotsQuery.isPending && !snapshotsQuery.data ? (
        <SettingsLoadingSpinner />
      ) : (
        <>
          {actionError ? (
            <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              {snapshots.map((snapshot) => (
                <EngineInstanceCard
                  isRefreshing={refreshing === snapshot.instanceId}
                  key={snapshot.instanceId}
                  onRefresh={() => void handleRefresh(snapshot)}
                  snapshot={snapshot}
                />
              ))}
            </div>

            <EngineModelsList snapshots={snapshots} />

            <EngineNetworkSettings />
          </div>
        </>
      )}
    </SettingsPageWrapper>
  );
}
