import { registerCustomTheme } from "@pierre/diffs";
import type { ThemeRegistration } from "shiki";

import {
  CODE_THEME_VALUES,
  getCodeThemeThemeSource,
  getSentinelCodeThemeRegistrationName,
  type CodeThemeName,
  type ResolvedTheme,
} from "@/lib/appearance";

const codeThemeRegistrations = new Map<string, ThemeRegistration>();
let pierreThemesRegistered = false;

export function getSentinelCodeThemeName(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return getSentinelCodeThemeRegistrationName(codeTheme, resolvedTheme);
}

export function getSentinelCodeThemeRegistration(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
): ThemeRegistration {
  const registrationName = getSentinelCodeThemeName(codeTheme, resolvedTheme);
  const cached = codeThemeRegistrations.get(registrationName);

  if (cached) {
    return cached;
  }

  const sourceTheme = getCodeThemeThemeSource(codeTheme, resolvedTheme);
  const registration: ThemeRegistration = {
    ...sourceTheme,
    name: registrationName,
  };

  codeThemeRegistrations.set(registrationName, registration);
  return registration;
}

export function ensureSentinelDiffThemesRegistered() {
  if (pierreThemesRegistered) {
    return;
  }

  pierreThemesRegistered = true;

  for (const codeTheme of CODE_THEME_VALUES) {
    for (const resolvedTheme of ["light", "dark"] as const) {
      const registrationName = getSentinelCodeThemeName(
        codeTheme,
        resolvedTheme,
      );
      const registration = getSentinelCodeThemeRegistration(
        codeTheme,
        resolvedTheme,
      );

      registerCustomTheme(registrationName, () =>
        Promise.resolve(registration),
      );
    }
  }
}
