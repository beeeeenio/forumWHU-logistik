"use client";

import { useEffect } from "react";

/** Unerwarteter Fehler in einer Seite: verständliche Meldung statt Standardabsturz, mit „Erneut versuchen“. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Seitenfehler:", error.digest ?? error.name); }, [error]);
  return (
    <div className="page max-w-xl space-y-4">
      <h1 className="h1">Das hat gerade nicht geklappt</h1>
      <p>Es ist ein unerwarteter Fehler aufgetreten. Deine Eingaben sind nicht verloren, wenn du nichts gebucht hast. Bitte versuche es noch einmal – meist liegt es an einer kurzen Störung oder daran, dass jemand gleichzeitig dasselbe gebucht hat.</p>
      <p className="text-sm text-muted-foreground">Wenn es wieder passiert, schau im Journal nach, ob die Buchung schon gespeichert ist, bevor du sie noch einmal erfasst.{error.digest ? ` (Fehlerkennung: ${error.digest})` : ""}</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={reset} className="btn-primary">Erneut versuchen</button><a href="/" className="btn-secondary">Zur Lage</a></div>
    </div>
  );
}
