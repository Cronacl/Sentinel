import { eq } from "drizzle-orm";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";

import { streamContext } from "@/lib/streams";
import { db } from "@/server/db";
import { threads } from "@/server/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, id),
    columns: { activeStreamId: true },
  });

  if (!thread?.activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const resumedStream = await streamContext.resumeExistingStream(
    thread.activeStreamId,
  );

  if (resumedStream == null) {
    db.update(threads)
      .set({ activeStreamId: null })
      .where(eq(threads.id, id))
      .run();

    return new Response(null, { status: 204 });
  }

  return new Response(resumedStream, {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
