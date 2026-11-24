import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { bestandCsv } from "@/services/reports";

export const dynamic = "force-dynamic";

/** Aktueller Bestand je Ort und Artikel als CSV (Excel). */
export async function GET() {
  if (!(await getSessionUser())) return new NextResponse("Nicht angemeldet", { status: 401 });
  return new NextResponse(await bestandCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="logistik-bestand-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
