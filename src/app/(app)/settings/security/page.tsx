"use client";

import { Button, Chip, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DatabaseIcon,
  RefreshIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import { ControlledSelectField } from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopServicesStatus } from "@/lib/desktop/contracts";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { PERMISSION_MODE_OPTIONS } from "@/lib/security";
import {
  type SecuritySettingsFormValues,
  securitySettingsFormSchema,
} from "@/schemas/security.schema";
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
  const utils = api.useUtils();
  const account = api.auth.me.useQuery();
  const securitySettings = api.security.get.useQuery();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const [services, setServices] =
    useState<DesktopServicesStatus>(DEFAULT_STATUS);
  const [version, setVersion] = useState("Desktop runtime");
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [hasDesktopRuntime, setHasDesktopRuntime] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const form = useForm<SecuritySettingsFormValues>({
    defaultValues: {
      permissionMode: "default",
    },
    resolver: zodResolver(securitySettingsFormSchema),
  });

  useEffect(() => {
    if (!securitySettings.data) {
      return;
    }

    form.reset(securitySettings.data);
  }, [form, securitySettings.data]);

  const updateSecuritySettings = api.security.update.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (_current, values: SecuritySettingsFormValues) =>
        values,
      getData: () => utils.security.get.getData(),
      onError: (mutationError) => {
        setSettingsError(mutationError.message);
      },
      onSuccess: (data) => {
        setSettingsError("");
        utils.security.get.setData(undefined, data);
        form.reset(data);
        sileo.success({ description: "Security settings saved." });
      },
      setData: (value) => {
        utils.security.get.setData(undefined, value);
      },
    }),
  );

  const handleSecuritySubmit = async (values: SecuritySettingsFormValues) => {
    setSettingsError("");

    try {
      await updateSecuritySettings.mutateAsync(values);
    } catch {
      // mutation state handles surfacing errors
    }
  };

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

      {securitySettings.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {securitySettings.error.message}
        </p>
      ) : null}

      {settingsError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {settingsError}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Form onSubmit={form.handleSubmit(handleSecuritySubmit)}>
          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Shield01Icon}
                  size={18}
                  strokeWidth={1.5}
                />
                <h2 className="text-foreground text-base font-medium">
                  Permissions
                </h2>
              </div>
              <p className="text-muted text-sm">
                Choose how broadly Sentinel tools can access your machine.
              </p>
            </div>

            <div className="space-y-5">
              <ControlledSelectField
                control={form.control}
                label="Permission mode"
                name="permissionMode"
                options={PERMISSION_MODE_OPTIONS.map((option) => ({
                  description: option.description,
                  label: option.label,
                  value: option.value,
                }))}
                selectProps={{ className: "w-full max-w-md" }}
              />

              <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted">
                {currentWorkspace.data?.rootPath ? (
                  <>
                    Active workspace root:{" "}
                    <span className="font-mono text-foreground">
                      {currentWorkspace.data.rootPath}
                    </span>
                  </>
                ) : (
                  "Tools remain unavailable until a workspace with a root path is selected."
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                isDisabled={
                  updateSecuritySettings.isPending || !form.formState.isDirty
                }
                isPending={updateSecuritySettings.isPending}
                size="sm"
                type="submit"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Save
                  </>
                )}
              </Button>
            </div>
          </section>
        </Form>
      </div>
    </SettingsPageWrapper>
  );
}
