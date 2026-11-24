import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { parseJournalFilter } from "@/lib/journal-filter";
import { pathName } from "@/lib/domain/tree";
import { KIND_LABEL, STATE_LABEL } from "@/lib/domain/rules";
import { getSessionUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";
import { JOURNAL_INCLUDE, journalWhere } from "@/services/reports";
import { toCsv } from "@/services/reports-csv";

export const dynamic = "force-dynamic";

/** Journal als CSV (Excel). Gleiche Filter wie die Seite; nur für angemeldete Personen. */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return new NextResponse("Nicht angemeldet", { status: 401 });
  const f = parseJournalFilter(Object.fromEntries(req.nextUrl.searchParams));
  const locations = await prisma.location.findMany();
  const rows = await prisma.movement.findMany({ where: journalWhere(f, locations), orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 20000, include: JOURNAL_INCLUDE });
  const place = (id: string | null) => (id ? pathName(locations, id) : "");
  const csv = toCsv([
    ["Zeitpunkt", "Art", "Artikel", "Menge", "Einheit", "Von", "Zustand von", "Nach", "Zustand nach", "Lieferant", "Notiz", "Erfasst von", "Quelle", "Storniert", "Storno-Grund"],
    ...rows.map((m) => [fmtDateTime(m.occurredAt), KIND_LABEL[m.kind], m.article.name, m.quantity, m.article.unit, place(m.fromLocationId), m.fromState ? STATE_LABEL[m.fromState] : "", place(m.toLocationId), m.toState ? STATE_LABEL[m.toState] : "", m.supplier?.name ?? "", m.note ?? "", m.createdBy.displayName, m.source, m.voidedAt ? fmtDateTime(m.voidedAt) : "", m.voidReason ?? ""]),
  ]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="logistik-journal-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
