import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { addDay, berlinToday, getConsumption } from "@/services/consumption";
import { toCsv } from "@/services/reports-csv";

export const dynamic = "force-dynamic";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Verbrauch je Tag und Artikel als CSV (Excel). */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return new NextResponse("Nicht angemeldet", { status: 401 });
  const p = req.nextUrl.searchParams;
  const to = YMD.test(p.get("to") ?? "") ? p.get("to")! : berlinToday();
  let from = YMD.test(p.get("from") ?? "") ? p.get("from")! : addDay(to, -6);
  if (from > to) from = to;
  const c = await getConsumption(from, to, p.get("abgang") === "1");
  const csv = toCsv([["Artikel", "Einheit", ...c.days, "Summe", "Eingang im Zeitraum"], ...c.rows.map((r) => [r.article.name, r.article.unit, ...c.days.map((d) => r.perDay[d] ?? 0), r.total, r.received])]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="logistik-verbrauch-${from}_${to}.csv"`, "Cache-Control": "no-store" } });
}
