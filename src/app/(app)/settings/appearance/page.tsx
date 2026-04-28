"use client";

import {
  Button,
  ColorSlider,
  ColorSwatch,
  Spinner,
  Switch,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { parseColor } from "react-aria-components";

import {
  ControlledNumberField,
  ControlledSelectField,
} from "@/components/forms/controlled-fields";
import { FontFamilySelector } from "@/components/settings/font-family-selector";
import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  applyAppearanceSettings,
  CODE_THEME_OPTIONS,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_SIZE,
  FONT_SIZE_STEP,
  resolveThemePreference,
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

const DEFAULT_ACCENT_COLOR_HUE = 220;
const AUTO_SAVE_DELAY_MS = 400;

function dispatchAppearanceEvents() {
  window.dispatchEvent(new Event("sentinel-appearance-change"));
  window.dispatchEvent(new Event("sentinel-theme-change"));
}

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
  description?: ReactNode;
  isFirst?: boolean;
  title: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between${isFirst ? "" : " border-t border-border/50"}`}
    >
      <div className="space-y-1">
        <h2 className="text-foreground text-base font-medium">{title}</h2>
        {description ? (
          <p className="text-muted text-sm">{description}</p>
        ) : null}
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
  const resetFormRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveRef = useRef(0);

  const form = useForm<AppearanceFormValues>({
    defaultValues: DEFAULT_APPEARANCE_SETTINGS,
    resolver: zodResolver(appearanceFormSchema),
  });

  const { data: appearance, error, isPending } = api.appearance.get.useQuery();

  const updateAppearance = api.appearance.update.useMutation();

  const resetForm = useCallback(
    (values: AppearanceFormValues) => {
      resetFormRef.current = true;
      form.reset(values);
      queueMicrotask(() => {
        resetFormRef.current = false;
      });
    },
    [form],
  );

  useEffect(() => {
    if (!appearance) {
      return;
    }

    resetForm(appearance);
  }, [appearance, resetForm]);

  const applyPreviewValues = useCallback((values: AppearanceFormValues) => {
    applyAppearanceSettings(values);
    dispatchAppearanceEvents();
  }, []);

  const persistValues = useCallback(
    async (values: AppearanceFormValues, saveId: number) => {
      const previousValues =
        utils.appearance.get.getData() ?? DEFAULT_APPEARANCE_SETTINGS;

      setSubmitError("");
      utils.appearance.get.setData(undefined, values);

      try {
        const savedValues = await updateAppearance.mutateAsync(values);

        if (latestSaveRef.current !== saveId) {
          return;
        }

        setSubmitError("");
        utils.appearance.get.setData(undefined, savedValues);
        applyPreviewValues(savedValues);
        resetForm(savedValues);
      } catch (mutationError) {
        if (latestSaveRef.current !== saveId) {
          return;
        }

        const message =
          mutationError instanceof Error
            ? mutationError.message
            : "Failed to update appearance.";

        setSubmitError(message);
        utils.appearance.get.setData(undefined, previousValues);
        applyPreviewValues(previousValues);
        resetForm(previousValues);
      }
    },
    [applyPreviewValues, resetForm, updateAppearance, utils.appearance.get],
  );

  const schedulePersistValues = useCallback(
    (values: AppearanceFormValues, delay = AUTO_SAVE_DELAY_MS) => {
      const saveId = latestSaveRef.current + 1;
      latestSaveRef.current = saveId;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void persistValues(values, saveId);
      }, delay);
    },
    [persistValues],
  );

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (!name || resetFormRef.current) {
        return;
      }

      const parsed = appearanceFormSchema.safeParse(values);
      if (!parsed.success) {
        return;
      }

      applyPreviewValues(parsed.data);
      schedulePersistValues(parsed.data);
    });

    return () => subscription.unsubscribe();
  }, [applyPreviewValues, form, schedulePersistValues]);

  const appearanceValues = form.watch();
  const themePreference = appearanceValues.themePreference;
  const accentHue = appearanceValues.accentColor;
  const accentSliderColor = parseColor(
    `hsl(${accentHue ?? DEFAULT_ACCENT_COLOR_HUE}, 100%, 50%)`,
  );
  const accentSwatchColor =
    accentHue === null
      ? parseColor(
          resolveThemePreference(themePreference) === "dark"
            ? "#ffffff"
            : "#000000",
        )
      : accentSliderColor;
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
    if (nextTheme === currentValues.themePreference) {
      return;
    }

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
    applyPreviewValues(nextValues);
    schedulePersistValues(nextValues, 0);
  };

  const handleAccentColorChange = (
    nextColor: ReturnType<typeof parseColor>,
  ) => {
    const nextHue = Math.round(nextColor.getChannelValue("hue"));

    form.setValue("accentColor", nextHue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleAccentColorReset = () => {
    resetField("accentColor", null);
  };

  const handleSidebarGlassChange = (isSelected: boolean) => {
    form.setValue("sidebarGlassEnabled", isSelected, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
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
        <SettingsLoadingSpinner />
      ) : (
        <div>
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
              description="Tune the accent used by active controls and status highlights."
              title="Accent color"
            >
              <SettingsRowControl widthClassName="lg:w-[320px]">
                <div className="flex w-full items-center gap-3">
                  <ColorSwatch
                    aria-label="Current accent color"
                    className="shrink-0"
                    color={accentSwatchColor}
                    size="sm"
                  />
                  <ColorSlider
                    aria-label="Accent hue"
                    channel="hue"
                    className="min-w-0 flex-1"
                    onChange={handleAccentColorChange}
                    value={accentSliderColor}
                  >
                    <ColorSlider.Track className="h-3 !w-full overflow-hidden rounded-full before:!hidden after:!hidden">
                      <ColorSlider.Thumb className="size-4 rounded-full border-2 border-background shadow-sm" />
                    </ColorSlider.Track>
                  </ColorSlider>
                  <ResetAction onPress={handleAccentColorReset} />
                </div>
              </SettingsRowControl>
            </SettingsSectionRow>

            <SettingsSectionRow title="Glass sidebar">
              <SettingsRowControl widthClassName="lg:w-auto">
                <Switch
                  aria-label="Glass sidebar"
                  className="shrink-0"
                  isSelected={Boolean(appearanceValues.sidebarGlassEnabled)}
                  onChange={handleSidebarGlassChange}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </SettingsRowControl>
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
          </section>
        </div>
      )}
    </SettingsPageWrapper>
  );
}
