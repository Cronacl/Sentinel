"use client";

import { Button, Form, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import { ControlledSelectField } from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { PERMISSION_MODE_OPTIONS } from "@/lib/security";
import {
  type SecuritySettingsFormValues,
  securitySettingsFormSchema,
} from "@/schemas/security.schema";
import { api } from "@/trpc/react";

function SettingsLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-48">
      <Spinner size="sm" />
    </div>
  );
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

function SettingsRowControl({
  children,
  widthClassName = "lg:w-[360px]",
}: {
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div
      className={`flex w-full max-w-full flex-col gap-2 ${widthClassName} lg:items-end`}
    >
      {children}
    </div>
  );
}

export default function SecuritySettingsPage() {
  const utils = api.useUtils();
  const account = api.auth.me.useQuery();
  const securitySettings = api.security.get.useQuery();
  const currentWorkspace = api.workspaces.getCurrent.useQuery();
  const [submitError, setSubmitError] = useState("");

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
        setSubmitError(mutationError.message);
      },
      onSuccess: (data) => {
        setSubmitError("");
        utils.security.get.setData(undefined, data);
        form.reset(data);
        sileo.success({ description: "Security settings saved." });
      },
      setData: (value) => {
        utils.security.get.setData(undefined, value);
      },
    }),
  );

  const handleSubmit = async (values: SecuritySettingsFormValues) => {
    setSubmitError("");

    try {
      await updateSecuritySettings.mutateAsync(values);
    } catch {
      // mutation state handles surfacing errors
    }
  };

  const queryError = account.error ?? securitySettings.error;

  if (account.isPending) {
    return (
      <SettingsPageWrapper
        subtitle="Local account and runtime controls."
        title="Security"
      >
        <SettingsLoadingSpinner />
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      subtitle="Local account and runtime controls."
      title="Security"
    >
      {queryError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {queryError.message}
        </p>
      ) : null}

      {submitError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

      <Form onSubmit={form.handleSubmit(handleSubmit)}>
        <section className="border-separator/20 bg-surface rounded-2xl border">
          <SettingsSectionRow
            description="Choose how broadly Sentinel tools can access your machine."
            isFirst
            title="Permission mode"
          >
            <SettingsRowControl>
              <div className="w-full">
                <ControlledSelectField
                  control={form.control}
                  label="Permission mode"
                  name="permissionMode"
                  options={PERMISSION_MODE_OPTIONS.map((option) => ({
                    description: option.description,
                    label: option.label,
                    value: option.value,
                  }))}
                  selectProps={{ className: "w-full" }}
                />
              </div>
            </SettingsRowControl>
          </SettingsSectionRow>

          <SettingsSectionRow
            description="The filesystem root tools are scoped to for the current workspace."
            title="Workspace root"
          >
            <span className="text-foreground text-sm font-mono">
              {currentWorkspace.data?.rootPath ?? "No workspace selected"}
            </span>
          </SettingsSectionRow>

          <div className="flex justify-end border-t border-border/50 p-5">
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
    </SettingsPageWrapper>
  );
}
