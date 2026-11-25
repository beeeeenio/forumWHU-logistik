import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import { hashSecret, randomToken } from "./crypto";
import { clientIp } from "./client-ip";
import { env } from "./env";
import { canWrite, isAdmin } from "./roles";

/**
 * Serverseitige Sitzungen: zufälliges 256-Bit-Token im HttpOnly-Cookie, in der DB nur sein HMAC.
 * Nur ACTIVE-Benutzer haben eine gültige Sitzung; Sperren löscht die Sitzungen (Zugriff endet sofort).
 */
const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-logi_session" : "logi_session";
export const LOGIN_FLOW_COOKIE = PROD ? "__Host-logi_login_flow" : "logi_login_flow";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function loginFlowCookieOptions() {
  return { httpOnly: true, secure: PROD, sameSite: "lax" as const, path: "/", maxAge: 600 };
}

export async function createSession(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined); // Aufräumen: abgelaufene Sitzungen
  const token = randomToken(32);
  const h = await headers();
  const ttlMs = env().SESSION_TTL_HOURS * 3600 * 1000;
  await prisma.session.create({
    data: {
      tokenHash: hashSecret(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
      ipAddress: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", maxAge: Math.floor(ttlMs / 1000) });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSecret(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Gültige Sitzung eines ACTIVE-Benutzers zu einem Cookie-Token, sonst null. */
export async function sessionFromToken(token: string | undefined | null): Promise<{ sessionId: string; user: User } | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashSecret(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const now = new Date();
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now, user: { update: { lastSeenAt: now } } } }).catch(() => undefined);
  }
  return { sessionId: session.id, user: session.user };
}

export const getSessionUser = cache(async (): Promise<User | null> => (await sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value))?.user ?? null);

/** Seiten: ohne aktive Sitzung zur Anmeldung. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Seiten, die Daten ändern (Betrachter werden zur Erklärungsseite geleitet). */
export async function requireWriter(): Promise<User> {
  const user = await requireUser();
  if (!canWrite(user.role)) redirect("/keine-berechtigung");
  return user;
}

export async function requireAdminPage(): Promise<User> {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect("/keine-berechtigung");
  return user;
}

/** Server-Aktionen: Benutzer mit der nötigen Rolle oder null (die Aktion antwortet dann mit einer Fehlermeldung). */
export async function actionUser(need: "write" | "admin"): Promise<User | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (need === "admin" ? !isAdmin(user.role) : !canWrite(user.role)) return null;
  return user;
}
