"use client";

import { sileo } from "sileo";

import { getDesktopApi } from "./client";

import type { DesktopPermissionState, DesktopPlatform } from "./contracts";

export type MicrophoneAccessResult =
  | { allowed: true; state: DesktopPermissionState }
  | {
      allowed: false;
      message: string;
      state: DesktopPermissionState;
    };

type ClipboardWriteOptions = {
  errorMessage?: string;
  errorTitle?: string;
  toastOnError?: boolean;
};

let hasRequestedStartupMicrophonePermission = false;

function resolveClipboardErrorMessage(
  error: unknown,
  fallback = "Unable to copy to the clipboard.",
) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function resolveBrowserMicrophoneSupport() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

async function getBrowserMicrophonePermissionState(): Promise<DesktopPermissionState> {
  if (!resolveBrowserMicrophoneSupport()) {
    return "unsupported";
  }

  const permissionsApi = navigator.permissions;
  if (typeof permissionsApi?.query !== "function") {
    return "prompt";
  }

  try {
    const result = await permissionsApi.query({
      name: "microphone" as PermissionName,
    });

    if (result.state === "granted") {
      return "granted";
    }

    if (result.state === "denied") {
      return "denied";
    }

    return "prompt";
  } catch {
    return "prompt";
  }
}

export function resolveMicrophonePermissionErrorMessage(
  state: DesktopPermissionState,
  platform: DesktopPlatform | null,
) {
  if (state === "unsupported") {
    return "Microphone input is unavailable in this environment.";
  }

  if (state === "denied") {
    return platform === "darwin"
      ? "Microphone access was denied. Allow microphone access for Sentinel in System Settings and try again."
      : "Microphone access was denied. Allow microphone access for Sentinel and try again.";
  }

  return "Microphone access was not granted. Allow microphone access for Sentinel and try again.";
}

export async function writeTextToClipboard(
  text: string,
  options: ClipboardWriteOptions = {},
) {
  try {
    const desktop = getDesktopApi();
    if (desktop?.clipboard) {
      await desktop.clipboard.writeText(text);
      return true;
    }

    if (
      typeof navigator === "undefined" ||
      typeof navigator.clipboard?.writeText !== "function"
    ) {
      throw new Error("Clipboard access is unavailable.");
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    if (options.toastOnError !== false) {
      sileo.error({
        ...(options.errorTitle ? { title: options.errorTitle } : {}),
        description: resolveClipboardErrorMessage(error, options.errorMessage),
      });
    }

    return false;
  }
}

export async function getMicrophonePermissionState() {
  const desktop = getDesktopApi();
  if (desktop?.permissions) {
    return desktop.permissions.getStatus("microphone");
  }

  return getBrowserMicrophonePermissionState();
}

export async function requestMicrophonePermission() {
  const desktop = getDesktopApi();
  if (desktop?.permissions) {
    return desktop.permissions.request("microphone");
  }

  return getBrowserMicrophonePermissionState();
}

export async function ensureMicrophoneAccessForVoiceInput(): Promise<MicrophoneAccessResult> {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const currentState = await getMicrophonePermissionState();

  if (currentState === "granted") {
    return { allowed: true, state: currentState };
  }

  if (!desktop?.permissions) {
    if (currentState === "denied") {
      return {
        allowed: false,
        message: resolveMicrophonePermissionErrorMessage(
          currentState,
          platform,
        ),
        state: currentState,
      };
    }

    return { allowed: true, state: currentState };
  }

  const nextState =
    currentState === "prompt"
      ? await requestMicrophonePermission()
      : currentState;

  if (nextState === "granted") {
    return { allowed: true, state: nextState };
  }

  return {
    allowed: false,
    message: resolveMicrophonePermissionErrorMessage(nextState, platform),
    state: nextState,
  };
}

export async function preflightMicrophonePermissionOnStartup() {
  if (hasRequestedStartupMicrophonePermission) {
    return null;
  }

  hasRequestedStartupMicrophonePermission = true;

  const desktop = getDesktopApi();
  if (!desktop?.permissions || desktop.app.platform !== "darwin") {
    return null;
  }

  const currentState = await desktop.permissions.getStatus("microphone");
  if (currentState !== "prompt") {
    return currentState;
  }

  return desktop.permissions.request("microphone");
}

export function resetDesktopPermissionWarmupForTests() {
  hasRequestedStartupMicrophonePermission = false;
}
