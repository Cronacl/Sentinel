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
  getCodeThemePalette,
  type ThemePreference,
} from "@/lib/appearance";
import { useResolvedTheme } from "@/lib/syntax/use-resolved-theme";
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
    <section className="border-separator/20 bg-surface rounded-2xl border p-5">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-4 w-80 rounded-md" />
      </div>

      <div className="space-y-5">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      <div className="mt-5 flex justify-end">
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
    </section>
  );
}

function CodeThemeSnippet({
  description,
  label,
  resolvedTheme,
  value,
}: {
  description: string;
  label: string;
  resolvedTheme: "dark" | "light";
  value: AppearanceFormValues["codeTheme"];
}) {
  const palette = getCodeThemePalette(value, resolvedTheme);

  return (
    <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="mb-3 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-black/6 px-3 py-2.5 font-mono text-[11px] leading-[1.55] dark:border-white/8"
        style={{
          backgroundColor: palette.background,
          color: palette.foreground,
        }}
      >
        <div>
          <span style={{ color: palette["token-keyword"] }}>const</span>{" "}
          <span style={{ color: palette["token-function"] }}>theme</span>{" "}
          <span style={{ color: palette["token-punctuation"] }}>=</span>{" "}
          <span style={{ color: palette["token-string"] }}>"{label}"</span>
        </div>
        <div>
          <span style={{ color: palette["token-keyword"] }}>return</span>{" "}
          <span style={{ color: palette["token-function"] }}>render</span>
          <span style={{ color: palette["token-punctuation"] }}>(</span>
          <span style={{ color: palette["token-parameter"] }}>theme</span>
          <span style={{ color: palette["token-punctuation"] }}>)</span>
        </div>
      </div>
    </div>
  );
}

export default function AppearanceSettingsPage() {
  const utils = api.useUtils();
  const [submitError, setSubmitError] = useState("");
  const resolvedTheme = useResolvedTheme();

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
  const selectedCodeTheme =
    CODE_THEME_OPTIONS.find(
      (option) => option.value === appearanceValues.codeTheme,
    ) ?? CODE_THEME_OPTIONS[0];

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
        <Form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <section className="border-separator/20 bg-surface rounded-2xl border p-5">
            <div className="space-y-6">
              <div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-foreground text-base font-medium">
                      Theme
                    </h2>
                    <p className="text-muted text-sm">
                      Choose the overall light, dark, or system appearance.
                    </p>
                  </div>

                  <div className="bg-background border-separator inline-flex w-full flex-wrap gap-1 rounded-full border p-1 lg:w-auto lg:flex-nowrap">
                    {THEME_OPTIONS.map((option) => {
                      const isSelected =
                        form.watch("themePreference") === option.value;
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
                </div>
              </div>

              <div className="border-t border-border/50 pt-6">
                <div className="mb-5">
                  <h2 className="text-foreground text-base font-medium">
                    Typography
                  </h2>
                  <p className="text-muted mt-1 text-sm">
                    Set the font stacks used for UI text and code surfaces.
                  </p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <FontFamilySelector
                      control={form.control}
                      description="Used for non-code interface text."
                      label="UI font family"
                      mode="ui"
                      name="uiFontFamily"
                      placeholder="Choose a UI font stack"
                    />

                    <div className="flex items-center justify-between gap-3 text-xs text-muted">
                      <p className="min-w-0 truncate font-mono">
                        {DEFAULT_UI_FONT_FAMILY}
                      </p>
                      <Button
                        onPress={() =>
                          resetField("uiFontFamily", DEFAULT_UI_FONT_FAMILY)
                        }
                        size="sm"
                        variant="ghost"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <FontFamilySelector
                      control={form.control}
                      description="Used for terminals, code blocks, and inline code."
                      label="Code font family"
                      mode="code"
                      name="codeFontFamily"
                      placeholder="Choose a code font stack"
                    />

                    <div className="flex items-center justify-between gap-3 text-xs text-muted">
                      <p className="min-w-0 truncate font-mono">
                        {DEFAULT_CODE_FONT_FAMILY}
                      </p>
                      <Button
                        onPress={() =>
                          resetField("codeFontFamily", DEFAULT_CODE_FONT_FAMILY)
                        }
                        size="sm"
                        variant="ghost"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50 pt-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-foreground text-base font-medium">
                      Code theme
                    </h2>
                    <p className="text-muted mt-1 text-sm">
                      Pick the palette used for code blocks and diffs.
                    </p>
                  </div>
                  <Button
                    onPress={() => resetField("codeTheme", DEFAULT_CODE_THEME)}
                    size="sm"
                    variant="ghost"
                  >
                    Reset
                  </Button>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-start">
                  <ControlledSelectField
                    control={form.control}
                    description="Applies to code blocks and diff views."
                    label="Theme"
                    name="codeTheme"
                    options={CODE_THEME_OPTIONS}
                    selectProps={{ className: "w-full" }}
                  />

                  <CodeThemeSnippet
                    description={selectedCodeTheme.description}
                    label={selectedCodeTheme.label}
                    resolvedTheme={resolvedTheme}
                    value={selectedCodeTheme.value}
                  />
                </div>
              </div>

              <div className="border-t border-border/50 pt-6">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-foreground text-base font-medium">
                      Sizing
                    </h2>
                    <p className="text-muted mt-1 text-sm">
                      Adjust the base reading scale for UI text and code.
                    </p>
                  </div>
                  <Button
                    onPress={() => {
                      resetField("uiFontSize", DEFAULT_UI_FONT_SIZE);
                      resetField("codeFontSize", DEFAULT_CODE_FONT_SIZE);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Reset sizes
                  </Button>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <ControlledNumberField
                    control={form.control}
                    description="Half-step increments from 14 to 18."
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

                  <ControlledNumberField
                    control={form.control}
                    description="Half-step increments from 11 to 16."
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
              </div>

              <div className="border-t border-border/50 pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-muted">
                    <p>
                      Code theme{" "}
                      {
                        CODE_THEME_OPTIONS.find(
                          (option) =>
                            option.value === appearanceValues.codeTheme,
                        )?.label
                      }
                    </p>
                    <p>UI {appearanceValues.uiFontSize}px</p>
                    <p>Code {appearanceValues.codeFontSize}px</p>
                  </div>
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
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        Save appearance
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </Form>
      )}
    </SettingsPageWrapper>
  );
}
