import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/db/prisma";
import type { Article } from "@/generated/prisma/client";
import { fromBerlinInput } from "@/lib/time";

export interface ConsumptionRow { article: Article; perDay: Record<string, number>; total: number; received: number; returned: number }
export interface Consumption {
  days: string[];
  rows: ConsumptionRow[];
  /** Verbrauch je Einheit über alle Artikel („112 Kisten“, „24 Karton“) – verschiedene Einheiten werden nie addiert */
  byUnit: { unit: string; total: number }[];
  peak: { day: string; unit: string; total: number } | null;
}

const addDay = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const berlinToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/** Tage von `from` bis `to` (inklusive, Berliner Kalendertage). */
export function dayRange(from: string, to: string, max = 62): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < max; d = addDay(d, 1)) out.push(d);
  return out;
}
export { addDay };

/** Verbrauch je Kalendertag (Berliner Zeit) und Artikel. „Verbrauch“ = Verbraucht (+ optional Abgang); stornierte Buchungen zählen nicht. */
export async function getConsumption(fromYmd: string, toYmd: string, includeWriteOff: boolean): Promise<Consumption> {
  const days = dayRange(fromYmd, toYmd);
  if (!days.length) return { days, rows: [], byUnit: [], peak: null };
  const start = fromBerlinInput(`${days[0]}T00:00`)!;
  const end = fromBerlinInput(`${addDay(days[days.length - 1], 1)}T00:00`) ?? new Date(start.getTime() + days.length * 86_400_000);
  const kinds = includeWriteOff ? ["CONSUME", "WRITE_OFF"] : ["CONSUME"];
  const data = await prisma.$queryRaw<{ day: string; article_id: string; kind: string; qty: number }[]>(Prisma.sql`
    select to_char((occurred_at at time zone 'UTC') at time zone 'Europe/Berlin', 'YYYY-MM-DD') as day, article_id, kind::text as kind, sum(quantity)::int as qty
    from movements
    where voided_at is null and occurred_at >= ${start} and occurred_at < ${end} and kind::text in ('CONSUME','WRITE_OFF','RECEIPT','RETURN')
    group by 1, 2, 3`);
  const articles = await prisma.article.findMany({ where: { id: { in: [...new Set(data.map((d) => d.article_id))] } } });
  const byId = new Map(articles.map((a) => [a.id, a]));
  const rows = new Map<string, ConsumptionRow>();
  for (const d of data) {
    const a = byId.get(d.article_id);
    if (!a) continue;
    const r = rows.get(a.id) ?? rows.set(a.id, { article: a, perDay: {}, total: 0, received: 0, returned: 0 }).get(a.id)!;
    if (kinds.includes(d.kind)) { r.perDay[d.day] = (r.perDay[d.day] ?? 0) + d.qty; r.total += d.qty; }
    else if (d.kind === "RECEIPT") r.received += d.qty;
    else if (d.kind === "RETURN") r.returned += d.qty;
  }
  const list = [...rows.values()].filter((r) => r.total > 0 || r.received > 0).sort((a, b) => b.total - a.total || a.article.name.localeCompare(b.article.name, "de"));
  const unitTotals = new Map<string, number>();
  const dayUnit = new Map<string, number>();
  for (const r of list) {
    unitTotals.set(r.article.unit, (unitTotals.get(r.article.unit) ?? 0) + r.total);
    for (const [day, q] of Object.entries(r.perDay)) dayUnit.set(`${day}|${r.article.unit}`, (dayUnit.get(`${day}|${r.article.unit}`) ?? 0) + q);
  }
  let peak: Consumption["peak"] = null;
  for (const [k, total] of dayUnit) { const [day, unit] = k.split("|"); if (!peak || total > peak.total) peak = { day, unit, total }; }
  return { days, rows: list, byUnit: [...unitTotals].map(([unit, total]) => ({ unit, total })).sort((a, b) => b.total - a.total), peak };
}
