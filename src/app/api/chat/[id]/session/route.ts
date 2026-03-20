import { getLocalSession } from "@/server/local-profile";
import { createThreadChatErrorResponse } from "@/lib/ai/chat/errors";
import { loadThreadSessionSnapshot } from "@/lib/ai/chat/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getLocalSession();
    const { id } = await params;
    const snapshot = await loadThreadSessionSnapshot(id);

    if (!snapshot) {
      return new Response(null, { status: 404 });
    }

    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return createThreadChatErrorResponse(error);
  }
}
