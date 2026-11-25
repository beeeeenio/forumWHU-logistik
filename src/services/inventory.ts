import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import type { StockState } from "@/lib/domain/rules";
import { MAX_QUANTITY, STATE_LABEL } from "@/lib/domain/rules";
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
 */
export async function submitCount(user: User, locationId: string, rows: CountRow[], note: string): Promise<InventoryResult> {
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
  const inputs: BookInput[] = [];
  const lines: string[] = [];
  let same = 0;
  const why = `Inventur ${loc.name} ${fmtDate(new Date())}${note.trim() ? ` – ${note.trim().slice(0, 200)}` : ""}`;
  for (const r of rows) {
    const a = byId.get(r.articleId);
    if (!a || a.archivedAt) return { ok: false, error: "Ein Artikel existiert nicht mehr oder ist archiviert." };
    if (r.state === "EMPTY" && !a.returnable) return { ok: false, error: `${a.name} hat kein Leergut.` };
    const current = stock.find((s) => s.articleId === r.articleId && s.state === r.state)?.quantity ?? 0;
    if (current === r.counted) { same++; continue; }
    inputs.push({ kind: "ADJUST", articleId: r.articleId, quantity: r.counted, fromLocationId: locationId, state: r.state, note: why, source: "inventory" });
    const diff = r.counted - current;
    lines.push(`${a.name}${a.returnable ? (r.state === "FULL" ? " (voll)" : " (leer)") : ""}: ${current} → ${r.counted} (${diff > 0 ? "+" : ""}${diff})`);
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
  /** „Mineralwasser (voll): +3“ */
  lines: string[];
  voided: boolean;
  voidReason: string | null;
}

/** Bisherige Inventuren (eine Zählung = ein Eintrag), neueste zuerst. Optional nur für einen Ort. */
export async function listInventories(locationId?: string, take = 40): Promise<InventoryRun[]> {
  const moves = await prisma.movement.findMany({
    where: { source: "inventory", batchId: { not: null }, ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: take * 30,
    include: { article: true, createdBy: true, fromLocation: true, toLocation: true },
  });
  const runs = new Map<string, InventoryRun>();
  for (const m of moves) {
    const loc = m.fromLocation ?? m.toLocation;
    const delta = (m.toLocationId ? 1 : -1) * m.quantity;
    const line = `${m.article.name}${m.article.returnable && (m.toState ?? m.fromState) ? ` (${STATE_LABEL[(m.toState ?? m.fromState)!]})` : ""}: ${delta > 0 ? "+" : ""}${delta}`;
    const r = runs.get(m.batchId!) ?? { batchId: m.batchId!, at: m.createdAt, by: m.createdBy.displayName, locationId: loc?.id ?? null, locationName: loc?.name ?? "?", lines: [], voided: true, voidReason: null };
    r.lines.push(line);
    if (!m.voidedAt) r.voided = false; else r.voidReason ??= m.voidReason?.replace(/^Inventur zurückgenommen:\s*/, "") ?? null;
    runs.set(m.batchId!, r);
  }
  return [...runs.values()].slice(0, take);
}

/** Nimmt eine ganze Inventur zurück: alle ihre Korrekturen werden storniert (alles oder nichts). Der Bestand ist danach wieder wie vor der Zählung. */
export async function voidInventory(user: User, batchId: string, reason: string): Promise<{ ok: true; voided: number; warnings: string[] } | { ok: false; error: string }> {
  const why = reason.trim().replace(/\s+/g, " ");
  if (why.length < 3) return { ok: false, error: "Bitte einen kurzen Grund angeben (z. B. „falsch gezählt“)." };
  return prisma.$transaction(async (tx) => {
    const moves = await tx.movement.findMany({ where: { batchId, source: "inventory", voidedAt: null }, include: { article: true } });
    if (!moves.length) return { ok: false as const, error: "Diese Inventur ist schon zurückgenommen oder existiert nicht." };
    const articleIds = [...new Set(moves.map((m) => m.articleId))].sort();
    for (const id of articleIds) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    await tx.movement.updateMany({ where: { id: { in: moves.map((m) => m.id) } }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: `Inventur zurückgenommen: ${why}` } });
    await audit("inventory.void", { userId: user.id, entity: "inventory", entityId: batchId, detail: { movements: moves.length, reason: why } }, tx);
    const warnings: string[] = [];
    for (const id of articleIds) {
      const neg = (await stockRows(tx, { articleId: id })).filter((r) => r.quantity < 0);
      if (neg.length) warnings.push(`Achtung: ${moves.find((m) => m.articleId === id)!.article.name} hat jetzt einen Minusbestand – spätere Buchungen passen nicht mehr dazu.`);
    }
    return { ok: true as const, voided: moves.length, warnings };
  });
}
