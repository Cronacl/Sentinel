import type { Editor } from "@tiptap/core";

import {
  canOpenMicrophonePermissionSettings,
  resolveMicrophonePermissionErrorMessage,
} from "@/lib/desktop/permissions";
import type { DesktopPlatform } from "@/lib/desktop/contracts";
import type { MicrophoneAccessResult } from "@/lib/desktop/permissions";

export function formatVoiceInputDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function shouldShowVoiceInputControl(input: {
  browserSupported: boolean;
  voiceInputAvailable: boolean;
}) {
  return input.browserSupported && input.voiceInputAvailable;
}

export function insertTranscriptIntoComposer(
  editor: Pick<Editor, "chain">,
  transcript: string,
) {
  const normalized = transcript.trim();
  if (!normalized) {
    return false;
  }

  editor.chain().focus().insertContent(normalized).run();
  return true;
}

export function resolveVoiceInputStartError(result: MicrophoneAccessResult) {
  return result.allowed ? null : result.message;
}

export function isVoiceInputPermissionError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

export function resolveVoiceInputStartFailure(input: {
  error: unknown;
  platform: DesktopPlatform | null;
}) {
  if (isVoiceInputPermissionError(input.error)) {
    return {
      canOfferRecovery: canOpenMicrophonePermissionSettings(input.platform),
      message: resolveMicrophonePermissionErrorMessage(
        "denied",
        input.platform,
      ),
    };
  }

  return {
    canOfferRecovery: false,
    message:
      input.error instanceof Error
        ? input.error.message
        : "Unable to start voice input.",
  };
}
