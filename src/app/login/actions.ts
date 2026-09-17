"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

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

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, active: true, passwordHash: true },
  });
  if (!user || !user.active || !user.passwordHash) return wrongCreds;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return wrongCreds;

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
