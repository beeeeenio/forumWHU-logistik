/** Öffentliche Adresse der App (hinter Proxy/Docker ist req.url nicht die öffentliche). */
export function appUrl(path: string): URL {
  return new URL(path, process.env.APP_URL);
}

/**
 * Nur interne Pfade als Rücksprungziel zulassen (kein Open Redirect). Strikt: beginnt mit genau einem „/“, nur sichtbare ASCII-Zeichen
 * (keine Tabs/Zeilenumbrüche – der URL-Parser würde sie entfernen und aus „/\t/evil.com“ ein „//evil.com“ machen), höchstens 300 Zeichen,
 * und nach dem Parsen muss es wirklich auf derselben Herkunft bleiben.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 300 || !/^\/(?![/\\])[\x21-\x7e]*$/.test(value)) return null;
  try {
    const u = new URL(value, "http://x.invalid");
    return u.origin === "http://x.invalid" ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}
