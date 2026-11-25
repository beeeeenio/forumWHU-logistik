import { Download } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/db/prisma";
import { MovementRow } from "@/components/movement-row";
import { Empty } from "@/components/stock-ui";
import { KIND_LABEL, MOVEMENT_KINDS } from "@/lib/domain/rules";
import { buildTree, flatten, pathName } from "@/lib/domain/tree";
import { parseJournalFilter } from "@/lib/journal-filter";
import { buchenHref } from "@/lib/links";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getJournal } from "@/services/reports";

export const metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseJournalFilter(sp);
  const [{ rows, total, page, pages, locations }, articles, users] = await Promise.all([
    getJournal(f),
    prisma.article.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { displayName: "asc" } }),
  ]);
  const ordered = flatten(buildTree(locations)).map((n) => n.loc);
  const writer = canWrite(user.role);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") qs.set(k, v);
  const link = (p: number) => `/journal?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) }).toString()}`;
  const hasFilter = qs.size > 0;

  return (
    <div className="page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Journal</h1><p className="text-sm text-muted-foreground">Jede Bewegung, nachvollziehbar. {total.toLocaleString("de-DE")} Einträge{hasFilter ? " (gefiltert)" : ""}.</p></div>
        <a href={`/api/export/journal?${qs.toString()}`} className="btn-secondary btn-sm"><Download className="size-4" />Excel (CSV)</a>
      </div>

      <details className="card px-4 py-1" open={false}>
        <summary className="font-medium text-heading">Filtern{hasFilter ? ` · ${[f.articleId, f.locationId, f.kind, f.userId, f.fromStr, f.toStr, f.includeVoided ? "x" : ""].filter(Boolean).length} aktiv` : ""}</summary>
      <form className="grid gap-3 pt-2 pb-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Journal filtern">
        <label><span className="label">Artikel</span><select name="article" defaultValue={f.articleId ?? ""} className="field"><option value="">alle</option>{articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label><span className="label">Ort</span><select name="location" defaultValue={f.locationId ?? ""} className="field"><option value="">alle</option>{ordered.map((l) => <option key={l.id} value={l.id}>{pathName(locations, l.id)}</option>)}</select></label>
        <label><span className="label">Art</span><select name="kind" defaultValue={f.kind ?? ""} className="field"><option value="">alle</option>{MOVEMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label><span className="label">Erfasst von</span><select name="user" defaultValue={f.userId ?? ""} className="field"><option value="">alle</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select></label>
        <label><span className="label">Von (Datum)</span><input type="date" name="from" defaultValue={f.fromStr} className="field" /></label>
        <label><span className="label">Bis (Datum)</span><input type="date" name="to" defaultValue={f.toStr} className="field" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:pt-6"><input type="checkbox" name="voided" value="1" defaultChecked={f.includeVoided} className="size-6" />Stornierte zeigen</label>
        <div className="flex items-end gap-2"><button className="btn-primary flex-1">Filtern</button>{hasFilter && <Link href="/journal" className="btn-secondary">Zurücksetzen</Link>}</div>
      </form>
      </details>

      {rows.length === 0 ? <Empty title="Keine Buchungen gefunden" /> : (
        <ul className="space-y-3">{rows.map((m) => <MovementRow key={m.id} m={m} locations={locations} canWrite={writer} copyHref={m.kind !== "ADJUST" ? buchenHref({ copy: m.id }) : undefined} />)}</ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Seiten">
          {page > 1 ? <Link href={link(page - 1)} className="btn-secondary">← Neuere</Link> : <span />}
          <span className="text-sm text-muted-foreground">Seite {page} von {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="btn-secondary">Ältere →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
