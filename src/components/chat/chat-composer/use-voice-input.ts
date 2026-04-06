"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import {
  ensureMicrophoneAccessForVoiceInput,
  openMicrophonePermissionSettings,
} from "@/lib/desktop/permissions";

import { insertTranscriptIntoComposer } from "./voice-input.helpers";
import { resolveVoiceInputStartFailure } from "./voice-input.helpers";
import { resolveVoiceInputStartError } from "./voice-input.helpers";

type VoiceInputPhase = "idle" | "recording" | "transcribing";

type UseVoiceInputOptions = {
  editor: Editor | null;
};

type VoiceInputResponse = {
  durationInSeconds?: number;
  language?: string;
  text: string;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function resolveRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];

  return (
    candidates.find((candidate) =>
      candidate ? MediaRecorder.isTypeSupported(candidate) : true,
    ) ?? ""
  );
}

function resolveRecordingFilename(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "voice-input.m4a";
  }

  if (mimeType.includes("ogg")) {
    return "voice-input.ogg";
  }

  if (mimeType.includes("wav")) {
    return "voice-input.wav";
  }

  return "voice-input.webm";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useVoiceInput({ editor }: UseVoiceInputOptions) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasPermissionRecoveryAction, setHasPermissionRecoveryAction] =
    useState(false);
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const [providerLabel, setProviderLabel] = useState("voice provider");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const isSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    [],
  );

  const cleanupAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setLevel(0);
  }, []);

  const cleanupRecordingResources = useCallback(() => {
    cleanupAudioAnalysis();
    stopStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    recordingStartedAtRef.current = null;
    chunksRef.current = [];
  }, [cleanupAudioAnalysis]);

  const openPermissionRecovery = useCallback(async () => {
    const opened = await openMicrophonePermissionSettings();
    if (!opened) {
      sileo.error({
        description: "Unable to open Microphone settings right now.",
      });
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording") {
      return;
    }

    const updateTimer = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt == null) {
        return;
      }

      setElapsedSeconds(Math.max(0, (Date.now() - startedAt) / 1000));
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 200);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources]);

  const beginAudioAnalysis = useCallback((stream: MediaStream) => {
    if (typeof AudioContext === "undefined") {
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const sample = () => {
      analyser.getByteFrequencyData(buffer);
      const average =
        buffer.reduce((sum, value) => sum + value, 0) / buffer.length / 255;
      setLevel(average);
      animationFrameRef.current = window.requestAnimationFrame(sample);
    };

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    animationFrameRef.current = window.requestAnimationFrame(sample);
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob, mimeType: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const formData = new FormData();
    formData.set(
      "audio",
      new File([blob], resolveRecordingFilename(mimeType), {
        type: mimeType || blob.type || "audio/webm",
      }),
    );

    const response = await fetch("/api/transcribe", {
      body: formData,
      method: "POST",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      durationInSeconds?: number;
      error?: { message?: string };
      language?: string;
      text?: string;
    } | null;

    if (!response.ok || !payload?.text) {
      throw new Error(
        payload?.error?.message ??
          "Unable to transcribe that recording right now.",
      );
    }

    return payload as VoiceInputResponse;
  }, []);

  const stop = useCallback(() => {
    if (phase !== "recording") {
      return;
    }

    recorderRef.current?.stop();
  }, [phase]);

  const cancel = useCallback(() => {
    if (phase === "transcribing") {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setPhase("idle");
      return;
    }

    if (phase === "recording") {
      cancelledRef.current = true;
      recorderRef.current?.stop();
    }
  }, [phase]);

  const start = useCallback(
    async (nextProviderLabel?: string | null) => {
      if (!editor || !isSupported || phase !== "idle") {
        return;
      }

      const platform =
        typeof window !== "undefined"
          ? (window.sentinelDesktop?.app.platform ?? null)
          : null;
      let nativePermissionState: string | null = null;

      setErrorMessage("");
      setHasPermissionRecoveryAction(false);
      setElapsedSeconds(0);
      setProviderLabel(nextProviderLabel?.trim() || "voice provider");
      cancelledRef.current = false;

      try {
        const microphoneAccess = await ensureMicrophoneAccessForVoiceInput();
        nativePermissionState = microphoneAccess.state;
        const permissionError = resolveVoiceInputStartError(microphoneAccess);
        if (permissionError) {
          throw new Error(permissionError);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        const mimeType = resolveRecordingMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        streamRef.current = stream;
        recorderRef.current = recorder;
        chunksRef.current = [];
        recordingStartedAtRef.current = Date.now();
        beginAudioAnalysis(stream);

        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        });

        recorder.addEventListener("stop", async () => {
          const wasCancelled = cancelledRef.current;
          const recordingMimeType =
            recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: recordingMimeType });

          cleanupRecordingResources();

          if (wasCancelled) {
            cancelledRef.current = false;
            setPhase("idle");
            return;
          }

          if (blob.size === 0) {
            setErrorMessage("The recording was empty. Please try again.");
            setPhase("idle");
            return;
          }

          setPhase("transcribing");

          try {
            const result = await transcribeBlob(blob, recordingMimeType);
            const inserted = insertTranscriptIntoComposer(editor, result.text);

            if (!inserted) {
              throw new Error("The transcript came back empty.");
            }

            editor.commands.focus();
            setErrorMessage("");
            setPhase("idle");
          } catch (error) {
            if (isAbortError(error)) {
              setPhase("idle");
              return;
            }

            const message =
              error instanceof Error
                ? error.message
                : "Unable to transcribe that recording right now.";
            setErrorMessage(message);
            sileo.error({ description: message });
            setPhase("idle");
          } finally {
            abortControllerRef.current = null;
          }
        });

        recorder.start();
        setPhase("recording");
      } catch (error) {
        cleanupRecordingResources();
        const { canOfferRecovery, message } = resolveVoiceInputStartFailure({
          error,
          platform,
        });

        console.warn("[voice-input] microphone start failed", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : String(error),
          nativePermissionState,
        });

        setErrorMessage(message);
        setHasPermissionRecoveryAction(canOfferRecovery);
        sileo.error({ description: message });
        setPhase("idle");
      }
    },
    [
      beginAudioAnalysis,
      cleanupRecordingResources,
      editor,
      isSupported,
      phase,
      transcribeBlob,
    ],
  );

  return {
    cancel,
    elapsedSeconds,
    errorMessage,
    hasPermissionRecoveryAction,
    isActive: phase !== "idle",
    isRecording: phase === "recording",
    isSupported,
    isTranscribing: phase === "transcribing",
    level,
    openPermissionRecovery,
    phase,
    providerLabel,
    start,
    stop,
  };
}
