import { NextResponse, type NextRequest } from "next/server";

/**
 * Nur eine optimistische Vorprüfung (die eigentliche Prüfung passiert in jeder Seite/Aktion über die Sitzung in der DB):
 * Seiten ohne Sitzungs-Cookie werden zur Anmeldung umgeleitet. API-Routen prüfen selbst (401 statt Weiterleitung).
 */
const PUBLIC = ["/login", "/api/", "/_next/", "/favicon", "/manifest.webmanifest", "/brand/", "/apple-icon", "/icon"];
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-logi_session" : "logi_session";

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PUBLIC.some((p) => path.startsWith(p)) && !req.cookies.get(COOKIE)) {
    // Öffentliche Adresse (APP_URL), nicht die Adresse, auf der der Server hinter dem Proxy lauscht
    const url = new URL("/login", process.env.APP_URL || req.url);
    if (path !== "/" || req.nextUrl.search) url.searchParams.set("returnTo", path + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
