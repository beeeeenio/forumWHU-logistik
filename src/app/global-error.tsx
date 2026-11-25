"use client";

/** Letzte Auffangstufe (Fehler im Grundgerüst der Seite). Eigenständig, ohne Stylesheets der App. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#061638", color: "#f4eee0", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 24 }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontFamily: "Georgia, serif" }}>Das hat gerade nicht geklappt</h1>
          <p>Bitte versuche es noch einmal. Wenn es bleibt, melde dich kurz beim Logistik-Team.</p>
          <button onClick={reset} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#f08100", color: "#061638", fontWeight: 600, fontSize: 16 }}>Erneut versuchen</button>
        </div>
      </body>
    </html>
  );
}
