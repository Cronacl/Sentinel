import { describe, expect, it, mock } from "bun:test";

import {
  formatVoiceInputDuration,
  insertTranscriptIntoComposer,
  resolveVoiceInputStartFailure,
  resolveVoiceInputStartError,
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

  it("returns the denied-permission error before recording starts", () => {
    expect(
      resolveVoiceInputStartError({
        allowed: false,
        message:
          "Microphone access was denied. Allow microphone access for Sentinel and try again.",
        state: "denied",
      }),
    ).toBe(
      "Microphone access was denied. Allow microphone access for Sentinel and try again.",
    );
    expect(
      resolveVoiceInputStartError({
        allowed: true,
        state: "granted",
      }),
    ).toBeNull();
  });

  it("maps renderer permission failures to the macOS denial message and recovery action", () => {
    const result = resolveVoiceInputStartFailure({
      error: new DOMException("Permission denied", "NotAllowedError"),
      platform: "darwin",
    });

    expect(result).toEqual({
      canOfferRecovery: true,
      message:
        "Microphone access was denied. Allow microphone access for Sentinel in System Settings and try again.",
    });
  });

  it("keeps unsupported start failures distinct from permission denial", () => {
    expect(
      resolveVoiceInputStartFailure({
        error: new Error(
          "Microphone input is unavailable in this environment.",
        ),
        platform: null,
      }),
    ).toEqual({
      canOfferRecovery: false,
      message: "Microphone input is unavailable in this environment.",
    });
  });
});
