import "server-only";
import { prisma } from "@/db/prisma";

export type LinkResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_provisioned" | "identity_mismatch" | "deactivated" | "no_email" };

/**
 * Einziger Anmeldeweg (Microsoft). Es wird nie ein Benutzer angelegt: Personen müssen vorab eingetragen sein
 * (Administration oder scripts/create-user.mts). Erster Login: Zuordnung über die E-Mail-Adresse (nur ohne bestehende
 * Microsoft-Identität), danach nur noch über oid + tid.
 */
export async function linkMicrosoftLogin(p: { oid: string; tid: string; email: string | null; displayName: string | null }): Promise<LinkResult> {
  const byOid = await prisma.user.findUnique({ where: { microsoftOid: p.oid } });
  if (byOid) {
    if (byOid.tenantId && byOid.tenantId.toLowerCase() !== p.tid.toLowerCase()) return { ok: false, reason: "identity_mismatch" };
    if (byOid.status === "DEACTIVATED") return { ok: false, reason: "deactivated" };
    const now = new Date();
    await prisma.user.update({ where: { id: byOid.id }, data: { lastLoginAt: now, lastSeenAt: now, status: "ACTIVE" } });
    return { ok: true, userId: byOid.id };
  }

  const email = p.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no_email" };
  const candidate = await prisma.user.findUnique({ where: { normalizedEmail: email } });
  if (!candidate) return { ok: false, reason: "not_provisioned" };
  if (candidate.status === "DEACTIVATED") return { ok: false, reason: "deactivated" };
  if (candidate.microsoftOid && candidate.microsoftOid !== p.oid) return { ok: false, reason: "identity_mismatch" };

  // Atomar verknüpfen: nur wenn noch keine Microsoft-Identität eingetragen ist (kein Rennen zwischen zwei Logins)
  const loginAt = new Date();
  const { count } = await prisma.user.updateMany({
    where: { id: candidate.id, microsoftOid: null },
    data: { microsoftOid: p.oid, tenantId: p.tid, status: "ACTIVE", lastLoginAt: loginAt, lastSeenAt: loginAt },
  });
  if (count !== 1) return { ok: false, reason: "identity_mismatch" };
  return { ok: true, userId: candidate.id };
}
