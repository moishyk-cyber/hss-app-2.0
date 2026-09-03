// Supabase Storage wrapper for file uploads (order/deal documents).
//
// Server-only: it uses the SERVICE ROLE key, which must never reach the
// browser. The browser never talks to Supabase directly with a key - it only
// PUTs the file bytes to a short-lived signed upload URL minted here.
//
// Uploads are OPTIONAL. When SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not
// set (local dev, preview deploys), uploadsConfigured() is false and the UI
// falls back to pasting a link - which always works.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Private bucket holding every order/deal document upload. */
export const UPLOAD_BUCKET = "order-files";

/** Hard cap on a single upload (matches the file input's client-side check). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** How long a download link stays valid (seconds). */
export const DOWNLOAD_URL_TTL = 3600;

export function uploadsConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Created on first use, then reused - building a client per call would open a
// fresh fetch/agent pipeline on every upload.
let cached: SupabaseClient | null = null;

function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Filesystem-safe object name: keeps the extension, drops everything exotic. */
export function safeStorageName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const name = cleaned || "file";
  return name.length > 120 ? name.slice(name.length - 120) : name;
}

/**
 * Object path for a new upload: `<linkedType>/<linkedId>/<random>-<safe name>`.
 * The random prefix keeps two same-named uploads from colliding, and makes a
 * path unguessable on its own (the bucket is private either way).
 */
export function storagePathFor(linkedType: string, linkedId: string, fileName: string): string {
  return `${linkedType}/${linkedId}/${crypto.randomUUID()}-${safeStorageName(fileName)}`;
}

export type SignedUpload = { uploadUrl: string; token: string; storagePath: string };

/**
 * Mint a signed upload URL. The browser then PUTs the file bytes straight to
 * `uploadUrl` (see FilesSection) - the bytes never pass through this server.
 */
export async function createSignedUploadUrl(path: string): Promise<SignedUpload> {
  const { data, error } = await serviceClient().storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create an upload URL");
  return { uploadUrl: data.signedUrl, token: data.token, storagePath: data.path };
}

/** Time-limited download URL for a private object. */
export async function createSignedDownloadUrl(
  path: string,
  expiresIn: number = DOWNLOAD_URL_TTL
): Promise<string> {
  const { data, error } = await serviceClient()
    .storage.from(UPLOAD_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("Could not create a download URL");
  return data.signedUrl;
}

/** Delete the stored object. Used when its Document row is deleted. */
export async function removeObject(path: string): Promise<void> {
  const { error } = await serviceClient().storage.from(UPLOAD_BUCKET).remove([path]);
  if (error) throw error;
}
