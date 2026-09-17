"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeUserId } from "@/lib/identityClient";
import { login } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await login(formData);
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    // Mirrors the old "Working as" identity so existing "assign to me"
    // defaults around the app keep working - login is now what sets it,
    // not a picker.
    storeUserId(result.userId);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hss-logo.png" alt="HSS Kitchens" width={44} height={32} className="mx-auto h-9 w-auto" />
          <h1 className="mt-3 font-heading text-lg font-bold text-ink">HSS Kitchens</h1>
          <p className="text-[13px] text-gray-dark">Sign in to continue</p>
        </div>
        <form action={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="username"
              className="input-klyne w-full"
              placeholder="you@hsskitchens.com"
            />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="input-klyne w-full"
              placeholder="••••••••"
            />
          </label>
          {error && (
            <span role="alert" className="banner-warn block w-full">
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`btn btn-primary w-full active:scale-[0.99] ${submitting ? "cursor-progress opacity-60" : ""}`}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
