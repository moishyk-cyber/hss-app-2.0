/** Next's request URL can use an internal hostname. Compare browser Origin to
 * the public host/protocol carried by the request, including proxy headers.
 */
export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const internal = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? internal.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? internal.protocol.slice(0, -1);
    if (!["http", "https"].includes(protocol) || /[,/\\\s]/.test(host)) return false;
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch { return false; }
}
