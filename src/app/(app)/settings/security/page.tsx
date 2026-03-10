"use client";

import { Button, Chip, Skeleton, Spinner } from "@heroui/react";
import {
  DatabaseIcon,
  RefreshIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopServicesStatus } from "@/lib/desktop/contracts";
import { api } from "@/trpc/react";

const DEFAULT_STATUS: DesktopServicesStatus = {
  appServer: false,
};

function SecuritySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-28 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </section>

      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-4 w-80 max-w-full rounded-md" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </section>
    </div>
  );
}

function StatusChip({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <Chip color={isActive ? "success" : "default"} size="sm" variant="soft">
      {label}
    </Chip>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background border-separator rounded-xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-muted text-xs">{label}</p>
        <p className="text-foreground truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function RuntimeRow({
  label,
  value,
  isActive,
}: {
  isActive: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-background border-separator flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
      <span className="text-foreground text-sm font-medium">{label}</span>
      <StatusChip isActive={isActive} label={value} />
    </div>
  );
}

export default function SecuritySettingsPage() {
  const account = api.auth.me.useQuery();
  const [services, setServices] =
    useState<DesktopServicesStatus>(DEFAULT_STATUS);
  const [version, setVersion] = useState("Desktop runtime");
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [hasDesktopRuntime, setHasDesktopRuntime] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const loadRuntimeState = async (showPending = true) => {
    const desktop = getDesktopApi();

    if (showPending) {
      setIsRefreshing(true);
    }

    if (!desktop) {
      setHasDesktopRuntime(false);
      setServices(DEFAULT_STATUS);
      setRuntimeMessage(
        "Runtime controls are only available inside the Sentinel desktop app.",
      );
      if (showPending) {
        setIsRefreshing(false);
      }
      return;
    }

    try {
      setHasDesktopRuntime(true);
      setRuntimeMessage("");
      const [nextServices, nextVersion] = await Promise.all([
        desktop.services.status(),
        desktop.app.getVersion(),
      ]);
      setServices(nextServices);
      setVersion(nextVersion);
    } catch (error) {
      setHasDesktopRuntime(true);
      setRuntimeMessage(
        error instanceof Error
          ? error.message
          : "Unable to load local runtime state.",
      );
    } finally {
      if (showPending) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadRuntimeState(false);
  }, []);

  const runRuntimeAction = async (action: "start" | "stop") => {
    const desktop = getDesktopApi();
    if (!desktop) {
      setHasDesktopRuntime(false);
      setRuntimeMessage(
        "Runtime controls are only available inside the Sentinel desktop app.",
      );
      return;
    }

    setIsPending(true);
    setRuntimeMessage("");

    try {
      const nextServices =
        action === "start"
          ? await desktop.services.start()
          : await desktop.services.stop();
      setServices(nextServices);
    } catch (error) {
      setRuntimeMessage(
        error instanceof Error
          ? error.message
          : "Unable to update local runtime services.",
      );
    } finally {
      setIsPending(false);
    }
  };

  if (account.isPending) {
    return (
      <SettingsPageWrapper
        subtitle="Local account and runtime controls."
        title="Security"
      >
        <SecuritySkeleton />
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      subtitle="Local account and runtime controls."
      title="Security"
    >
      {account.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {account.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <section className="border-separator bg-surface rounded-xl border p-5">
          <div className="mb-5 space-y-1">
            <h2 className="text-foreground text-base font-medium">Account</h2>
          </div>

          <div className="space-y-2">
            <InfoRow
              label="Account email"
              value={account.data?.email || "local@sentinel.app"}
            />
          </div>
        </section>

        <section className="border-separator bg-surface rounded-xl border p-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  color="currentColor"
                  icon={DatabaseIcon}
                  size={18}
                  strokeWidth={1.5}
                />
                <h2 className="text-foreground text-base font-medium">
                  Runtime
                </h2>
              </div>
              <p className="text-muted text-sm leading-6">
                Manage local services.
              </p>
            </div>

            <Button
              isPending={isRefreshing}
              onPress={() => void loadRuntimeState()}
              size="sm"
              variant="ghost"
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <Spinner color="current" size="sm" />
                  ) : (
                    <HugeiconsIcon
                      color="currentColor"
                      icon={RefreshIcon}
                      size={16}
                      strokeWidth={1.5}
                    />
                  )}
                  Refresh
                </>
              )}
            </Button>
          </div>

          {runtimeMessage ? (
            <p
              className={`mb-4 rounded-xl border px-3 py-2.5 text-xs ${
                hasDesktopRuntime
                  ? "border-danger/20 bg-danger-soft text-danger-soft-foreground"
                  : "border-separator bg-background text-muted"
              }`}
            >
              {runtimeMessage}
            </p>
          ) : null}

          <div className="space-y-2">
            <RuntimeRow
              isActive={services.appServer}
              label="App Server"
              value={services.appServer ? version : "Offline"}
            />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              isDisabled={!hasDesktopRuntime}
              isPending={isPending}
              onPress={() => void runRuntimeAction("stop")}
              type="button"
              variant="ghost"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Stop server
                </>
              )}
            </Button>
            <Button
              isDisabled={!hasDesktopRuntime}
              isPending={isPending}
              onPress={() => void runRuntimeAction("start")}
              type="button"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Start server
                </>
              )}
            </Button>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
}
