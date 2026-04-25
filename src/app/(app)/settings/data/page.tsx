"use client";

import { AlertDialog, Button, Spinner } from "@heroui/react";
import {
  Database01Icon,
  Download04Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { sileo } from "sileo";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { api } from "@/trpc/react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

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

export default function DataSettingsPage() {
  const utils = api.useUtils();
  const [actionError, setActionError] = useState("");
  const [pendingDeleteFilename, setPendingDeleteFilename] = useState<
    string | null
  >(null);

  const backups = api.backup.list.useQuery();

  const createBackup = api.backup.create.useMutation({
    onSuccess: async (data) => {
      setActionError("");
      await utils.backup.list.invalidate();
      sileo.success({ description: `Backup created: ${data.filename}` });
    },
    onError: (error) => {
      setActionError(error.message);
    },
  });

  const deleteBackup = api.backup.delete.useMutation({
    onSuccess: async () => {
      setActionError("");
      setPendingDeleteFilename(null);
      await utils.backup.list.invalidate();
      sileo.success({ description: "Backup deleted." });
    },
    onError: (error) => {
      setActionError(error.message);
      setPendingDeleteFilename(null);
    },
  });

  const handleExport = () => {
    window.open("/api/backup/export", "_blank");
  };

  const isBusy = createBackup.isPending || deleteBackup.isPending;

  return (
    <SettingsPageWrapper
      subtitle="Create backups, export your database, and manage saved snapshots."
      title="Data"
    >
      {actionError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {actionError}
        </p>
      ) : null}

      {backups.isPending && !backups.data ? (
        <SettingsLoadingSpinner />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator/20 bg-surface rounded-2xl border">
            <SettingsSectionRow
              description="Create a snapshot of your local SQLite database. Auto-backups run on startup when the last one is older than 12 hours."
              isFirst
              title="Create backup"
            >
              <Button
                isDisabled={isBusy}
                isPending={createBackup.isPending}
                onPress={() => {
                  setActionError("");
                  createBackup.mutate({ label: "manual" });
                }}
                size="sm"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Database01Icon}
                        size={15}
                        strokeWidth={1.5}
                      />
                    )}
                    Create backup
                  </>
                )}
              </Button>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Download the full SQLite database file."
              title="Export database"
            >
              <Button
                isDisabled={isBusy}
                onPress={handleExport}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Download04Icon}
                  size={15}
                  strokeWidth={1.5}
                />
                Export database
              </Button>
            </SettingsSectionRow>
          </section>

          <section className="border-separator/20 bg-surface rounded-2xl border">
            <div className="p-5">
              <h2 className="text-foreground text-base font-medium">Backups</h2>
              <p className="text-muted mt-1 text-sm">
                {backups.data && backups.data.length > 0
                  ? `${backups.data.length} backup${backups.data.length === 1 ? "" : "s"} stored in ~/.sentinel/backups/`
                  : "No backups yet. Create one above or wait for the next automatic backup."}
              </p>
            </div>

            <div className="divide-separator/50 divide-y border-t border-border/50">
              {backups.data && backups.data.length > 0 ? (
                backups.data.map((backup) => {
                  const isAuto = backup.filename.includes("_auto");
                  return (
                    <div
                      className="flex items-center justify-between gap-4 px-5 py-3.5"
                      key={backup.filename}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-foreground truncate text-sm font-medium font-mono">
                            {backup.filename}
                          </p>
                          {isAuto ? (
                            <span className="bg-foreground/8 text-muted shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                              auto
                            </span>
                          ) : (
                            <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                              manual
                            </span>
                          )}
                        </div>
                        <p className="text-muted mt-0.5 text-xs">
                          {formatDate(backup.createdAt)} ·{" "}
                          {formatBytes(backup.sizeBytes)}
                        </p>
                      </div>
                      <Button
                        isDisabled={isBusy}
                        isPending={
                          deleteBackup.isPending &&
                          deleteBackup.variables?.filename === backup.filename
                        }
                        onPress={() =>
                          setPendingDeleteFilename(backup.filename)
                        }
                        size="sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          color="currentColor"
                          icon={Delete02Icon}
                          size={15}
                          strokeWidth={1.5}
                        />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-muted text-sm">
                    No backups found. Create your first backup above.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <AlertDialog.Backdrop
        isOpen={pendingDeleteFilename !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDeleteFilename(null);
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className=" sm:max-w-[460px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete backup?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="space-y-2 text-sm">
                <p className="text-foreground">
                  This permanently removes this backup file.
                </p>
                <p className="text-muted font-mono text-xs break-all">
                  {pendingDeleteFilename}
                </p>
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={isBusy}
                onPress={() => setPendingDeleteFilename(null)}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isPending={deleteBackup.isPending}
                onPress={() => {
                  if (pendingDeleteFilename) {
                    deleteBackup.mutate({ filename: pendingDeleteFilename });
                  }
                }}
                variant="danger"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </SettingsPageWrapper>
  );
}
