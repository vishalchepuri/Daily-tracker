import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/__/auth/action" || pathname === "/__auth/action") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/action";
    url.search = search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/__/auth/action", "/__auth/action"],
};
