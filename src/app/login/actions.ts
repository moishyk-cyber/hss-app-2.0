"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { checkLoginThrottle, clearLoginThrottle, getClientIp, recordLoginFailure } from "@/lib/loginThrottle";

// A fixed, valid bcrypt hash with no matching password. Unknown emails and
// accounts with no password hash still run bcrypt.compare against this, so
// the response takes about as long either way and a caller can't tell a
// missing account from a wrong password by timing the request.
const DUMMY_PASSWORD_HASH = "$2b$10$LVsLWJlrc8VwSTB38F8I5ukjKzGAwnFV6GlxJdQGA69AydJupSa1G";

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export async function login(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  // Same message either way - don't tell a guesser whether the email exists.
  const wrongCreds = { ok: false as const, message: "Wrong email or password." };

  const ip = await getClientIp();
  const throttle = checkLoginThrottle(email, ip);
  if (!throttle.allowed) {
    return { ok: false, message: throttle.message ?? "Too many failed attempts. Try again later." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, active: true, passwordHash: true },
  });

  // Always compare against something, even for an unknown email or one with
  // no password hash yet, so the timing doesn't give away which case it was.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.active || !user.passwordHash || !valid) {
    recordLoginFailure(email, ip);
    return wrongCreds;
  }

  clearLoginThrottle(email, ip);
  const token = await createSessionToken(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // Not routed through logActivity/currentUserName: that reads the session
  // cookie we just set, which a fresh `cookies()` call in this same request
  // may not see yet. The signed-in user's name is right here regardless.
  await prisma.activityLog.create({
    data: { userName: user.name, linkedType: "user", linkedId: user.id, action: "user_logged_in", detail: "Signed in" },
  });
  return { ok: true, userId: user.id };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete("hss_user_id");
}
