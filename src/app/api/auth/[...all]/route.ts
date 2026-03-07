import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Hosted auth is disabled in local desktop mode." },
    { status: 404 },
  );
}

export async function POST() {
  return NextResponse.json(
    { message: "Hosted auth is disabled in local desktop mode." },
    { status: 404 },
  );
}
