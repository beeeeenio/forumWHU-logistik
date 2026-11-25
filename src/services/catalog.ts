import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { LocationKind, User } from "@/generated/prisma/client";
import { prisma } from "@/db/prisma";
import { audit } from "./audit";
import { stockRows } from "./stock";

export type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isFk = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";

// ── Lagerorte ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface LocationInput { name: string; code: string | null; parentId: string | null; kind: LocationKind; cooled: boolean; note: string | null; sortOrder: number }

async function wouldCycle(id: string, parentId: string | null): Promise<boolean> {
  let cur = parentId;
  for (let i = 0; cur && i < 20; i++) {
    if (cur === id) return true;
    cur = (await prisma.location.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
  }
  return false;
}

export async function saveLocation(user: User, id: string | null, d: LocationInput): Promise<Res<{ id: string }>> {
  const name = clean(d.name);
  if (name.length < 1) return { ok: false, error: "Bitte einen Namen eingeben." };
  const code = clean(d.code).replace(/\s+/g, "") || null;
  if (id && (await wouldCycle(id, d.parentId))) return { ok: false, error: "Ein Ort kann nicht in sich selbst liegen." };
  try {
    const data = { name, code, parentId: d.parentId, kind: d.kind, cooled: d.cooled, note: clean(d.note) || null, sortOrder: d.sortOrder };
    const loc = id ? await prisma.location.update({ where: { id }, data }) : await prisma.location.create({ data });
    await audit(id ? "location.update" : "location.create", { userId: user.id, entity: "location", entityId: loc.id, detail: { name } });
    return { ok: true, id: loc.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: `Der Kurzcode „${code}“ ist schon vergeben.` };
    throw e;
  }
}

/** Archivieren (ausblenden) nur ohne Bestand und ohne aktive Unterorte; Löschen nur, wenn nie etwas gebucht/geplant wurde. */
export async function removeLocation(user: User, id: string, mode: "archive" | "delete"): Promise<Res> {
  const loc = await prisma.location.findUnique({ where: { id }, include: { children: { where: { archivedAt: null }, select: { id: true } } } });
  if (!loc) return { ok: false, error: "Ort nicht gefunden." };
  if (mode === "archive") {
    if (loc.children.length) return { ok: false, error: "Zuerst die Unterorte archivieren oder verschieben." };
    const left = (await stockRows(prisma, { locationId: id })).filter((r) => r.quantity !== 0);
    if (left.length) return { ok: false, error: "Hier liegt noch Bestand (oder ein Minusbestand). Erst umlagern oder per Korrektur auf 0 setzen." };
    await prisma.plan.updateMany({ where: { status: "OPEN", OR: [{ toLocationId: id }, { fromLocationId: id }] }, data: { status: "CANCELLED" } });
    await prisma.location.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit("location.archive", { userId: user.id, entity: "location", entityId: id, detail: { name: loc.name } });
    return { ok: true };
  }
  try {
    await prisma.location.delete({ where: { id } });
  } catch (e) {
    if (isFk(e)) return { ok: false, error: "Dieser Ort wird schon in Buchungen oder Plänen verwendet – bitte archivieren statt löschen." };
    throw e;
  }
  await audit("location.delete", { userId: user.id, entity: "location", entityId: id, detail: { name: loc.name } });
  return { ok: true };
}

export async function restoreLocation(user: User, id: string): Promise<Res> {
  await prisma.location.update({ where: { id }, data: { archivedAt: null } });
  await audit("location.restore", { userId: user.id, entity: "location", entityId: id });
  return { ok: true };
}

// ── Artikel ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ArticleInput { name: string; aliases: string[]; category: string; unit: string; returnable: boolean; depositCents: number; needsCooling: boolean; minStock: number | null; note: string | null }

export async function saveArticle(user: User, id: string | null, d: ArticleInput): Promise<Res<{ id: string }>> {
  const name = clean(d.name);
  if (name.length < 2) return { ok: false, error: "Bitte einen Namen eingeben (mindestens 2 Zeichen)." };
  if (!Number.isInteger(d.depositCents) || d.depositCents < 0 || d.depositCents > 100_000) return { ok: false, error: "Pfand: bitte einen Betrag zwischen 0 und 1.000 € angeben." };
  if (!d.returnable && d.depositCents > 0) return { ok: false, error: "Pfand gibt es nur bei Pfandartikeln (Leergut). Bitte „Pfandartikel“ aktivieren." };
  if (id && !d.returnable) {
    const empties = (await stockRows(prisma, { articleId: id })).filter((r) => r.state === "EMPTY" && r.quantity !== 0);
    if (empties.length) return { ok: false, error: "Es ist noch Leergut gebucht – „Pfandartikel“ kann erst abgeschaltet werden, wenn keins mehr da ist." };
  }
  if (d.minStock !== null && (!Number.isInteger(d.minStock) || d.minStock < 0 || d.minStock > 100_000)) return { ok: false, error: "Mindestbestand: bitte eine ganze Zahl ≥ 0 angeben oder das Feld leer lassen." };
  const aliases = [...new Set(d.aliases.map(clean).filter(Boolean))].slice(0, 20);
  try {
    const data = { name, aliases, category: clean(d.category) || "Sonstiges", unit: clean(d.unit) || "Stück", returnable: d.returnable, depositCents: d.depositCents, needsCooling: d.needsCooling, minStock: d.minStock, note: clean(d.note) || null };
    const a = id ? await prisma.article.update({ where: { id }, data }) : await prisma.article.create({ data });
    await audit(id ? "article.update" : "article.create", { userId: user.id, entity: "article", entityId: a.id, detail: { name } });
    return { ok: true, id: a.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: `Einen Artikel „${name}“ gibt es schon.` };
    throw e;
  }
}

export async function removeArticle(user: User, id: string, mode: "archive" | "delete"): Promise<Res> {
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return { ok: false, error: "Artikel nicht gefunden." };
  if (mode === "archive") {
    const left = (await stockRows(prisma, { articleId: id })).filter((r) => r.quantity !== 0);
    if (left.length) return { ok: false, error: "Es gibt noch Bestand (oder Minusbestand) dieses Artikels. Erst abbuchen." };
    await prisma.plan.updateMany({ where: { articleId: id, status: "OPEN" }, data: { status: "CANCELLED" } });
    await prisma.article.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit("article.archive", { userId: user.id, entity: "article", entityId: id, detail: { name: a.name } });
    return { ok: true };
  }
  try {
    await prisma.article.delete({ where: { id } });
  } catch (e) {
    if (isFk(e)) return { ok: false, error: "Dieser Artikel hat Buchungen oder Pläne – bitte archivieren statt löschen." };
    throw e;
  }
  await audit("article.delete", { userId: user.id, entity: "article", entityId: id, detail: { name: a.name } });
  return { ok: true };
}

export async function restoreArticle(user: User, id: string): Promise<Res> {
  try {
    await prisma.article.update({ where: { id }, data: { archivedAt: null } });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "Es gibt inzwischen einen aktiven Artikel mit demselben Namen." };
    throw e;
  }
  await audit("article.restore", { userId: user.id, entity: "article", entityId: id });
  return { ok: true };
}

// ── Lieferanten ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function saveSupplier(user: User, id: string | null, d: { name: string; note: string | null }): Promise<Res<{ id: string }>> {
  const name = clean(d.name);
  if (name.length < 2) return { ok: false, error: "Bitte einen Namen eingeben." };
  try {
    const s = id ? await prisma.supplier.update({ where: { id }, data: { name, note: clean(d.note) || null } }) : await prisma.supplier.create({ data: { name, note: clean(d.note) || null } });
    await audit(id ? "supplier.update" : "supplier.create", { userId: user.id, entity: "supplier", entityId: s.id, detail: { name } });
    return { ok: true, id: s.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: `Einen Lieferanten „${name}“ gibt es schon.` };
    throw e;
  }
}

export async function removeSupplier(user: User, id: string, mode: "archive" | "delete"): Promise<Res> {
  if (mode === "archive") {
    await prisma.supplier.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit("supplier.archive", { userId: user.id, entity: "supplier", entityId: id });
    return { ok: true };
  }
  try {
    await prisma.supplier.delete({ where: { id } });
  } catch (e) {
    if (isFk(e)) return { ok: false, error: "Dieser Lieferant steht in Buchungen – bitte archivieren statt löschen." };
    throw e;
  }
  await audit("supplier.delete", { userId: user.id, entity: "supplier", entityId: id });
  return { ok: true };
}
