import { NextResponse } from "next/server";

import {
  VoiceTranscriptionError,
  transcribeAudioForUser,
} from "@/lib/ai/transcription/service";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function createTranscriptionErrorResponse(
  message: string,
  status: number = 400,
) {
  return NextResponse.json(
    {
      error: {
        message,
      },
    },
    { status },
  );
}

export async function POST(req: Request) {
  try {
    const session = await getLocalSession();
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return createTranscriptionErrorResponse(
        "Attach an audio recording before transcribing.",
      );
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (bytes.byteLength === 0) {
      return createTranscriptionErrorResponse(
        "The recorded audio was empty. Please try again.",
      );
    }

    const result = await transcribeAudioForUser({
      audio: bytes,
      filename: audio.name,
      mediaType: audio.type,
      userId: session.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VoiceTranscriptionError) {
      return createTranscriptionErrorResponse(error.message);
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to transcribe that recording right now.";

    return createTranscriptionErrorResponse(message, 500);
  }
}
