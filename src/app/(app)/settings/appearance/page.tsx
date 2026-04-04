"use client";

import { Button, Form, Skeleton, Spinner } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { sileo } from "sileo";

import {
  ControlledNumberField,
  ControlledSelectField,
} from "@/components/forms/controlled-fields";
import { FontFamilySelector } from "@/components/settings/font-family-selector";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import {
  applyAppearanceSettings,
  CODE_THEME_OPTIONS,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_SIZE,
  FONT_SIZE_STEP,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/appearance";
import {
  type AppearanceFormValues,
  appearanceFormSchema,
} from "@/schemas/appearance.schema";
import { api } from "@/trpc/react";

const THEME_ICON = {
  dark: Moon02Icon,
  light: Sun03Icon,
  system: ComputerIcon,
} as const;

function dispatchAppearanceEvents() {
  window.dispatchEvent(new Event("sentinel-appearance-change"));
  window.dispatchEvent(new Event("sentinel-theme-change"));
}

function AppearanceSkeleton() {
  return (
    <section className="border-separator/20 bg-surface rounded-2xl border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          className={`flex items-center justify-between gap-6 p-5${i > 0 ? " border-t border-border/50" : ""}`}
          key={i}
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-8 w-40 shrink-0 rounded-xl" />
        </div>
      ))}
      <div className="flex justify-end border-t border-border/50 p-5">
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
    </section>
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

function ResetAction({
  label = "Reset",
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Button onPress={onPress} size="sm" variant="ghost">
      {label}
    </Button>
  );
}

export default function AppearanceSettingsPage() {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<AppearanceFormValues>({
    defaultValues: DEFAULT_APPEARANCE_SETTINGS,
    resolver: zodResolver(appearanceFormSchema),
  });

  const { data: appearance, error, isPending } = api.appearance.get.useQuery();

  useEffect(() => {
    if (!appearance) {
      return;
    }

    form.reset(appearance);
  }, [appearance, form]);

  const updateAppearance = api.appearance.update.useMutation(
    useOptimisticMutation({
      applyOptimisticUpdate: (_current, values: AppearanceFormValues) => values,
      getData: () => utils.appearance.get.getData(),
      onError: (mutationError, _values, context) => {
        const fallback = context.previousData ?? DEFAULT_APPEARANCE_SETTINGS;
        setSubmitError(mutationError.message);
        applyAppearanceSettings(fallback);
        form.reset(fallback);
        dispatchAppearanceEvents();
      },
      onSuccess: (data) => {
        setSubmitError("");
        applyAppearanceSettings(data);
        form.reset(data);
        dispatchAppearanceEvents();
        sileo.success({ description: "Appearance updated." });
      },
      setData: (value) => {
        utils.appearance.get.setData(undefined, value);
      },
    }),
  );

  const appearanceValues = form.watch();
  const themePreference = appearanceValues.themePreference;
  const selectedCodeTheme =
    CODE_THEME_OPTIONS.find(
      (option) => option.value === appearanceValues.codeTheme,
    ) ??
    CODE_THEME_OPTIONS.find((option) => option.value === DEFAULT_CODE_THEME)!;

  const resetField = <TField extends keyof AppearanceFormValues>(
    field: TField,
    value: AppearanceFormValues[TField],
  ) => {
    form.setValue(field, value as never, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleThemeChange = async (nextTheme: ThemePreference) => {
    const currentValues = form.getValues();
    if (
      nextTheme === currentValues.themePreference ||
      updateAppearance.isPending
    ) {
      return;
    }

    const previousValues = appearance ?? currentValues;
    const nextValues = {
      ...currentValues,
      themePreference: nextTheme,
    } satisfies AppearanceFormValues;

    setSubmitError("");
    form.setValue("themePreference", nextTheme, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    applyAppearanceSettings(nextValues);
    dispatchAppearanceEvents();

    try {
      await updateAppearance.mutateAsync(nextValues);
    } catch {
      applyAppearanceSettings(previousValues);
      form.reset(previousValues);
      dispatchAppearanceEvents();
    }
  };

  const handleSubmit = async (values: AppearanceFormValues) => {
    const previousValues = appearance ?? DEFAULT_APPEARANCE_SETTINGS;
    setSubmitError("");
    applyAppearanceSettings(values);
    dispatchAppearanceEvents();

    try {
      await updateAppearance.mutateAsync(values);
    } catch {
      applyAppearanceSettings(previousValues);
      form.reset(previousValues);
      dispatchAppearanceEvents();
    }
  };

  return (
    <SettingsPageWrapper
      subtitle="Adjust theme, fonts, and reading scale."
      title="Appearance"
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

      {!appearance && isPending ? (
        <AppearanceSkeleton />
      ) : (
        <Form onSubmit={form.handleSubmit(handleSubmit)}>
          <section className="border-separator/20 bg-surface rounded-2xl border">
            <SettingsSectionRow
              description="Choose the overall light, dark, or system appearance."
              isFirst
              title="Theme"
            >
              <div className="bg-background border-separator inline-flex w-full flex-wrap gap-1 rounded-full border p-1 lg:w-auto lg:flex-nowrap">
                {THEME_OPTIONS.map((option) => {
                  const isSelected = themePreference === option.value;
                  const isSaving = updateAppearance.isPending && isSelected;

                  return (
                    <Button
                      className="justify-center rounded-full"
                      isDisabled={updateAppearance.isPending}
                      key={option.value}
                      onPress={() => void handleThemeChange(option.value)}
                      size="sm"
                      variant={isSelected ? "tertiary" : "ghost"}
                    >
                      {isSaving ? (
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
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Used for interface text."
              title="UI font family"
            >
              <SettingsRowControl>
                <div className="w-full">
                  <FontFamilySelector
                    control={form.control}
                    mode="ui"
                    name="uiFontFamily"
                    placeholder="Choose a UI font stack"
                    label="UI font family"
                    showDescriptions={false}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Used for terminals, code blocks, and diffs."
              title="Code font family"
            >
              <SettingsRowControl>
                <div className="w-full">
                  <FontFamilySelector
                    control={form.control}
                    mode="code"
                    name="codeFontFamily"
                    placeholder="Choose a code font stack"
                    label="Code font family"
                    showDescriptions={false}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Pick the syntax theme used for code surfaces."
              title="Code theme"
            >
              <SettingsRowControl>
                <div className="w-full">
                  <ControlledSelectField
                    control={form.control}
                    label="Code theme"
                    name="codeTheme"
                    options={CODE_THEME_OPTIONS}
                    selectProps={{ className: "w-full" }}
                    showDescriptions={false}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Adjust the base reading size for interface text from 14 to 18 in half-step increments."
              title="UI font size"
            >
              <SettingsRowControl widthClassName="lg:w-[280px]">
                <div className="w-full">
                  <ControlledNumberField
                    control={form.control}
                    inputProps={{ className: "w-full" }}
                    label="UI font size"
                    name="uiFontSize"
                    numberFieldProps={{
                      className: "w-full",
                      maxValue: 18,
                      minValue: 14,
                      step: FONT_SIZE_STEP,
                    }}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow
              description="Adjust monospace sizing from 11 to 16 in half-step increments."
              title="Code font size"
            >
              <SettingsRowControl widthClassName="lg:w-[280px]">
                <div className="w-full">
                  <ControlledNumberField
                    control={form.control}
                    inputProps={{ className: "w-full" }}
                    label="Code font size"
                    name="codeFontSize"
                    numberFieldProps={{
                      className: "w-full",
                      maxValue: 16,
                      minValue: 11,
                      step: FONT_SIZE_STEP,
                    }}
                  />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <div className="flex justify-end border-t border-border/50 p-5">
              <Button
                isDisabled={
                  updateAppearance.isPending || !form.formState.isDirty
                }
                isPending={updateAppearance.isPending}
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
      )}
    </SettingsPageWrapper>
  );
}
