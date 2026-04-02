"use client";

import { Button, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledNumberField,
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import {
  DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED,
  DEFAULT_CONTEXT_COMPACTION_ENABLED,
  DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
  DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
  DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
  DEFAULT_FOLLOW_UP_BEHAVIOR,
  MAX_FIXED_CONTEXT_WINDOW_SIZE,
  MIN_FIXED_CONTEXT_WINDOW_SIZE,
  type FollowUpBehavior,
  type GeneralSettingsFormValues,
  generalSettingsFormSchema,
} from "@/schemas/general-settings.schema";
import { api } from "@/trpc/react";

function GeneralSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator/20 bg-surface rounded-2xl border p-5">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>

        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>

        <div className="mt-5 flex justify-end">
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </section>
    </div>
  );
}

export default function GeneralSettingsPage() {
  const utils = api.useUtils();
  const [generalSettingsError, setGeneralSettingsError] = useState("");

  const generalSettings = api.generalSettings.get.useQuery();

  const generalSettingsForm = useForm<GeneralSettingsFormValues>({
    defaultValues: {
      persistBrowserSession: DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED,
      contextCompactionEnabled: DEFAULT_CONTEXT_COMPACTION_ENABLED,
      contextCompactionFixedWindowSize: DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
      contextCompactionUseFixedWindow:
        DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
      contextCompactionWindowPercent: DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
      followUpBehavior: DEFAULT_FOLLOW_UP_BEHAVIOR,
      webFetchBatchEnabled: false,
      webFetchBatchLimit: 10,
      skillsBasePath: null,
    },
    resolver: zodResolver(generalSettingsFormSchema),
  });

  useEffect(() => {
    if (!generalSettings.data) {
      return;
    }

    generalSettingsForm.reset(generalSettings.data);
  }, [generalSettings.data, generalSettingsForm]);

  const updateGeneralSettings = api.generalSettings.update.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (_current, values: GeneralSettingsFormValues) =>
        values,
      getData: () => utils.generalSettings.get.getData(),
      onError: (mutationError) => {
        setGeneralSettingsError(mutationError.message);
      },
      onSuccess: (data) => {
        setGeneralSettingsError("");
        utils.generalSettings.get.setData(undefined, data);
        generalSettingsForm.reset(data);
        sileo.success({ description: "Settings saved." });
      },
      setData: (value) => {
        utils.generalSettings.get.setData(undefined, value);
      },
    }),
  );

  const handleGeneralSettingsSubmit = async (
    values: GeneralSettingsFormValues,
  ) => {
    setGeneralSettingsError("");

    try {
      await updateGeneralSettings.mutateAsync(values);
    } catch {
      // mutation state handles surfacing errors
    }
  };

  const contextCompactionEnabled = generalSettingsForm.watch(
    "contextCompactionEnabled",
  );
  const contextCompactionFixedWindowSize = generalSettingsForm.watch(
    "contextCompactionFixedWindowSize",
  );
  const contextCompactionUseFixedWindow = generalSettingsForm.watch(
    "contextCompactionUseFixedWindow",
  );
  const contextCompactionWindowPercent = generalSettingsForm.watch(
    "contextCompactionWindowPercent",
  );
  const skillsBasePath = generalSettingsForm.watch("skillsBasePath");

  return (
    <SettingsPageWrapper
      subtitle="Configure how Sentinel behaves across conversations, tools, and workspace workflows."
      title="General"
    >
      {generalSettings.error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {generalSettings.error.message}
        </p>
      ) : null}

      {generalSettingsError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {generalSettingsError}
        </p>
      ) : null}

      {!generalSettings.data && generalSettings.isPending ? (
        <GeneralSettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Follow-up behavior
                </h2>
                <p className="text-muted text-sm">
                  Queue follow-ups while the model runs or steer the current
                  run.
                </p>
              </div>

              <div className="bg-background border-separator inline-flex w-full flex-wrap gap-1 rounded-full border p-1 lg:w-auto lg:flex-nowrap">
                {(
                  [
                    { label: "Queue", value: "queue" },
                    { label: "Steer", value: "steer" },
                  ] as const
                ).map((option) => {
                  const currentBehavior =
                    generalSettingsForm.watch("followUpBehavior") ??
                    DEFAULT_FOLLOW_UP_BEHAVIOR;
                  const isSelected = currentBehavior === option.value;

                  return (
                    <Button
                      className="justify-center rounded-full"
                      isDisabled={updateGeneralSettings.isPending}
                      key={option.value}
                      onPress={() => {
                        if (option.value === currentBehavior) return;
                        const values = generalSettingsForm.getValues();
                        void updateGeneralSettings.mutateAsync({
                          ...values,
                          followUpBehavior: option.value as FollowUpBehavior,
                        });
                        generalSettingsForm.setValue(
                          "followUpBehavior",
                          option.value as FollowUpBehavior,
                        );
                      }}
                      size="sm"
                      variant={isSelected ? "tertiary" : "ghost"}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </section>

          <Form
            onSubmit={generalSettingsForm.handleSubmit(
              handleGeneralSettingsSubmit,
            )}
            className="flex flex-col gap-6"
          >
            <section className="border-separator/20 bg-surface rounded-2xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Browser session
                </h2>
                <p className="text-muted text-sm">
                  Keep built-in browser tabs and the active page available after
                  the browser panel is closed.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledSwitchField
                  control={generalSettingsForm.control}
                  description="When enabled, browser tabs are restored after closing the panel and after restarting Sentinel. Turn this off if you want browser sessions cleared when the browser is closed."
                  label="Persist browser session"
                  name="persistBrowserSession"
                />
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  isDisabled={
                    updateGeneralSettings.isPending ||
                    !generalSettingsForm.formState.isDirty
                  }
                  isPending={updateGeneralSettings.isPending}
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

            <section className="border-separator/20 bg-surface rounded-2xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Context compaction
                </h2>
                <p className="text-muted text-sm">
                  Use the active model&apos;s context window and compact older
                  transcript history once the estimated prompt reaches your
                  configured threshold.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledSwitchField
                  control={generalSettingsForm.control}
                  description="When enabled, Sentinel summarizes older conversation history before new model calls once the prompt estimate crosses your threshold."
                  label="Enable context compaction"
                  name="contextCompactionEnabled"
                />

                <ControlledNumberField
                  control={generalSettingsForm.control}
                  description="Target percentage of the active model's context window that can be filled before Sentinel compacts older context. Allowed range: 50 to 90."
                  inputProps={{ className: "w-full" }}
                  label="Context window target (%)"
                  name="contextCompactionWindowPercent"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: !contextCompactionEnabled,
                    maxValue: 90,
                    minValue: 50,
                  }}
                />

                <ControlledSwitchField
                  control={generalSettingsForm.control}
                  description="Use a fixed token window for context estimates and compaction instead of the selected model's advertised context window."
                  label="Use fixed context window size"
                  name="contextCompactionUseFixedWindow"
                />

                <ControlledNumberField
                  control={generalSettingsForm.control}
                  description={`Fixed context window size in tokens. Allowed range: ${MIN_FIXED_CONTEXT_WINDOW_SIZE.toLocaleString()} to ${MAX_FIXED_CONTEXT_WINDOW_SIZE.toLocaleString()}.`}
                  inputProps={{ className: "w-full" }}
                  label="Fixed context window size"
                  name="contextCompactionFixedWindowSize"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: !contextCompactionUseFixedWindow,
                    maxValue: MAX_FIXED_CONTEXT_WINDOW_SIZE,
                    minValue: MIN_FIXED_CONTEXT_WINDOW_SIZE,
                  }}
                />

                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted">
                  Current policy:{" "}
                  {contextCompactionEnabled
                    ? `compaction enabled once the estimated prompt reaches ${contextCompactionWindowPercent}% of the ${
                        contextCompactionUseFixedWindow
                          ? `${contextCompactionFixedWindowSize.toLocaleString()}-token fixed window`
                          : "active model context window"
                      }.`
                    : "compaction disabled; full transcript history is sent until the model limit is hit."}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  isDisabled={
                    updateGeneralSettings.isPending ||
                    !generalSettingsForm.formState.isDirty
                  }
                  isPending={updateGeneralSettings.isPending}
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

            <section className="border-separator/20 bg-surface rounded-2xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Skills directory
                </h2>
                <p className="text-muted text-sm">
                  Override where Sentinel looks for global skills. Leave empty
                  to use the default home directory.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledTextField
                  control={generalSettingsForm.control}
                  description="Absolute path to use as the base for global skill discovery (e.g. /Users/you/my-skills)."
                  inputProps={{
                    placeholder: "~/.sentinel/skills (default)",
                    className: "w-full font-mono text-sm",
                  }}
                  label="Custom skills base path"
                  name="skillsBasePath"
                  textFieldProps={{ className: "w-full max-w-lg" }}
                />

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted flex-1">
                    Skills will be discovered at:{" "}
                    <span className="font-mono text-foreground">
                      {skillsBasePath
                        ? `${skillsBasePath}/.sentinel/skills/`
                        : "~/.sentinel/skills/"}
                    </span>
                  </div>
                  {skillsBasePath ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        generalSettingsForm.setValue("skillsBasePath", null, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      Reset to default
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  isDisabled={
                    updateGeneralSettings.isPending ||
                    !generalSettingsForm.formState.isDirty
                  }
                  isPending={updateGeneralSettings.isPending}
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
      )}
    </SettingsPageWrapper>
  );
}
