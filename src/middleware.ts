import { NextResponse, type NextRequest } from "next/server";

export default function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|_proxy/|_static|_vercel|[\\w-]+\\.\\w+).*)"],
};
