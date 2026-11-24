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
  source?: "ui" | "quick" | "plan";
  /** Trotz zu geringem Bestand buchen (Bestand wird negativ und im Lagebericht markiert) */
  force?: boolean;
  /** nur intern: Plan, der dadurch erledigt wird */
  planId?: string | null;
}

export type BookResult =
  | { ok: true; ids: string[]; warnings: string[] }
  | { ok: false; code: "INVALID" | "INSUFFICIENT" | "FORBIDDEN"; error: string; index?: number };

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

async function bookOne(tx: Tx, user: User, input: BookInput, batchId: string | null, index: number): Promise<{ id: string; warnings: string[] }> {
  const fail = (code: "INVALID" | "INSUFFICIENT", error: string) => new Rollback({ ok: false, code, error, index });
  const warnings: string[] = [];

  // Artikel (bestehend oder neu)
  let articleId = input.articleId ?? null;
  if (!articleId && input.newArticle) {
    const name = clean(input.newArticle.name);
    if (name.length < 2) throw fail("INVALID", "Der Name des neuen Artikels ist zu kurz.");
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
    },
  });
  return { id: m.id, warnings };
}

/** Bucht eine oder mehrere Bewegungen in EINER Transaktion: entweder alle oder keine (z. B. eine ganze Lieferung). */
export async function bookMovements(user: User, inputs: BookInput[]): Promise<BookResult> {
  if (!inputs.length) return { ok: false, code: "INVALID", error: "Nichts zu buchen." };
  if (inputs.length > 100) return { ok: false, code: "INVALID", error: "Höchstens 100 Zeilen auf einmal." };
  const batchId = inputs.length > 1 ? crypto.randomUUID() : null;
  try {
    return await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < inputs.length; i++) {
        const r = await bookOne(tx, user, inputs[i], batchId, i);
        ids.push(r.id);
        warnings.push(...r.warnings);
      }
      return { ok: true as const, ids, warnings };
    }, { timeout: 20_000 });
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
}

export type VoidResult = { ok: true; warnings: string[] } | { ok: false; error: string };

/** „Löschen“ = Stornieren: die Bewegung bleibt im Journal (durchgestrichen, mit Grund und Person), zählt aber nicht mehr. */
export async function voidMovement(user: User, movementId: string, reason: string): Promise<VoidResult> {
  const why = clean(reason);
  if (why.length < 3) return { ok: false, error: "Bitte einen kurzen Grund angeben (z. B. „falsche Menge“)." };
  return prisma.$transaction(async (tx) => {
    const m = await tx.movement.findUnique({ where: { id: movementId }, include: { article: true, plan: true } });
    if (!m) return { ok: false as const, error: "Diese Buchung gibt es nicht." };
    if (m.voidedAt) return { ok: false as const, error: "Diese Buchung ist bereits storniert." };
    await lockArticle(tx, m.articleId);
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

export { KIND_LABEL };
