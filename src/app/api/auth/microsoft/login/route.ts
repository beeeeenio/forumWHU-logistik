import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { LOGIN_SCOPES, loginRedirectUri, microsoftConfigured, msalApp } from "@/integrations/microsoft/msal";
import { clientIp } from "@/lib/client-ip";
import { hashSecret, pkceChallenge, randomToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { LOGIN_FLOW_COOKIE, loginFlowCookieOptions } from "@/lib/session";
import { appUrl, safeReturnTo } from "@/lib/url";

/** Startet „Mit Microsoft anmelden“ (Authorization Code + PKCE, Single-Tenant-Authority). */
export async function GET(req: NextRequest) {
  const rl = rateLimit(`login:${clientIp(req.headers) ?? "unbekannt"}`, 20, 60_000);
  if (!rl.ok) return new NextResponse("Zu viele Anfragen. Bitte kurz warten.", { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  await prisma.authFlowState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  if (!microsoftConfigured()) return NextResponse.redirect(appUrl("/login?error=not_configured"));
  const state = randomToken();
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  await prisma.authFlowState.create({
    data: { stateHash: hashSecret(state), purpose: "login", pkceVerifier: verifier, nonce, returnTo, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const url = await msalApp().getAuthCodeUrl({
    scopes: LOGIN_SCOPES,
    redirectUri: loginRedirectUri(),
    state,
    nonce,
    codeChallenge: pkceChallenge(verifier),
    codeChallengeMethod: "S256",
    prompt: "select_account",
  });
  const res = NextResponse.redirect(url);
  res.cookies.set(LOGIN_FLOW_COOKIE, state, loginFlowCookieOptions());
  return res;
}
