import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
} from "@/lib/appearance";

export type FontSelectorMode = "code" | "ui";

export type FontSelectorOption = {
  description?: string;
  label: string;
  previewFontFamily: string;
  section: string;
  textValue: string;
  value: string;
};

const UI_FALLBACK_SUFFIX =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
const CODE_FALLBACK_SUFFIX = "monospace";

function quoteFontFamily(fontFamily: string) {
  return JSON.stringify(fontFamily);
}

function buildUiStack(fontFamily: string) {
  return `${quoteFontFamily(fontFamily)}, ${UI_FALLBACK_SUFFIX}`;
}

function buildCodeStack(fontFamily: string) {
  return `${quoteFontFamily(fontFamily)}, ${CODE_FALLBACK_SUFFIX}`;
}

function createOption(
  section: string,
  label: string,
  value: string,
  previewFontFamily: string,
  description?: string,
): FontSelectorOption {
  return {
    description,
    label,
    previewFontFamily,
    section,
    textValue: [label, description, value].filter(Boolean).join(" "),
    value,
  };
}

export function buildFontSelectorOptions({
  currentValue,
  mode,
  systemFamilies,
}: {
  currentValue: string;
  mode: FontSelectorMode;
  systemFamilies: string[];
}) {
  const options: FontSelectorOption[] = [];
  const seenValues = new Set<string>();

  const addOption = (option: FontSelectorOption) => {
    if (seenValues.has(option.value)) {
      return;
    }

    seenValues.add(option.value);
    options.push(option);
  };

  if (currentValue.trim()) {
    addOption(
      createOption(
        "Current value",
        "Current custom stack",
        currentValue,
        currentValue,
        currentValue,
      ),
    );
  }

  if (mode === "ui") {
    addOption(
      createOption(
        "Defaults",
        "Sentinel default UI stack",
        DEFAULT_UI_FONT_FAMILY,
        DEFAULT_UI_FONT_FAMILY,
        "Satoshi with system sans and emoji fallbacks.",
      ),
    );
    addOption(
      createOption(
        "Bundled with Sentinel",
        "Satoshi",
        "var(--font-satoshi), ui-sans-serif, system-ui, sans-serif",
        "var(--font-satoshi), ui-sans-serif, system-ui, sans-serif",
        "Bundled sans font included with Sentinel.",
      ),
    );
    addOption(
      createOption(
        "Bundled with Sentinel",
        "Millionaire",
        "var(--font-millionaire), ui-sans-serif, system-ui, sans-serif",
        "var(--font-millionaire), ui-sans-serif, system-ui, sans-serif",
        "Bundled display font included with Sentinel.",
      ),
    );
  } else {
    addOption(
      createOption(
        "Defaults",
        "Sentinel default code stack",
        DEFAULT_CODE_FONT_FAMILY,
        DEFAULT_CODE_FONT_FAMILY,
        "SF Mono, Fira Code, and common mono fallbacks.",
      ),
    );
    addOption(
      createOption(
        "Bundled with Sentinel",
        "Satoshi",
        "var(--font-satoshi), monospace",
        "var(--font-satoshi), monospace",
        "Bundled Sentinel sans font with a monospace fallback.",
      ),
    );
    addOption(
      createOption(
        "Bundled with Sentinel",
        "Millionaire",
        "var(--font-millionaire), monospace",
        "var(--font-millionaire), monospace",
        "Bundled Sentinel display font with a monospace fallback.",
      ),
    );
  }

  for (const family of systemFamilies) {
    const value = mode === "ui" ? buildUiStack(family) : buildCodeStack(family);
    addOption(
      createOption(
        "Installed on this system",
        family,
        value,
        value,
        mode === "ui"
          ? "Detected from the local desktop environment."
          : "Detected from the local desktop environment with monospace fallback.",
      ),
    );
  }

  return options;
}
