"use client";

import { Button, Chip, ProgressBar, Skeleton, Spinner } from "@heroui/react";
import {
  Download04Icon,
  RefreshIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { sileo } from "sileo";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopUpdateState } from "@/lib/desktop/contracts";
import {
  formatUpdateTimestamp,
  getUpdatePrimaryActionLabel,
  getUpdateProgressText,
  getUpdateReleaseUrl,
  getUpdateStatusColor,
  getUpdateStatusLabel,
} from "@/lib/desktop/updates";

function UpdatesSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator/20 bg-surface rounded-2xl border p-5">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="mt-4">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-separator bg-background/40 rounded-xl border px-4 py-3">
      <p className="text-muted text-xs">{label}</p>
      <p className="text-foreground mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export default function UpdatesSettingsPage() {
  const [actionError, setActionError] = useState("");
  const [isActionPending, setIsActionPending] = useState(false);
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  const desktop = getDesktopApi();
  const releaseUrl = useMemo(
    () =>
      state
        ? getUpdateReleaseUrl(state)
        : "https://github.com/chaqchase/Sentinel/releases",
    [state],
  );

  useEffect(() => {
    if (!desktop) {
      return;
    }

    let isMounted = true;

    void desktop.updates
      .getState()
      .then((nextState) => {
        if (!isMounted) {
          return;
        }

        setState(nextState);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to load update state.",
        );
      });

    const unsubscribe = desktop.updates.onStateChange((nextState) => {
      if (!isMounted) {
        return;
      }

      setState(nextState);
      setIsActionPending(false);
      if (nextState.status === "downloaded") {
        sileo.success({
          description: "Update downloaded. Restart to install.",
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [desktop]);

  const handlePrimaryAction = async () => {
    if (!desktop || !state || !state.isSupported) {
      return;
    }

    setActionError("");
    setIsActionPending(true);

    try {
      if (state.status === "downloaded") {
        sileo.success({ description: "Restarting to install update…" });
        await desktop.updates.install();
        return;
      }

      const nextState = await desktop.updates.check();
      setState(nextState);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update the app right now.",
      );
      setIsActionPending(false);
    }
  };

  const handleOpenRelease = async () => {
    if (!desktop) {
      return;
    }

    await desktop.openExternal(releaseUrl).catch(() => {
      setActionError("Unable to open the release notes in your browser.");
    });
  };

  const currentVersion = state?.currentVersion ?? "Desktop runtime";
  const latestVersion =
    state?.status === "up_to_date"
      ? state.currentVersion
      : (state?.availableVersion ?? "Checking in background");
  const isProgressVisible =
    state?.status === "available" ||
    state?.status === "downloading" ||
    state?.status === "downloaded";
  const isPrimaryPending =
    isActionPending ||
    state?.status === "checking" ||
    state?.status === "available" ||
    state?.status === "downloading";

  if (!desktop) {
    return (
      <SettingsPageWrapper
        subtitle="Background desktop updates powered by GitHub releases."
        title="Updates"
      >
        <section className="border-separator/20 bg-surface rounded-2xl border p-5">
          <div className="mb-4 space-y-1">
            <h2 className="text-foreground text-base font-medium">
              Desktop only
            </h2>
            <p className="text-muted text-sm">
              Native background updates are available only inside the Sentinel
              desktop app.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <p className="text-muted text-sm">
              Open the packaged desktop app to check, download, and install
              updates in the background.
            </p>
          </div>
        </section>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      subtitle="Background desktop updates powered by GitHub releases."
      title="Updates"
    >
      {actionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {actionError}
        </p>
      ) : null}

      {state?.errorMessage ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {state.errorMessage}
        </p>
      ) : null}

      {!state ? (
        <UpdatesSettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={RefreshIcon}
                    size={18}
                    strokeWidth={1.5}
                  />
                  <h2 className="text-foreground text-base font-medium">
                    Sentinel desktop updates
                  </h2>
                </div>
                <p className="text-muted max-w-2xl text-sm">
                  Check for new stable releases, let the app download them in
                  the background, and restart when the update is ready.
                </p>
              </div>
              <Chip
                color={getUpdateStatusColor(state)}
                size="sm"
                variant="soft"
              >
                {getUpdateStatusLabel(state)}
              </Chip>
            </div>

            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InfoPanel label="Current version" value={currentVersion} />
                <InfoPanel label="Latest stable" value={latestVersion} />
                <InfoPanel
                  label="Last checked"
                  value={formatUpdateTimestamp(state.checkedAt)}
                />
              </div>

              {!state.isSupported ? (
                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted">
                  <span className="text-foreground font-medium">
                    Native updates are unavailable.
                  </span>{" "}
                  {state.supportReason ??
                    "This build does not support background updates."}
                </div>
              ) : null}

              {isProgressVisible ? (
                <div className="border-separator bg-background/40 rounded-xl border px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {state.releaseName ??
                          `Sentinel ${state.availableVersion ?? ""}`.trim()}
                      </p>
                      <p className="text-muted mt-1 text-sm">
                        {state.status === "downloaded"
                          ? "The update package is ready. Restart Sentinel to finish the installation."
                          : "Sentinel is downloading the update package in the background."}
                      </p>
                    </div>
                    <span className="text-muted text-sm">
                      {getUpdateProgressText(state)}
                    </span>
                  </div>

                  <ProgressBar.Root
                    aria-label="Update download progress"
                    className="gap-2.5"
                    color={state.status === "downloaded" ? "success" : "accent"}
                    isIndeterminate={state.bytesTotal === null}
                    size="md"
                    value={state.downloadPercent ?? undefined}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted text-xs">
                        {state.status === "downloaded"
                          ? "Downloaded"
                          : "Downloading"}
                      </span>
                      <ProgressBar.Output className="text-foreground text-sm font-medium" />
                    </div>
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar.Root>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  isDisabled={!state.isSupported}
                  isPending={isPrimaryPending}
                  onPress={handlePrimaryAction}
                  size="sm"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : state.status === "downloaded" ? (
                        <HugeiconsIcon
                          color="currentColor"
                          icon={Rocket01Icon}
                          size={15}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <HugeiconsIcon
                          color="currentColor"
                          icon={RefreshIcon}
                          size={15}
                          strokeWidth={1.5}
                        />
                      )}
                      {getUpdatePrimaryActionLabel(state)}
                    </>
                  )}
                </Button>
                <Button
                  onPress={handleOpenRelease}
                  size="sm"
                  variant="tertiary"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Download04Icon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  Release notes
                </Button>
              </div>
            </div>
          </section>

          {state.releaseNotes ? (
            <section className="border-separator/20 bg-surface rounded-2xl border p-5">
              <div className="mb-4 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  What&apos;s new
                </h2>
                <p className="text-muted text-sm">
                  Release details for the latest available stable update.
                </p>
              </div>

              <div className="border-separator bg-background/40 rounded-xl border px-4 py-4">
                <pre className="text-muted max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5">
                  {state.releaseNotes}
                </pre>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </SettingsPageWrapper>
  );
}
