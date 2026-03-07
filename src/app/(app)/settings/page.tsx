"use client";

import { Button, Skeleton, Spinner } from "@heroui/react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { SettingsPageWrapper } from "@/components/settings/settings-page-wrapper";
import {
  applyThemePreference,
  DEFAULT_THEME_PREFERENCE,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/theme";
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
    </div>
  );
}

export default function GeneralSettingsPage() {
  const utils = api.useUtils();
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  const [submitError, setSubmitError] = useState("");

  const { data: appearance, error, isLoading } = api.appearance.get.useQuery();

  useEffect(() => {
    if (!appearance) {
      return;
    }

    setThemePreference(appearance.themePreference);
  }, [appearance]);

  const updateAppearance = api.appearance.update.useMutation({
    onSuccess: async (data) => {
      setSubmitError("");
      setThemePreference(data.themePreference);
      applyThemePreference(data.themePreference);
      window.dispatchEvent(new Event("sentinel-theme-change"));
      await utils.appearance.get.invalidate();
    },
    onError: (mutationError) => {
      setSubmitError(mutationError.message);
      if (appearance) {
        setThemePreference(appearance.themePreference);
        applyThemePreference(appearance.themePreference);
        window.dispatchEvent(new Event("sentinel-theme-change"));
      }
    },
  });

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

      {isLoading ? (
        <GeneralSettingsSkeleton />
      ) : (
        <section className="border-separator bg-surface rounded-xl border p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-foreground text-base font-medium">
                Appearance
              </h2>
              <p className="text-muted text-sm leading-6">
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
      )}
    </SettingsPageWrapper>
  );
}
