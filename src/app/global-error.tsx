"use client";

// Last-resort boundary: replaces the ROOT layout when even that crashes.
// Must render its own <html>/<body> and cannot rely on globals.css.

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error(error);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#f7f6f4",
          color: "#0a0a0b",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 380, padding: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>HSS Kitchens hit an error</h2>
          <p style={{ fontSize: 13, color: "#8a867f", marginBottom: 16 }}>
            Reload to get back to work. If it keeps happening, tell Klyne &amp; Co.
          </p>
          <button
            onClick={() => retry()}
            style={{
              background: "#1c1c1e",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
