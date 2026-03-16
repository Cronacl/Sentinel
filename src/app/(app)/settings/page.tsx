"use client";

import { Button, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ControlledNumberField,
  ControlledSwitchField,
  ControlledTextField,
} from "@/components/forms/controlled-fields";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  applyThemePreference,
  DEFAULT_THEME_PREFERENCE,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/theme";
import {
  DEFAULT_WEBFETCH_BATCH_ENABLED,
  DEFAULT_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import {
  type GeneralSettingsFormValues,
  generalSettingsFormSchema,
} from "@/schemas/general-settings.schema";
import { api } from "@/trpc/react";

const THEME_ICON = {
  dark: Moon02Icon,
  light: Sun03Icon,
  system: ComputerIcon,
} as const;

function GeneralSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="border-separator bg-surface rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
        </div>
      </section>

      <section className="border-separator bg-surface rounded-xl border p-5">
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
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  const [submitError, setSubmitError] = useState("");
  const [generalSettingsError, setGeneralSettingsError] = useState("");

  const { data: appearance, error, isPending } = api.appearance.get.useQuery();
  const generalSettings = api.generalSettings.get.useQuery();

  const generalSettingsForm = useForm<GeneralSettingsFormValues>({
    defaultValues: {
      webFetchBatchEnabled: DEFAULT_WEBFETCH_BATCH_ENABLED,
      webFetchBatchLimit: DEFAULT_WEBFETCH_BATCH_LIMIT,
      skillsBasePath: null,
    },
    resolver: zodResolver(generalSettingsFormSchema),
  });

  useEffect(() => {
    if (!appearance) {
      return;
    }

    setThemePreference(appearance.themePreference);
  }, [appearance]);

  const updateAppearance = api.appearance.update.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (
        _current,
        nextValues: { themePreference: ThemePreference },
      ) => ({
        themePreference: nextValues.themePreference,
      }),
      getData: () => utils.appearance.get.getData(),
      onError: (mutationError, _variables, context) => {
        setSubmitError(mutationError.message);
        const previousTheme =
          context.previousData?.themePreference ?? appearance?.themePreference;
        if (previousTheme) {
          utils.appearance.get.setData(undefined, {
            themePreference: previousTheme,
          });
          setThemePreference(previousTheme);
          applyThemePreference(previousTheme);
          window.dispatchEvent(new Event("sentinel-theme-change"));
        }
      },
      onSuccess: (data) => {
        setSubmitError("");
        setThemePreference(data.themePreference);
        applyThemePreference(data.themePreference);
        window.dispatchEvent(new Event("sentinel-theme-change"));
      },
      setData: (value) => {
        utils.appearance.get.setData(undefined, value);
      },
    }),
  );

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
      },
      setData: (value) => {
        utils.generalSettings.get.setData(undefined, value);
      },
    }),
  );

  const handleThemeChange = async (nextTheme: ThemePreference) => {
    if (nextTheme === themePreference || updateAppearance.isPending) {
      return;
    }

    setSubmitError("");
    const previousTheme = themePreference;

    setThemePreference(nextTheme);
    applyThemePreference(nextTheme);
    window.dispatchEvent(new Event("sentinel-theme-change"));

    try {
      await updateAppearance.mutateAsync({ themePreference: nextTheme });
    } catch {
      setThemePreference(previousTheme);
      applyThemePreference(previousTheme);
      window.dispatchEvent(new Event("sentinel-theme-change"));
    }
  };

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

  const webFetchBatchEnabled = generalSettingsForm.watch(
    "webFetchBatchEnabled",
  );
  const webFetchBatchLimit = generalSettingsForm.watch("webFetchBatchLimit");
  const skillsBasePath = generalSettingsForm.watch("skillsBasePath");

  return (
    <SettingsPageWrapper
      subtitle="Manage how Sentinel looks across your account."
      title="General"
    >
      {error ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {error.message}
        </p>
      ) : null}

      {submitError ? (
        <p className="border-danger/20 bg-danger-soft text-danger-soft-foreground mb-4 rounded-xl border px-3 py-2.5 text-xs">
          {submitError}
        </p>
      ) : null}

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

      {(!appearance && isPending) ||
      (!generalSettings.data && generalSettings.isPending) ? (
        <GeneralSettingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="border-separator bg-surface rounded-xl border p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Appearance
                </h2>
                <p className="text-muted text-sm">
                  Choose your preferred theme.
                </p>
              </div>

              <div className="bg-background border-separator inline-flex w-full flex-wrap gap-1 rounded-full border p-1 lg:w-auto lg:flex-nowrap">
                {THEME_OPTIONS.map((option) => {
                  const isSelected = themePreference === option.value;
                  const isPending = updateAppearance.isPending && isSelected;

                  return (
                    <Button
                      className="justify-center rounded-full"
                      isDisabled={updateAppearance.isPending}
                      key={option.value}
                      onPress={() => void handleThemeChange(option.value)}
                      size="sm"
                      variant={isSelected ? "tertiary" : "ghost"}
                    >
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : (
                        <HugeiconsIcon
                          color="currentColor"
                          icon={THEME_ICON[option.value]}
                          size={16}
                          strokeWidth={1.5}
                        />
                      )}
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
          >
            <section className="border-separator bg-surface rounded-xl border p-5">
              <div className="mb-5 space-y-1">
                <h2 className="text-foreground text-base font-medium">
                  Web fetch
                </h2>
                <p className="text-muted text-sm">
                  Control whether Sentinel can fetch multiple URLs in one
                  `webfetch` call and how large a batch is allowed.
                </p>
              </div>

              <div className="space-y-5">
                <ControlledSwitchField
                  control={generalSettingsForm.control}
                  description="When enabled, the assistant can fetch several URLs in a single webfetch call."
                  label="Enable batch web fetch"
                  name="webFetchBatchEnabled"
                />

                <ControlledNumberField
                  control={generalSettingsForm.control}
                  description="Maximum number of URLs allowed in one batch webfetch call. Default is 10."
                  inputProps={{ className: "w-full" }}
                  label="Batch URL limit"
                  name="webFetchBatchLimit"
                  numberFieldProps={{
                    className: "w-full max-w-xs",
                    isDisabled: !webFetchBatchEnabled,
                    maxValue: 50,
                    minValue: 1,
                  }}
                />

                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted">
                  Current policy:{" "}
                  {webFetchBatchEnabled
                    ? `batch fetches enabled, up to ${webFetchBatchLimit} URLs per call.`
                    : "single-URL fetches only."}
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

            <section className="border-separator mt-5 bg-surface rounded-xl border p-5">
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
