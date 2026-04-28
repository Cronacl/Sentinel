import { NextResponse } from "next/server";

import { inferAttachmentMimeType } from "@/lib/files/chat-attachment-types";
import { readUploadedMediaArtifact } from "@/lib/uploaded-media";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ artifact: string[] }> },
) {
  const session = await getLocalSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { artifact } = await params;
    const artifactPath = artifact.join("/");
    const { data, relativePath } = await readUploadedMediaArtifact({
      artifactPath,
      userId: session.user.id,
    });
    const filename = relativePath.split("/").pop() ?? "attachment.bin";

    return new NextResponse(data, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(data.byteLength),
        "Content-Type":
          inferAttachmentMimeType(filename) ?? "application/octet-stream",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Uploaded media not found.";
    const status = /not accessible|invalid/i.test(message) ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
