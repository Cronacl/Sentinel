import fs from "node:fs";
import { NextResponse } from "next/server";

import { getExportDbPath } from "@/server/db/backup";
import { getLocalSession } from "@/server/local-profile";

export const runtime = "nodejs";

export async function GET() {
  const session = await getLocalSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbPath = getExportDbPath();

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json(
      { error: "Database file not found" },
      { status: 404 },
    );
  }

  const stat = fs.statSync(dbPath);
  const stream = fs.createReadStream(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sentinel-export-${timestamp}.db`;

  return new NextResponse(
    stream as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(stat.size),
      },
    },
  );
}
