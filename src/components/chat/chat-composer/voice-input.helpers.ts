import type { Editor } from "@tiptap/core";

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
