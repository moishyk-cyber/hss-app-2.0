import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Real login gate (Sep 17): every route requires a valid signed session
// except /login itself and Next's own internals/static assets (handled by
// the matcher below). Replaces the old "anyone can pick anyone from a
// dropdown" identity.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(token);

  if (pathname === "/login" && userId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname !== "/login" && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Lets layout.tsx know which route it's rendering, so it can skip the
  // signed-in sidebar chrome on /login - see src/app/layout.tsx.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
