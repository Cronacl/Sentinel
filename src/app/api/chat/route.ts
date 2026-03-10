import { type NextRequest } from "next/server";

import {
  createThreadChatErrorResponse,
} from "@/lib/ai/chat/errors";
import { runThreadChat } from "@/lib/ai/chat";
import { streamContext } from "@/lib/streams";
import { getLocalSession } from "@/server/local-profile";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const session = await getLocalSession();
    const body = await req.json();

    const response = await runThreadChat(body, {
      userId: session.user.id,
    });

    if (!response.body || response.status === 204) {
      return response;
    }

    const streamId = (body as Record<string, unknown>).id;

    if (typeof streamId !== "string") {
      return response;
    }

    const resumableStream = await streamContext.createNewResumableStream(
      streamId,
      () => response.body! as unknown as ReadableStream<string>,
    );

    if (!resumableStream) {
      return response;
    }

    return new Response(resumableStream, {
      headers: response.headers,
    });
  } catch (error) {
    return createThreadChatErrorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  const streamId = req.nextUrl.searchParams.get("streamId");

  if (!streamId) {
    return new Response("Missing streamId", { status: 400 });
  }

  const resumeAtParam = req.nextUrl.searchParams.get("resumeAt");
  const resumeAt = resumeAtParam ? parseInt(resumeAtParam, 10) : undefined;

  try {
    const stream = await streamContext.resumeExistingStream(streamId, resumeAt);

    if (stream === undefined) {
      return new Response("Stream not found", { status: 404 });
    }

    if (stream === null) {
      return new Response("Stream is already done", { status: 422 });
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response("Failed to resume stream", { status: 500 });
  }
}
