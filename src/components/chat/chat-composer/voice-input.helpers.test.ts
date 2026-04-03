import { describe, expect, it, mock } from "bun:test";

import {
  formatVoiceInputDuration,
  insertTranscriptIntoComposer,
  shouldShowVoiceInputControl,
} from "./voice-input.helpers";

describe("voice input helpers", () => {
  it("hides the mic when voice input is unavailable", () => {
    expect(
      shouldShowVoiceInputControl({
        browserSupported: true,
        voiceInputAvailable: false,
      }),
    ).toBe(false);
  });

  it("shows the mic when browser support and provider availability are both present", () => {
    expect(
      shouldShowVoiceInputControl({
        browserSupported: true,
        voiceInputAvailable: true,
      }),
    ).toBe(true);
  });

  it("inserts the transcript into the composer without triggering send behavior", () => {
    const run = mock(() => undefined);
    const insertContent = mock(() => ({ run }));
    const focus = mock(() => ({ insertContent }));
    const chain = mock(() => ({ focus }));

    const inserted = insertTranscriptIntoComposer(
      {
        chain,
      } as never,
      "Ship the release note generator next.",
    );

    expect(inserted).toBe(true);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(insertContent).toHaveBeenCalledWith(
      "Ship the release note generator next.",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("formats the recorder timer in minutes and seconds", () => {
    expect(formatVoiceInputDuration(3)).toBe("00:03");
    expect(formatVoiceInputDuration(64)).toBe("01:04");
  });
});
