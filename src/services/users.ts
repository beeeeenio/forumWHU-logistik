import "server-only";
import { prisma } from "@/db/prisma";
import type { Tx } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import { canManageUser, isRole, type Role } from "@/lib/roles";
import { audit } from "./audit";

export type Res = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(actor: User, p: { displayName: string; email: string; role: Role }): Promise<Res> {
  const displayName = p.displayName.trim().replace(/\s+/g, " ");
  const email = p.email.trim();
  if (displayName.length < 2) return { ok: false, error: "Bitte den Namen eingeben." };
  if (!EMAIL.test(email)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben (die Microsoft-Adresse der Person)." };
  if (!isRole(p.role)) return { ok: false, error: "Unbekannte Rolle." };
  const normalizedEmail = email.toLowerCase();
  if (await prisma.user.findUnique({ where: { normalizedEmail } })) return { ok: false, error: "Diese E-Mail-Adresse ist schon eingetragen." };
  const u = await prisma.user.create({ data: { displayName, email, normalizedEmail, role: p.role } });
  await audit("user.create", { userId: actor.id, entity: "user", entityId: u.id, detail: { email: normalizedEmail, role: p.role } });
  return { ok: true };
}

/**
 * Rollen- und Sperr-Änderungen laufen nacheinander (Sperre auf „Administratoren“) und prüfen innerhalb derselben Transaktion:
 * Ist die handelnde Person noch Administrator, und bleibt danach mindestens einer übrig? Ohne das könnten sich zwei Admins
 * gleichzeitig gegenseitig herabstufen und niemand wäre mehr Administrator.
 */
async function adminTx<T>(actorId: string, fn: (tx: Tx) => Promise<T>): Promise<T | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('logistik:admins', 0))`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role !== "ADMIN" || actor.status === "DEACTIVATED") return { ok: false as const, error: "Dafür fehlt dir inzwischen die Berechtigung." };
    return fn(tx);
  });
}
const otherActiveAdmins = (tx: Tx, exceptId: string) => tx.user.count({ where: { role: "ADMIN", status: { not: "DEACTIVATED" }, id: { not: exceptId } } });

export async function setRole(actor: User, targetId: string, role: Role): Promise<Res> {
  if (!isRole(role)) return { ok: false, error: "Unbekannte Rolle." };
  return adminTx(actor.id, async (tx): Promise<Res> => {
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) return { ok: false, error: "Person nicht gefunden." };
    if (!canManageUser(actor, target)) return { ok: false, error: "Die eigene Rolle kann nur ein anderer Administrator ändern." };
    if (target.role === "ADMIN" && role !== "ADMIN" && (await otherActiveAdmins(tx, target.id)) === 0) return { ok: false, error: "Es muss mindestens ein Administrator bleiben." };
    await tx.user.update({ where: { id: target.id }, data: { role } });
    await audit("user.role", { userId: actor.id, entity: "user", entityId: target.id, detail: { from: target.role, to: role } }, tx);
    return { ok: true };
  });
}

/** Sperren beendet sofort alle Sitzungen; Entsperren stellt den Zugang wieder her (Status PENDING/ACTIVE je nach bisherigem Login). */
export async function setActive(actor: User, targetId: string, active: boolean): Promise<Res> {
  return adminTx(actor.id, async (tx): Promise<Res> => {
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) return { ok: false, error: "Person nicht gefunden." };
    if (!canManageUser(actor, target)) return { ok: false, error: "Sich selbst kann man nicht sperren." };
    if (!active && target.role === "ADMIN" && (await otherActiveAdmins(tx, target.id)) === 0) return { ok: false, error: "Der letzte Administrator kann nicht gesperrt werden." };
    await tx.user.update({ where: { id: target.id }, data: { status: active ? (target.microsoftOid ? "ACTIVE" : "PENDING") : "DEACTIVATED" } });
    if (!active) await tx.session.deleteMany({ where: { userId: target.id } });
    await audit(active ? "user.activate" : "user.deactivate", { userId: actor.id, entity: "user", entityId: target.id }, tx);
    return { ok: true };
  });
}

export async function signOutEverywhere(actor: User, targetId: string): Promise<Res> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Person nicht gefunden." };
  await prisma.session.deleteMany({ where: { userId: target.id } });
  await audit("user.signout", { userId: actor.id, entity: "user", entityId: target.id });
  return { ok: true };
}
