import { afterEach, describe, expect, it, mock } from "bun:test";

const getLocalSession = mock(async () => ({
  user: {
    id: "user-1",
  },
}));
const transcribeAudioForUser = mock(async () => ({
  durationInSeconds: 2.4,
  language: "en",
  text: "build a dashboard for release metrics",
}));

mock.module("@/server/local-profile", () => ({
  getLocalSession,
}));

mock.module("@/lib/ai/transcription/service", () => ({
  VoiceTranscriptionError: class VoiceTranscriptionError extends Error {},
  transcribeAudioForUser,
}));

const { POST } = await import("./route");

afterEach(() => {
  mock.restore();
});

describe("POST /api/transcribe", () => {
  it("transcribes uploaded audio files", async () => {
    const formData = new FormData();
    formData.set(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice-input.webm", {
        type: "audio/webm",
      }),
    );

    const request = new Request("http://localhost/api/transcribe", {
      body: formData,
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transcribeAudioForUser).toHaveBeenCalled();
    expect(body).toEqual({
      durationInSeconds: 2.4,
      language: "en",
      text: "build a dashboard for release metrics",
    });
  });

  it("rejects requests without audio", async () => {
    const request = new Request("http://localhost/api/transcribe", {
      body: new FormData(),
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toBe(
      "Attach an audio recording before transcribing.",
    );
  });
});
