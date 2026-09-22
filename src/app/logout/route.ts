import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// Clears the session and lands on /login. The root layout sends a deleted or
// deactivated user here: going straight to /login would bounce back to
// /dashboard, because proxy.ts only checks the cookie's signature (it doesn't
// hit the database), so the cookie has to go first.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete("hss_user_id");
  return response;
}
