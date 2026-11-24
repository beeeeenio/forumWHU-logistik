import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import type { StockState } from "@/lib/domain/rules";
import { MAX_QUANTITY } from "@/lib/domain/rules";
import { fmtDate } from "@/lib/time";
import { bookMovements, type BookInput } from "./movements";
import { stockRows } from "./stock";

export interface CountRow { articleId: string; state: StockState; counted: number }
export type InventoryResult =
  | { ok: true; changed: number; same: number; lines: string[] }
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
    inputs.push({ kind: "ADJUST", articleId: r.articleId, quantity: r.counted, fromLocationId: locationId, state: r.state, note: why, source: "ui" });
    const diff = r.counted - current;
    lines.push(`${a.name}${a.returnable ? (r.state === "FULL" ? " (voll)" : " (leer)") : ""}: ${current} → ${r.counted} (${diff > 0 ? "+" : ""}${diff})`);
  }
  if (!inputs.length) return { ok: true, changed: 0, same, lines: [] };
  const res = await bookMovements(user, inputs);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, changed: inputs.length, same, lines };
}
