import "server-only";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "@/lib/env";

export const LOGIN_SCOPES = ["openid", "profile", "email"];

export function microsoftConfigured(): boolean {
  const e = env();
  return Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET && e.MICROSOFT_TENANT_ID);
}

/** MSAL-Client, an den eigenen Tenant gebunden (Single Tenant: Konten anderer Verzeichnisse können sich nicht anmelden). */
export function msalApp(): ConfidentialClientApplication {
  const e = env();
  if (!microsoftConfigured()) throw new Error("Microsoft Entra ID ist nicht konfiguriert (MICROSOFT_CLIENT_ID/SECRET/TENANT_ID)");
  return new ConfidentialClientApplication({
    auth: {
      clientId: e.MICROSOFT_CLIENT_ID!,
      clientSecret: e.MICROSOFT_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${e.MICROSOFT_TENANT_ID}`,
    },
  });
}

export function loginRedirectUri(): string {
  return env().MICROSOFT_REDIRECT_URI ?? `${env().APP_URL.replace(/\/$/, "")}/api/auth/microsoft/callback`;
}

/** Der Nonce MUSS derselbe sein wie im Autorisierungs-Request (sonst lehnt msal-node das ID-Token ab). */
export function loginCodeRequest(p: { code: string; codeVerifier: string; nonce: string }) {
  return { code: p.code, scopes: LOGIN_SCOPES, redirectUri: loginRedirectUri(), codeVerifier: p.codeVerifier, nonce: p.nonce };
}
