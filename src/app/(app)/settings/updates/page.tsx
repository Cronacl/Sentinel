"use client";

import { Button, Chip, ProgressBar, Spinner } from "@heroui/react";
import {
  Download04Icon,
  RefreshIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
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

function SettingsSectionRow({
  children,
  description,
  isFirst = false,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  isFirst?: boolean;
  title: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between${isFirst ? "" : " border-t border-border/50"}`}
    >
      <div className="space-y-1">
        <h2 className="text-foreground text-base font-medium">{title}</h2>
        <p className="text-muted text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
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
        : "https://github.com/Cronacl/Sentinel/releases",
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
    state && !state.isSupported
      ? "Manual release installs"
      : state?.status === "up_to_date"
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
        subtitle="Desktop releases distributed through GitHub Releases."
        title="Updates"
      >
        <section className="border-separator/20 bg-surface rounded-2xl border">
          <SettingsSectionRow
            description="Native background updates are available only inside the Sentinel desktop app."
            isFirst
            title="Desktop only"
          >
            <span className="text-muted text-sm">
              Open the packaged desktop app to manage updates.
            </span>
          </SettingsSectionRow>
        </section>
      </SettingsPageWrapper>
    );
  }

  const errorMessage = actionError || state?.errorMessage;

  return (
    <SettingsPageWrapper
      subtitle="Desktop releases distributed through GitHub Releases."
      title="Updates"
    >
      {errorMessage ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {errorMessage}
        </p>
      ) : null}

      {!state ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator/20 bg-surface rounded-2xl border">
            <SettingsSectionRow
              description="The version currently running on this machine."
              isFirst
              title="Current version"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-medium font-mono">
                  {currentVersion}
                </span>
                <Chip
                  color={getUpdateStatusColor(state)}
                  size="sm"
                  variant="soft"
                >
                  {getUpdateStatusLabel(state)}
                </Chip>
              </div>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="The newest stable release available."
              title="Latest stable"
            >
              <span className="text-foreground text-sm font-medium font-mono">
                {latestVersion}
              </span>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="When Sentinel last checked for a new release."
              title="Last checked"
            >
              <span className="text-foreground text-sm font-medium">
                {formatUpdateTimestamp(state.checkedAt)}
              </span>
            </SettingsSectionRow>

            {!state.isSupported ? (
              <div className="border-t border-border/50 px-5 py-3">
                <p className="text-muted text-xs">
                  <span className="text-foreground font-medium">
                    Native updates are unavailable.
                  </span>{" "}
                  {state.supportReason ??
                    "This build does not support background updates."}
                </p>
              </div>
            ) : null}

            {isProgressVisible ? (
              <div className="border-t border-border/50 px-5 py-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {state.releaseName ??
                        `Sentinel ${state.availableVersion ?? ""}`.trim()}
                    </p>
                    <p className="text-muted mt-0.5 text-xs">
                      {state.status === "downloaded"
                        ? "Ready to install. Restart Sentinel to finish."
                        : "Downloading in the background."}
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

            <div className="flex flex-wrap gap-3 border-t border-border/50 p-5">
              {state.isSupported ? (
                <Button
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
              ) : null}
              <Button onPress={handleOpenRelease} size="sm" variant="tertiary">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Download04Icon}
                  size={15}
                  strokeWidth={1.5}
                />
                Release notes
              </Button>
            </div>
          </section>

          {state.releaseNotes ? (
            <section className="border-separator/20 bg-surface rounded-2xl border">
              <div className="p-5">
                <h2 className="text-foreground text-base font-medium">
                  What&apos;s new
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Release details for the latest available stable update.
                </p>
              </div>
              <div className="border-t border-border/50 px-5 py-4">
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
