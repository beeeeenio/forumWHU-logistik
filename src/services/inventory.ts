import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import type { StockState } from "@/lib/domain/rules";
import { MAX_QUANTITY, STATE_LABEL, movementDeltas } from "@/lib/domain/rules";
import { fmtDate } from "@/lib/time";
import { audit } from "./audit";
import { bookMovements, type BookInput } from "./movements";
import { stockRows } from "./stock";

export interface CountRow { articleId: string; state: StockState; counted: number }
export type InventoryResult =
  | { ok: true; changed: number; same: number; lines: string[]; batchId: string | null }
  | { ok: false; error: string };

/**
 * Inventur eines Ortes: gezählte Mengen → nur die Abweichungen werden als Korrekturen gebucht, alle in EINER Transaktion
 * (entweder die ganze Zählung oder nichts). Zeilen, die stimmen, bleiben unberührt.
 *
 * `startedAt` = Beginn der Zählung. Wurde währenddessen am selben Ort umgelagert, verbraucht oder eingelagert, wird das herausgerechnet:
 * Gezählt wurde der Stand zum Zählbeginn, gebucht wird „gezählt + Bewegungen seitdem“. So erzeugt eine Zählung, die lange dauert,
 * keine falschen Differenzen.
 */
export async function submitCount(user: User, locationId: string, rows: CountRow[], note: string, startedAt: Date | null = null): Promise<InventoryResult> {
  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc || loc.archivedAt) return { ok: false, error: "Dieser Ort existiert nicht mehr oder ist archiviert." };
  if (!rows.length) return { ok: false, error: "Es wurde nichts gezählt." };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!Number.isInteger(r.counted) || r.counted < 0 || r.counted > MAX_QUANTITY) return { ok: false, error: "Gezählte Mengen müssen ganze Zahlen von 0 bis " + MAX_QUANTITY.toLocaleString("de-DE") + " sein." };
    const k = r.articleId + r.state;
    if (seen.has(k)) return { ok: false, error: "Eine Zeile kommt doppelt vor." };
    seen.add(k);
  }
  const [stock, articles] = await Promise.all([
    stockRows(prisma, { locationId }),
    prisma.article.findMany({ where: { id: { in: rows.map((r) => r.articleId) } } }),
  ]);
  const byId = new Map(articles.map((a) => [a.id, a]));
  // Bewegungen seit Zählbeginn an diesem Ort (ohne Korrekturen): höchstens 12 Stunden zurück, nie aus der Zukunft
  const now = Date.now();
  const since = startedAt && startedAt.getTime() <= now && startedAt.getTime() > now - 12 * 3600_000 ? startedAt : null;
  const drift = new Map<string, number>();
  if (since) {
    const moved = await prisma.movement.findMany({
      where: { createdAt: { gt: since }, voidedAt: null, kind: { not: "ADJUST" }, articleId: { in: rows.map((r) => r.articleId) }, OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] },
    });
    for (const m of moved) for (const d of movementDeltas(m)) if (d.locationId === locationId) drift.set(d.articleId + d.state, (drift.get(d.articleId + d.state) ?? 0) + d.quantity);
  }
  const inputs: BookInput[] = [];
  const lines: string[] = [];
  let same = 0;
  const why = `Inventur ${loc.name} ${fmtDate(new Date())}${note.trim() ? ` – ${note.trim().slice(0, 200)}` : ""}`;
  for (const r of rows) {
    const a = byId.get(r.articleId);
    if (!a || a.archivedAt) return { ok: false, error: "Ein Artikel existiert nicht mehr oder ist archiviert." };
    if (r.state === "EMPTY" && !a.returnable) return { ok: false, error: `${a.name} hat kein Leergut.` };
    const current = stock.find((s) => s.articleId === r.articleId && s.state === r.state)?.quantity ?? 0;
    const moved = drift.get(r.articleId + r.state) ?? 0;
    const target = Math.max(0, r.counted + moved);
    if (current === target) { same++; continue; }
    inputs.push({ kind: "ADJUST", articleId: r.articleId, quantity: target, fromLocationId: locationId, state: r.state, note: why, source: "inventory" });
    const diff = target - current;
    lines.push(`${a.name}${a.returnable ? (r.state === "FULL" ? " (voll)" : " (leer)") : ""}: ${current} → ${target} (${diff > 0 ? "+" : ""}${diff})${moved ? ` · inkl. ${moved > 0 ? "+" : ""}${moved} Bewegung seit Zählbeginn` : ""}`);
  }
  if (!inputs.length) return { ok: true, changed: 0, same, lines: [], batchId: null };
  const batchId = crypto.randomUUID();
  const res = await bookMovements(user, inputs, { batchId });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, changed: inputs.length, same, lines, batchId };
}

// ── Verlauf und Zurücknehmen ────────────────────────────────────────────────────────────────────────────────────────────────
export interface InventoryRun {
  batchId: string;
  at: Date;
  by: string;
  locationId: string | null;
  locationName: string;
  /** Je Korrektur: Text („Mineralwasser (voll): +3“), ID zum einzelnen Zurücknehmen, ob schon zurückgenommen */
  lines: { id: string; text: string; voided: boolean }[];
  voided: boolean;
  voidReason: string | null;
  /** Excel-Import statt Zählung */
  imported: boolean;
}

/** Bisherige Inventuren (eine Zählung = ein Eintrag), neueste zuerst. Optional nur für einen Ort. */
export async function listInventories(locationId?: string, take = 40): Promise<InventoryRun[]> {
  const moves = await prisma.movement.findMany({
    where: { source: { in: ["inventory", "import"] }, batchId: { not: null }, ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: take * 30,
    include: { article: true, createdBy: true, fromLocation: true, toLocation: true },
  });
  const runs = new Map<string, InventoryRun>();
  for (const m of moves) {
    const loc = m.fromLocation ?? m.toLocation;
    const delta = (m.toLocationId ? 1 : -1) * m.quantity;
    const line = `${m.article.name}${m.article.returnable && (m.toState ?? m.fromState) ? ` (${STATE_LABEL[(m.toState ?? m.fromState)!]})` : ""}: ${delta > 0 ? "+" : ""}${delta}`;
    const r = runs.get(m.batchId!) ?? { batchId: m.batchId!, at: m.createdAt, by: m.createdBy.displayName, locationId: loc?.id ?? null, locationName: loc?.name ?? "?", lines: [], voided: true, voidReason: null, imported: m.source === "import" };
    if (r.locationId && loc && loc.id !== r.locationId) { r.locationName = "mehrere Orte"; r.locationId = null; }
    r.lines.push({ id: m.id, text: line, voided: Boolean(m.voidedAt) });
    if (!m.voidedAt) r.voided = false; else r.voidReason ??= m.voidReason?.replace(/^Zurückgenommen:\s*/, "") ?? null;
    runs.set(m.batchId!, r);
  }
  return [...runs.values()].slice(0, take);
}

/** Nimmt eine ganze Inventur zurück: alle ihre Korrekturen werden storniert (alles oder nichts). Der Bestand ist danach wieder wie vor der Zählung. */
export async function voidInventory(user: User, batchId: string, reason: string): Promise<{ ok: true; voided: number; warnings: string[] } | { ok: false; error: string }> {
  const why = reason.trim().replace(/\s+/g, " ");
  if (why.length < 3) return { ok: false, error: "Bitte einen kurzen Grund angeben (z. B. „falsch gezählt“)." };
  return prisma.$transaction(async (tx) => {
    const moves = await tx.movement.findMany({ where: { batchId, source: { in: ["inventory", "import"] }, voidedAt: null }, include: { article: true } });
    if (!moves.length) return { ok: false as const, error: "Diese Inventur ist schon zurückgenommen oder existiert nicht." };
    const articleIds = [...new Set(moves.map((m) => m.articleId))].sort();
    for (const id of articleIds) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    await tx.movement.updateMany({ where: { id: { in: moves.map((m) => m.id) } }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: `Zurückgenommen: ${why}` } });
    await audit("inventory.void", { userId: user.id, entity: "inventory", entityId: batchId, detail: { movements: moves.length, reason: why } }, tx);
    const warnings: string[] = [];
    for (const id of articleIds) {
      const neg = (await stockRows(tx, { articleId: id })).filter((r) => r.quantity < 0);
      if (neg.length) warnings.push(`Achtung: ${moves.find((m) => m.articleId === id)!.article.name} hat jetzt einen Minusbestand – spätere Buchungen passen nicht mehr dazu.`);
    }
    return { ok: true as const, voided: moves.length, warnings };
  });
}
