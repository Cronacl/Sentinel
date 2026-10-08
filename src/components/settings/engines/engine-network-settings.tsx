"use client";

import { Button, Spinner, Switch } from "@heroui/react";
import { sileo } from "sileo";

import { api, type RouterOutputs } from "@/trpc/react";

type NetworkSettings = RouterOutputs["engines"]["maintenance"]["settings"];
type SettingKey = "remoteManifest" | "updateChecks";

const ROWS: Array<{ description: string; key: SettingKey; title: string }> = [
  {
    description:
      "Refresh the list of models and supported CLI versions from Sentinel's repository every hour. Off: use the copy bundled with this version.",
    key: "remoteManifest",
    title: "Model and version updates",
  },
  {
    description:
      "Look up the newest release of installed CLIs (npm registry, Homebrew) to offer updates.",
    key: "updateChecks",
    title: "Check for CLI updates",
  },
];

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function manifestDescription(manifest: NetworkSettings["manifest"]) {
  const edited = formatDate(manifest.updatedAt);
  switch (manifest.source) {
    case "remote":
    case "cache": {
      const fetched = formatDate(manifest.fetchedAt);
      return `Using the manifest from ${edited ?? "the repository"}${fetched ? `, fetched ${fetched}` : ""}.`;
    }
    default:
      return `Using the manifest bundled with Sentinel${edited ? ` (${edited})` : ""}.`;
  }
}

/** Settings → Engines: what the engine platform may fetch on its own. */
export function EngineNetworkSettings() {
  const utils = api.useUtils();
  const settingsQuery = api.engines.maintenance.settings.useQuery();
  const onSettled = (next: NetworkSettings) => {
    utils.engines.maintenance.settings.setData(undefined, next);
    void utils.engines.snapshots.invalidate();
  };
  const updateSettings = api.engines.maintenance.updateSettings.useMutation({
    onError: (error) => sileo.error({ description: error.message }),
    onSuccess: onSettled,
  });
  const refreshManifest = api.engines.maintenance.refreshManifest.useMutation({
    onError: (error) => sileo.error({ description: error.message }),
    onSuccess: (next) => {
      onSettled(next);
      const { lastError, source } = next.manifest;
      if (!lastError) {
        sileo.success({ description: "Engine manifest refreshed." });
      } else if (source === "bundled") {
        sileo.error({ description: lastError });
      } else {
        // The fetch failed, but an earlier copy is still in effect.
        sileo.warning({
          description: `${lastError} Sentinel keeps using the copy it fetched before.`,
        });
      }
    },
  });

  const settings = settingsQuery.data;
  if (!settings) {
    return settingsQuery.isPending ? (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    ) : null;
  }

  return (
    <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
      {ROWS.map((row) => {
        const setting = settings[row.key];
        return (
          <div className="px-3 py-2.5" key={row.key}>
            <Switch
              isDisabled={
                setting.lockedByEnv !== null || updateSettings.isPending
              }
              isSelected={setting.enabled}
              onChange={(isSelected) =>
                updateSettings.mutate({ [row.key]: isSelected })
              }
            >
              <Switch.Content className="justify-between gap-3 font-normal">
                <div className="space-y-0.5">
                  <p className="text-foreground text-[13px] font-medium">
                    {row.title}
                  </p>
                  <p className="text-muted text-[11px]">
                    {row.description}
                    {setting.lockedByEnv
                      ? ` Turned off by ${setting.lockedByEnv}.`
                      : ""}
                  </p>
                  {row.key === "remoteManifest" ? (
                    <p className="text-muted text-[11px]">
                      {manifestDescription(settings.manifest)}
                    </p>
                  ) : null}
                </div>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
            {row.key === "remoteManifest" && setting.enabled ? (
              <Button
                className="mt-1.5 h-6 min-w-0 px-2 text-[11px]"
                isPending={refreshManifest.isPending}
                onPress={() => refreshManifest.mutate()}
                size="sm"
                variant="secondary"
              >
                Refresh now
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
