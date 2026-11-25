import { ArrowRight, Snowflake } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db/prisma";
import { MovementRow } from "@/components/movement-row";
import { Empty } from "@/components/stock-ui";
import { StockActions } from "@/components/stock-actions";
import { isCooled, pathName } from "@/lib/domain/tree";
import { fmtEuro, fmtQty } from "@/lib/format";
import { buchenHref } from "@/lib/links";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { fmtRelativeDay } from "@/lib/time";
import { getArticleOverview } from "@/services/reports";

export async function generateMetadata({ params }: PageProps<"/artikel/[id]">) {
  const { id } = await params;
  const a = /^[0-9a-f-]{36}$/.test(id) ? await prisma.article.findUnique({ where: { id }, select: { name: true } }) : null;
  return { title: a?.name ?? "Artikel" };
}

export default async function ArtikelPage({ params }: PageProps<"/artikel/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { article, rows, locations, moves, plans } = await getArticleOverview(id);
  if (!article) notFound();
  const writer = canWrite(user.role);
  const full = rows.filter((r) => r.state === "FULL").reduce((s, r) => s + r.quantity, 0);
  const empty = rows.filter((r) => r.state === "EMPTY").reduce((s, r) => s + r.quantity, 0);
  const sorted = [...rows].sort((a, b) => pathName(locations, a.locationId).localeCompare(pathName(locations, b.locationId), "de") || a.state.localeCompare(b.state));

  return (
    <div className="page space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{article.category}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="h1">{article.name}</h1>
          {article.needsCooling && <span className="chip border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"><Snowflake className="size-3.5" />kühlpflichtig</span>}
          {article.minStock !== null && <span className={full < article.minStock ? "chip-warn" : "chip-muted"}>Mindestbestand {article.minStock}</span>}
          {article.returnable && <span className="chip-muted">Pfand {fmtEuro(article.depositCents)} / {article.unit}</span>}
          {article.archivedAt && <span className="chip-warn">archiviert</span>}
        </div>
        {article.note && <p className="mt-1 text-sm text-muted-foreground">{article.note}</p>}
        {writer && !article.archivedAt && <div className="mt-3 flex flex-wrap gap-2"><Link href={buchenHref({ kind: "RECEIPT", article: id })} className="btn-primary btn-sm">Eingang</Link><Link href={buchenHref({ kind: "TRANSFER", article: id })} className="btn-secondary btn-sm">Umlagern</Link></div>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="card p-4"><p className="label">{article.returnable ? "Voll" : "Vorrätig"}</p><p className="text-2xl font-semibold text-heading tabular-nums">{fmtQty(full, article.unit)}</p></div>
        {article.returnable && <div className="card p-4"><p className="label">Leergut</p><p className="text-2xl font-semibold text-heading tabular-nums">{fmtQty(empty, article.unit)}</p><p className="text-xs text-muted-foreground">Pfandwert {fmtEuro(empty * article.depositCents)}</p></div>}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Wo liegt es</h2>
        {sorted.length === 0 ? <Empty title="Gerade nirgends gebucht" /> : (
          <ul className="space-y-3">
            {sorted.map((r) => (
              <li key={`${r.locationId}${r.state}`} className="card space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/orte/${r.locationId}`} className="flex min-h-11 items-center gap-1.5 font-medium text-heading hover:underline">{pathName(locations, r.locationId)}{!isCooled(locations, r.locationId) && article.needsCooling && <span className="chip-warn">ungekühlt</span>}</Link>
                  <span className={r.quantity < 0 ? "font-semibold text-danger" : "font-semibold text-heading"}>{fmtQty(r.quantity, article.unit)} {article.returnable ? (r.state === "FULL" ? "voll" : "leer") : ""}</span>
                </div>
                {writer && <StockActions articleId={id} locationId={r.locationId} state={r.state} quantity={r.quantity} returnable={article.returnable} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl">Geplant</h2>
          <ul className="space-y-2">{plans.map((p) => (
            <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="flex flex-wrap items-center gap-1.5"><strong className="text-heading">{fmtQty(p.quantity, article.unit)}</strong>{p.fromLocation && <>{p.fromLocation.name}<ArrowRight className="size-3.5" /></>}{p.toLocation.name}{p.phase && <span className="chip-muted">{p.phase}</span>}</span>
              <span className={p.dueAt < new Date() ? "text-danger" : "text-muted-foreground"}>{fmtRelativeDay(p.dueAt)}</span>
            </li>))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-xl">Verlauf</h2><Link href={`/journal?article=${id}`} className="inline-flex min-h-11 items-center px-2 text-sm underline">Alle</Link></div>
        {moves.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p> : <ul className="space-y-3">{moves.map((m) => <MovementRow key={m.id} m={m} locations={locations} canWrite={writer} copyHref={buchenHref({ copy: m.id })} />)}</ul>}
      </section>
    </div>
  );
}
