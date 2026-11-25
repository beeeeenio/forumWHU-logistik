import "server-only";
import { prisma } from "@/db/prisma";
import type { Tx } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import { adjustTo, resolveMovement, KIND_LABEL, STATE_LABEL, type MovementKind, type Place, type StockState } from "@/lib/domain/rules";
import { fmtQty } from "@/lib/format";
import { audit } from "./audit";
import { stockAt, stockRows } from "./stock";

export interface BookInput {
  kind: MovementKind;
  /** Bestehender Artikel … */
  articleId?: string | null;
  /** … oder ein neuer (wird mit angelegt) */
  newArticle?: { name: string; unit: string; returnable: boolean } | null;
  /** Menge; bei Korrektur die gezählte Menge */
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  state?: StockState;
  supplierId?: string | null;
  supplierName?: string | null;
  note?: string | null;
  occurredAt?: Date | null;
  source?: "ui" | "quick" | "plan" | "inventory" | "import";
  /** Trotz zu geringem Bestand buchen (Bestand wird negativ und im Lagebericht markiert) */
  force?: boolean;
  /** nur intern: Plan, der dadurch erledigt wird */
  planId?: string | null;
}

export type BookResult =
  | { ok: true; ids: string[]; warnings: string[]; /** diese Erfassung war schon gespeichert – es wurde nichts doppelt gebucht */ duplicate?: boolean }
  | { ok: false; code: "INVALID" | "INSUFFICIENT" | "FORBIDDEN"; error: string; index?: number };

/** Datenbank-Deadlock bzw. Serialisierungskonflikt: sicher wiederholbar (die Transaktion wurde komplett zurückgerollt). */
export function isRetryable(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : "";
  return code === "P2034" || code === "40P01" || code === "40001" || (e instanceof Error && /deadlock detected|40P01/i.test(e.message));
}

class Rollback extends Error {
  constructor(public result: Extract<BookResult, { ok: false }>) { super(result.error); }
}

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

async function lockArticle(tx: Tx, articleId: string) {
  // Zwei gleichzeitige Buchungen desselben Artikels laufen nacheinander (sonst könnten beide „genug Bestand“ sehen).
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${articleId}, 0))`;
}

async function locationName(tx: Tx, id: string): Promise<string> {
  const l = await tx.location.findUnique({ where: { id }, select: { name: true, code: true } });
  return l ? l.name + (l.code && l.code !== l.name ? ` (${l.code})` : "") : "?";
}

async function bookOne(tx: Tx, user: User, input: BookInput, batchId: string | null, index: number, requestKey: string | null = null): Promise<{ id: string; warnings: string[] }> {
  const fail = (code: "INVALID" | "INSUFFICIENT", error: string) => new Rollback({ ok: false, code, error, index });
  const warnings: string[] = [];

  // Artikel (bestehend oder neu)
  let articleId = input.articleId ?? null;
  if (!articleId && input.newArticle) {
    const name = clean(input.newArticle.name);
    if (name.length < 2) throw fail("INVALID", "Der Name des neuen Artikels ist zu kurz.");
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${"article:" + name.toLowerCase()}, 0))`; // zwei gleichzeitige „neuer Artikel X“ legen X nur einmal an
    const existing = await tx.article.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null } });
    if (existing) articleId = existing.id;
    else {
      const created = await tx.article.create({ data: { name, unit: clean(input.newArticle.unit) || "Stück", returnable: input.newArticle.returnable } });
      articleId = created.id;
      await audit("article.create", { userId: user.id, entity: "article", entityId: created.id, detail: { name, via: "buchung" } }, tx);
    }
  }
  if (!articleId) throw fail("INVALID", "Bitte einen Artikel wählen.");
  await lockArticle(tx, articleId);
  const article = await tx.article.findUnique({ where: { id: articleId } });
  if (!article || article.archivedAt) throw fail("INVALID", "Dieser Artikel ist nicht mehr aktiv.");

  const state: StockState = input.state ?? "FULL";
  let from: Place | null;
  let to: Place | null;
  let quantity: number;
  if (input.kind === "ADJUST") {
    const loc = input.fromLocationId || input.toLocationId;
    if (!loc) throw fail("INVALID", "Wo wurde gezählt? Bitte den Ort wählen.");
    if (state === "EMPTY" && !article.returnable) throw fail("INVALID", "Dieser Artikel hat kein Leergut.");
    if (clean(input.note).length < 3) throw fail("INVALID", "Bitte kurz notieren, warum korrigiert wird (z. B. „Inventur Freitagabend“).");
    const current = await stockAt(tx, articleId, loc, state);
    const r = adjustTo(loc, state, input.quantity, current);
    if (!r.ok) throw fail("INVALID", r.error);
    ({ from, to, quantity } = r);
  } else {
    const r = resolveMovement({ kind: input.kind, quantity: input.quantity, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, state }, article.returnable);
    if (!r.ok) throw fail("INVALID", r.error);
    ({ from, to, quantity } = r);
  }

  // Orte müssen existieren und aktiv sein
  for (const p of [from, to]) {
    if (!p) continue;
    const loc = await tx.location.findUnique({ where: { id: p.locationId }, select: { archivedAt: true } });
    if (!loc || loc.archivedAt) throw fail("INVALID", "Ein gewählter Lagerort existiert nicht mehr oder ist archiviert.");
  }

  // Genug Bestand an der Quelle? (Korrekturen sind die Zählung selbst und werden nicht geprüft)
  if (from && input.kind !== "ADJUST") {
    const have = await stockAt(tx, articleId, from.locationId, from.state);
    if (have < quantity) {
      const msg = `In ${await locationName(tx, from.locationId)} sind nur ${fmtQty(have, article.unit)} ${STATE_LABEL[from.state]} gebucht (nicht ${fmtQty(quantity, article.unit)}).`;
      if (!input.force) throw fail("INSUFFICIENT", msg);
      warnings.push(msg + " Gebucht trotzdem – der Bestand ist jetzt negativ und im Lagebericht markiert.");
    }
  }

  // Lieferant (nur bei Eingang sinnvoll)
  let supplierId = input.supplierId || null;
  const supplierName = clean(input.supplierName);
  if (!supplierId && supplierName && input.kind === "RECEIPT") {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${"supplier:" + supplierName.toLowerCase()}, 0))`;
    const s = (await tx.supplier.findFirst({ where: { name: { equals: supplierName, mode: "insensitive" }, archivedAt: null } })) ?? (await tx.supplier.create({ data: { name: supplierName } }));
    supplierId = s.id;
  }
  if (input.kind !== "RECEIPT") supplierId = null;

  const m = await tx.movement.create({
    data: {
      batchId,
      kind: input.kind,
      occurredAt: input.occurredAt ?? new Date(),
      articleId,
      quantity,
      fromLocationId: from?.locationId ?? null,
      fromState: from?.state ?? null,
      toLocationId: to?.locationId ?? null,
      toState: to?.state ?? null,
      supplierId,
      note: clean(input.note) || null,
      source: input.source ?? "ui",
      createdById: user.id,
      requestKey,
      requestIndex: requestKey ? index : null,
    },
  });
  return { id: m.id, warnings };
}

/** Bucht Zeilen innerhalb einer bereits offenen Transaktion (z. B. Import). Wirft `BookingRollback`, dann ist alles zurückzurollen. */
export async function bookInTx(tx: Tx, user: User, inputs: BookInput[], batchId: string | null, requestKey: string | null = null): Promise<{ ids: string[]; warnings: string[] }> {
  const ids: string[] = [];
  const warnings: string[] = [];
  // Alle bekannten Artikel in fester Reihenfolge sperren: Zwei Erfassungen mit denselben Artikeln in gegenläufiger Reihenfolge
  // (Wasser, Brot / Brot, Wasser) würden sich sonst gegenseitig blockieren (Deadlock).
  for (const id of [...new Set(inputs.map((i) => i.articleId).filter((x): x is string => Boolean(x)))].sort()) await lockArticle(tx, id);
  for (let i = 0; i < inputs.length; i++) {
    const r = await bookOne(tx, user, inputs[i], batchId, i, requestKey);
    ids.push(r.id);
    warnings.push(...r.warnings);
  }
  return { ids, warnings };
}
export { Rollback as BookingRollback };

/**
 * Bucht eine oder mehrere Bewegungen in EINER Transaktion: entweder alle oder keine (z. B. eine ganze Lieferung).
 * Mit `requestKey` (vom Formular erzeugt) ist die Erfassung idempotent: dieselbe Kennung bucht nie ein zweites Mal – ein Doppeltipp
 * oder eine Wiederholung nach einem Funkloch liefert das Ergebnis der ersten Buchung zurück.
 */
export async function bookMovements(user: User, inputs: BookInput[], opts: { batchId?: string; requestKey?: string | null } = {}): Promise<BookResult> {
  if (!inputs.length) return { ok: false, code: "INVALID", error: "Nichts zu buchen." };
  if (inputs.length > 100) return { ok: false, code: "INVALID", error: "Höchstens 100 Zeilen auf einmal." };
  const requestKey = opts.requestKey ?? null;
  const already = async (): Promise<BookResult | null> => {
    if (!requestKey) return null;
    const prev = await prisma.movement.findMany({ where: { requestKey, createdById: user.id }, orderBy: { requestIndex: "asc" }, select: { id: true } });
    return prev.length ? { ok: true, ids: prev.map((p) => p.id), warnings: [], duplicate: true } : null;
  };
  const dup = await already();
  if (dup) return dup;
  const batchId = opts.batchId ?? (inputs.length > 1 ? crypto.randomUUID() : null);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => ({ ok: true as const, ...(await bookInTx(tx, user, inputs, batchId, requestKey)) }), { timeout: 20_000 });
      } catch (e) {
        if (attempt < 2 && isRetryable(e)) { await new Promise((r) => setTimeout(r, 50 + Math.random() * 100)); continue; }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    // Zwei gleichzeitige Anfragen mit derselben Kennung: die zweite scheitert an der Eindeutigkeit und bekommt das Ergebnis der ersten
    if (requestKey && e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") { const d = await already(); if (d) return d; }
    throw e;
  }
}

export type VoidResult = { ok: true; warnings: string[] } | { ok: false; error: string };

/** „Löschen“ = Stornieren: die Bewegung bleibt im Journal (durchgestrichen, mit Grund und Person), zählt aber nicht mehr. */
export async function voidMovement(user: User, movementId: string, reason: string): Promise<VoidResult> {
  const why = clean(reason);
  if (why.length < 3) return { ok: false, error: "Bitte einen kurzen Grund angeben (z. B. „falsche Menge“)." };
  return prisma.$transaction(async (tx) => {
    const pre = await tx.movement.findUnique({ where: { id: movementId }, select: { articleId: true } });
    if (!pre) return { ok: false as const, error: "Diese Buchung gibt es nicht." };
    await lockArticle(tx, pre.articleId); // erst sperren, dann prüfen: zwei gleichzeitige Stornos überschreiben sich sonst
    const m = await tx.movement.findUnique({ where: { id: movementId }, include: { article: true, plan: true } });
    if (!m) return { ok: false as const, error: "Diese Buchung gibt es nicht." };
    if (m.voidedAt) return { ok: false as const, error: "Diese Buchung ist bereits storniert." };
    await tx.movement.update({ where: { id: m.id }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: why } });
    if (m.plan) await tx.plan.update({ where: { id: m.plan.id }, data: { status: "OPEN", doneMovementId: null } });
    await audit("movement.void", { userId: user.id, entity: "movement", entityId: m.id, detail: { kind: m.kind, article: m.article.name, quantity: m.quantity, reason: why } }, tx);
    // Ergibt sich dadurch irgendwo ein negativer Bestand? Dann deutlich warnen (storniert wird trotzdem).
    const warnings: string[] = [];
    const rows = await stockRows(tx, { articleId: m.articleId });
    for (const r of rows.filter((x) => x.quantity < 0)) {
      warnings.push(`Achtung: ${m.article.name} ${STATE_LABEL[r.state]} in ${await locationName(tx, r.locationId)} ist jetzt ${r.quantity} – spätere Buchungen passen nicht mehr dazu.`);
    }
    return { ok: true as const, warnings };
  });
}

/** Sofort rückgängig: nur eigene Buchungen der letzten 15 Minuten (für Fehleingaben direkt nach dem Buchen). */
export async function voidRecent(user: User, ids: string[], maxAgeMs = 15 * 60_000): Promise<VoidResult> {
  const rows = await prisma.movement.findMany({ where: { id: { in: ids.slice(0, 100) }, createdById: user.id, voidedAt: null, createdAt: { gte: new Date(Date.now() - maxAgeMs) } }, select: { id: true } });
  if (!rows.length) return { ok: false, error: "Sofort rückgängig geht nur für eigene Buchungen der letzten 15 Minuten. Ältere kannst du im Journal stornieren." };
  const warnings: string[] = [];
  for (const r of rows) { const res = await voidMovement(user, r.id, "Sofort rückgängig gemacht"); if (!res.ok) return res; warnings.push(...res.warnings); }
  return { ok: true, warnings };
}

export { KIND_LABEL };
