"use client";

import { Button, Chip, ProgressBar, Spinner } from "@heroui/react";
import { RefreshIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { sileo } from "sileo";

import { MarkdownContent } from "@/components/chat/message-parts/text";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopUpdateState } from "@/lib/desktop/contracts";
import {
  formatUpdateBytes,
  formatUpdateTimestamp,
  getUpdatePrimaryActionLabel,
  getUpdateProgressText,
  getUpdateReleaseUrl,
  getUpdateStatusColor,
  getUpdateStatusLabel,
  LATEST_RELEASE_API_URL,
  normalizeGitHubLatestRelease,
  normalizeReleaseNotesContent,
  selectDesktopReleaseAsset,
  type DesktopLatestRelease,
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

function UpdateDetail({
  children,
  label,
}: {
  children: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-muted text-sm">{label}</p>
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
  const [isReleaseLoading, setIsReleaseLoading] = useState(false);
  const [latestRelease, setLatestRelease] =
    useState<DesktopLatestRelease | null>(null);
  const [releaseError, setReleaseError] = useState("");
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  const desktop = getDesktopApi();
  const downloadAsset = useMemo(
    () =>
      desktop
        ? selectDesktopReleaseAsset(
            latestRelease,
            desktop.app.platform,
            desktop.app.arch,
          )
        : null,
    [desktop, latestRelease],
  );
  const releaseUrl = useMemo(
    () =>
      latestRelease
        ? latestRelease.releasePageUrl
        : state
          ? getUpdateReleaseUrl(state)
          : "https://github.com/Cronacl/Sentinel/releases",
    [latestRelease, state],
  );
  const releaseNotes = useMemo(
    () =>
      normalizeReleaseNotesContent(
        state?.releaseNotes ?? latestRelease?.releaseNotes ?? null,
      ),
    [latestRelease, state],
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

  useEffect(() => {
    if (!desktop) {
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    setIsReleaseLoading(true);
    setReleaseError("");

    void fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load the latest release.");
        }

        const release = normalizeGitHubLatestRelease(await response.json());
        if (!release) {
          throw new Error("The latest release metadata is incomplete.");
        }

        if (isMounted) {
          setLatestRelease(release);
        }
      })
      .catch((error) => {
        if (
          !isMounted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setReleaseError(
          error instanceof Error
            ? error.message
            : "Unable to load the latest release.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsReleaseLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
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

  const handleDownloadLatest = async () => {
    if (!desktop || !downloadAsset) {
      return;
    }

    setActionError("");

    await desktop.openExternal(downloadAsset.downloadUrl).catch(() => {
      setActionError("Unable to open the latest installer download.");
    });
  };

  const currentVersion = state?.currentVersion ?? "Desktop runtime";
  const latestVersion =
    latestRelease?.version ??
    (state && !state.isSupported
      ? "Manual installer"
      : state?.status === "up_to_date"
        ? state.currentVersion
        : (state?.availableVersion ?? "Checking in background"));
  const downloadAssetLabel = downloadAsset
    ? `${downloadAsset.name}${downloadAsset.size !== null ? ` · ${formatUpdateBytes(downloadAsset.size)}` : ""}`
    : isReleaseLoading
      ? "Finding the right installer"
      : "Installer unavailable";
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
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-6 max-w-5xl rounded-xl border px-4 py-3 text-sm leading-6 break-words">
          {errorMessage}
        </p>
      ) : null}

      {!state ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator/20 bg-surface rounded-2xl border p-6 sm:p-8">
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start">
              <div className="min-w-0 space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <p className="text-muted text-sm">Current version</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <span className="text-foreground font-mono text-2xl font-semibold tracking-normal">
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
                  </div>

                  <div className="min-w-0 space-y-2 sm:text-right">
                    <p className="text-muted text-sm">Latest version</p>
                    <span className="text-foreground block font-mono text-2xl font-semibold tracking-normal">
                      {latestVersion}
                    </span>
                  </div>
                </div>

                <div className="grid gap-x-10 gap-y-8 border-t border-border/50 pt-7 md:grid-cols-2">
                  <UpdateDetail label="Last checked">
                    <span className="text-foreground block max-w-64 text-lg font-medium leading-7">
                      {formatUpdateTimestamp(state.checkedAt)}
                    </span>
                  </UpdateDetail>

                  <UpdateDetail label="Installer">
                    <span className="text-foreground block max-w-full text-lg font-medium leading-7 break-words">
                      {downloadAssetLabel}
                    </span>
                  </UpdateDetail>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/50 pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
                {state.isSupported ? (
                  <Button
                    className="w-full justify-center"
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
                <Button
                  className="w-full justify-center"
                  isDisabled={!downloadAsset}
                  isPending={isReleaseLoading}
                  onPress={handleDownloadLatest}
                  size="sm"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Download latest
                    </>
                  )}
                </Button>
                <Button
                  className="w-full justify-center"
                  onPress={handleOpenRelease}
                  size="sm"
                  variant="tertiary"
                >
                  Release notes
                </Button>
              </div>
            </div>

            {!state.isSupported ? (
              <div className="mt-5 border-t border-border/50 pt-4">
                <p className="text-muted text-xs">
                  {state.supportReason ??
                    "This build does not support background updates."}{" "}
                  Use direct download for this build.
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

            {releaseError ? (
              <div className="mt-4 border-t border-border/50 pt-4">
                <p className="text-warning text-xs">{releaseError}</p>
              </div>
            ) : null}
          </section>

          {releaseNotes ? (
            <section className="border-separator/20 bg-surface rounded-2xl border">
              <div className="p-5">
                <h2 className="text-foreground text-base font-medium">
                  What&apos;s new
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Release details for the latest available stable update.
                </p>
              </div>
              <div className="max-h-80 overflow-auto border-t border-border/50 px-5 py-5">
                <div className="[&_.sentinel-prose]:max-w-none [&_.sentinel-prose]:text-sm [&_.sentinel-prose_a]:text-primary [&_.sentinel-prose_a]:decoration-primary/30 [&_.sentinel-prose_h1]:text-xl [&_.sentinel-prose_h1]:font-semibold [&_.sentinel-prose_h2]:text-lg [&_.sentinel-prose_h2]:font-semibold [&_.sentinel-prose_h3]:text-base [&_.sentinel-prose_h3]:font-semibold [&_.sentinel-prose_li]:text-sm [&_.sentinel-prose_p]:text-sm">
                  <MarkdownContent text={releaseNotes} />
                </div>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </SettingsPageWrapper>
  );
}
