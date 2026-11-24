// Text der Benachrichtigung aus den Warnungen der Lage. Rein (getestet). Enthält nur Lagedaten, keine Personen.
export interface AlertLike { level: "error" | "warn" | "info"; text: string }

export function relevantAlerts<T extends AlertLike>(alerts: T[]): T[] {
  return alerts.filter((a) => a.level !== "info");
}

export function buildAlertMessage(alerts: AlertLike[], appUrl: string, max = 15): string | null {
  const list = relevantAlerts(alerts);
  if (!list.length) return null;
  const lines = list.slice(0, max).map((a) => `${a.level === "error" ? "🔴" : "🟠"} ${a.text}`);
  const more = list.length > max ? [`… und ${list.length - max} weitere`] : [];
  return [`forumWHU Logistik – ${list.length} Hinweis${list.length === 1 ? "" : "e"}`, ...lines, ...more, appUrl].join("\n");
}

/** Gleicher Inhalt → gleicher Fingerabdruck (Reihenfolge egal), damit unveränderte Lagen nicht ständig neu gemeldet werden. */
export function alertFingerprint(alerts: AlertLike[]): string {
  return relevantAlerts(alerts).map((a) => `${a.level}:${a.text}`).sort().join("|");
}
