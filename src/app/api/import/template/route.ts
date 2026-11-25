import { NextResponse, type NextRequest } from "next/server";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import/fields";
import { getSessionUser } from "@/lib/session";
import { toCsv } from "@/services/reports-csv";

export const dynamic = "force-dynamic";

/** Vorlage (CSV mit Beispielzeilen) für eine Importart. Die Spaltennamen werden beim Import automatisch erkannt. */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return new NextResponse("Nicht angemeldet", { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") as ImportKind;
  if (!(kind in IMPORT_KINDS)) return new NextResponse("Unbekannte Art", { status: 400 });
  return new NextResponse(toCsv(IMPORT_KINDS[kind].example), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vorlage-${kind}.csv"`, "Cache-Control": "no-store" } });
}
