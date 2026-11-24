import "server-only";
import { prisma } from "@/db/prisma";
import type { Db } from "@/db/prisma";
import { foldStock, stockKey, type Delta, type StockState } from "@/lib/domain/rules";

/**
 * Bestand je (Artikel, Ort, Zustand) – berechnet aus den nicht stornierten Bewegungen (Zugänge − Abgänge).
 * Es gibt keine gespeicherten Bestandszahlen, die auseinanderlaufen könnten.
 */
export async function stockRows(db: Db = prisma, filter: { articleId?: string; locationId?: string } = {}): Promise<Delta[]> {
  const art = filter.articleId ? { articleId: filter.articleId } : {};
  const [ins, outs] = await Promise.all([
    db.movement.groupBy({
      by: ["articleId", "toLocationId", "toState"],
      where: { voidedAt: null, toLocationId: filter.locationId ?? { not: null }, ...art },
      _sum: { quantity: true },
    }),
    db.movement.groupBy({
      by: ["articleId", "fromLocationId", "fromState"],
      where: { voidedAt: null, fromLocationId: filter.locationId ?? { not: null }, ...art },
      _sum: { quantity: true },
    }),
  ]);
  const deltas: Delta[] = [];
  for (const r of ins) if (r.toLocationId && r.toState) deltas.push({ articleId: r.articleId, locationId: r.toLocationId, state: r.toState, quantity: r._sum.quantity ?? 0 });
  for (const r of outs) if (r.fromLocationId && r.fromState) deltas.push({ articleId: r.articleId, locationId: r.fromLocationId, state: r.fromState, quantity: -(r._sum.quantity ?? 0) });
  return [...foldStock(deltas).values()];
}

/** Bestand an genau einem Platz (innerhalb einer Transaktion, damit Buchungen sich nicht überholen). */
export async function stockAt(db: Db, articleId: string, locationId: string, state: StockState): Promise<number> {
  const rows = await stockRows(db, { articleId, locationId });
  return rows.find((r) => r.state === state)?.quantity ?? 0;
}

export { stockKey };
