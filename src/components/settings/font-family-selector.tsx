"use client";

import {
  Description,
  FieldError,
  Header,
  Label,
  ListBox,
  Select,
  Separator,
} from "@heroui/react";
import { Fragment, useEffect, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { getDesktopApi } from "@/lib/desktop/client";
import {
  buildFontSelectorOptions,
  type FontSelectorMode,
} from "@/lib/font-options";

type FontAccessWindow = Window & {
  queryLocalFonts?: () => Promise<Array<{ family?: string }>>;
};

type FontFamilySelectorProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  description?: string;
  label: string;
  mode: FontSelectorMode;
  name: TName;
  placeholder: string;
};

const SECTION_ORDER = [
  "Current value",
  "Defaults",
  "Bundled with Sentinel",
  "Installed on this system",
] as const;

async function loadSystemFontFamilies() {
  const desktop = getDesktopApi();
  const seen = new Set<string>();
  const families: string[] = [];

  const addFamily = (family: string) => {
    const normalized = family.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    families.push(normalized);
  };

  try {
    const fontAccessWindow = window as FontAccessWindow;

    if (typeof fontAccessWindow.queryLocalFonts === "function") {
      const localFonts = await fontAccessWindow.queryLocalFonts();

      for (const font of localFonts) {
        if (typeof font.family === "string") {
          addFamily(font.family);
        }
      }
    }
  } catch {
    // Ignore browser-level font enumeration failures and fall back to desktop IPC.
  }

  try {
    const systemFonts = await desktop?.app.listSystemFonts();

    for (const font of systemFonts ?? []) {
      addFamily(font.family);
    }
  } catch {
    // Ignore desktop font enumeration failures and continue with any already loaded fonts.
  }

  return families.sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function FontFamilySelector<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  description,
  label,
  mode,
  name,
  placeholder,
}: FontFamilySelectorProps<TFieldValues, TName>) {
  const [systemFamilies, setSystemFamilies] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void loadSystemFontFamilies().then((fontFamilies) => {
      if (!cancelled) {
        setSystemFamilies(fontFamilies);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const currentValue = String(field.value ?? "");
        const options = buildFontSelectorOptions({
          currentValue,
          mode,
          systemFamilies,
        });
        const selectedOption =
          options.find((option) => option.value === currentValue) ?? null;
        const sections = SECTION_ORDER.map((section) => ({
          items: options.filter((option) => option.section === section),
          section,
        })).filter((section) => section.items.length > 0);

        return (
          <Select.Root
            className="w-full"
            isInvalid={fieldState.invalid}
            name={field.name}
            onSelectionChange={(key) => field.onChange(String(key))}
            selectedKey={currentValue || null}
          >
            <Label>{label}</Label>
            <Select.Trigger>
              <Select.Value>
                {() => {
                  if (!selectedOption) {
                    return (
                      <span className="truncate text-muted">{placeholder}</span>
                    );
                  }

                  return (
                    <div className="min-w-0 space-y-0.5">
                      <p
                        className="truncate"
                        style={{ fontFamily: selectedOption.previewFontFamily }}
                      >
                        {selectedOption.label}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {selectedOption.description ?? selectedOption.value}
                      </p>
                    </div>
                  );
                }}
              </Select.Value>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox className="max-h-[320px] overflow-y-auto">
                {sections.map((section, index) => (
                  <Fragment key={section.section}>
                    <ListBox.Section>
                      <Header>{section.section}</Header>
                      {section.items.map((option) => (
                        <ListBox.Item
                          id={option.value}
                          key={option.value}
                          textValue={option.textValue}
                        >
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p
                                className="truncate"
                                style={{ fontFamily: option.previewFontFamily }}
                              >
                                {option.label}
                              </p>
                              {option.description ? (
                                <p className="truncate text-xs text-muted">
                                  {option.description}
                                </p>
                              ) : null}
                            </div>
                            <ListBox.ItemIndicator />
                          </div>
                        </ListBox.Item>
                      ))}
                    </ListBox.Section>
                    {index < sections.length - 1 ? <Separator /> : null}
                  </Fragment>
                ))}
              </ListBox>
            </Select.Popover>
            {description ? <Description>{description}</Description> : null}
            <FieldError>{fieldState.error?.message}</FieldError>
          </Select.Root>
        );
      }}
    />
  );
}
