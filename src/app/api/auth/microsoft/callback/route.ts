import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { loginCodeRequest, msalApp } from "@/integrations/microsoft/msal";
import { clientIp } from "@/lib/client-ip";
import { hashSecret, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { LOGIN_FLOW_COOKIE, createSession, loginFlowCookieOptions } from "@/lib/session";
import { appUrl, safeReturnTo } from "@/lib/url";
import { audit } from "@/services/audit";
import { linkMicrosoftLogin } from "@/services/auth";

/**
 * OIDC-Rückkehr: Cookie muss zum state passen (Login-CSRF), state ist einmalig und 10 Minuten gültig, danach Code-Tausch mit PKCE,
 * Prüfung von Nonce, Tenant (tid) und Objekt-ID (oid), dann linkMicrosoftLogin. Es wird nie ein Benutzer angelegt.
 */
export async function GET(req: NextRequest) {
  let attemptedEmail: string | null = null;
  const fail = async (code: string) => {
    await audit("auth.login_failed", { detail: { reason: code, email: attemptedEmail } });
    const res = NextResponse.redirect(appUrl(`/login?error=${code}`));
    res.cookies.set(LOGIN_FLOW_COOKIE, "", { ...loginFlowCookieOptions(), maxAge: 0 });
    return res;
  };
  const rl = rateLimit(`callback:${clientIp(req.headers) ?? "unbekannt"}`, 30, 60_000);
  if (!rl.ok) return new NextResponse("Zu viele Anfragen. Bitte kurz warten.", { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail(p.get("error") === "access_denied" ? "consent_denied" : "microsoft_error");
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state) return fail("invalid_request");
  const bound = req.cookies.get(LOGIN_FLOW_COOKIE)?.value;
  if (!bound || !safeEqual(bound, state)) return fail("invalid_request");
  const flow = await prisma.authFlowState.findUnique({ where: { stateHash: hashSecret(state) } });
  if (!flow || flow.purpose !== "login" || flow.expiresAt < new Date()) return fail("expired");
  await prisma.authFlowState.delete({ where: { id: flow.id } });
  try {
    const result = await msalApp().acquireTokenByCode(loginCodeRequest({ code, codeVerifier: flow.pkceVerifier, nonce: flow.nonce }));
    const claims = (result.idTokenClaims ?? {}) as { oid?: string; tid?: string; nonce?: string; email?: string; preferred_username?: string; name?: string };
    if (claims.nonce !== flow.nonce) return fail("invalid_nonce");
    if (!claims.tid || claims.tid.toLowerCase() !== env().MICROSOFT_TENANT_ID!.toLowerCase()) return fail("wrong_tenant");
    if (!claims.oid) return fail("invalid_token");
    attemptedEmail = (claims.email ?? claims.preferred_username ?? result.account?.username ?? null)?.toLowerCase() ?? null;
    const r = await linkMicrosoftLogin({
      oid: claims.oid,
      tid: claims.tid,
      email: claims.email ?? claims.preferred_username ?? result.account?.username ?? null,
      displayName: claims.name ?? result.account?.name ?? null,
    });
    if (!r.ok) return fail(r.reason);
    await createSession(r.userId);
    await audit("auth.login", { userId: r.userId });
    const res = NextResponse.redirect(appUrl(safeReturnTo(flow.returnTo) ?? "/"));
    res.cookies.set(LOGIN_FLOW_COOKIE, "", { ...loginFlowCookieOptions(), maxAge: 0 });
    return res;
  } catch (e) {
    // Nur Fehlername und Microsoft-Fehlercode (z. B. AADSTS7000215) – nie Tokens, Codes oder das Geheimnis
    const code = e && typeof e === "object" && "errorCode" in e ? String((e as { errorCode?: unknown }).errorCode ?? "").slice(0, 60) : "";
    const aad = e instanceof Error ? (/AADSTS\d+/.exec(e.message)?.[0] ?? "") : "";
    console.error("microsoft login failed:", e instanceof Error ? e.name : "unknown", code, aad);
    return fail("login_failed");
  }
}
