/** Öffentliche Adresse der App (hinter Proxy/Docker ist req.url nicht die öffentliche). */
export function appUrl(path: string): URL {
  return new URL(path, process.env.APP_URL);
}
/** Nur interne Pfade als Rücksprungziel zulassen (kein Open Redirect). */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
