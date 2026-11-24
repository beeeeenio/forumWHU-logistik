import { ArrowRight, Plus, Snowflake } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db/prisma";
import { MovementRow } from "@/components/movement-row";
import { ArticleLink, Empty, Qty } from "@/components/stock-ui";
import { StockActions } from "@/components/stock-actions";
import { descendantIds, isCooled, pathName } from "@/lib/domain/tree";
import { buchenHref } from "@/lib/links";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { fmtRelativeDay } from "@/lib/time";
import { fmtQty } from "@/lib/format";
import { JOURNAL_INCLUDE, getLocationStock } from "@/services/reports";

export default async function OrtPage({ params }: PageProps<"/orte/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc) notFound();
  const { locations, lines } = await getLocationStock(id);
  const ids = descendantIds(locations, id);
  const [plans, moves] = await Promise.all([
    prisma.plan.findMany({ where: { status: "OPEN", OR: [{ toLocationId: { in: ids } }, { fromLocationId: { in: ids } }] }, orderBy: { dueAt: "asc" }, include: { article: true, fromLocation: true, toLocation: true } }),
    prisma.movement.findMany({ where: { OR: [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }] }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 10, include: JOURNAL_INCLUDE }),
  ]);
  const writer = canWrite(user.role);
  const cold = isCooled(locations, id);
  const children = locations.filter((l) => l.parentId === id && !l.archivedAt);
  const grouped = new Map<string, typeof lines>();
  for (const l of lines) (grouped.get(l.locationId) ?? grouped.set(l.locationId, []).get(l.locationId)!).push(l);
  const order = ids.filter((i) => grouped.has(i));

  return (
    <div className="page space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{pathName(locations, id).split(" › ").slice(0, -1).join(" › ") || "Lagerort"}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="h1">{loc.name}</h1>
          {loc.code && loc.code !== loc.name && <span className="chip-muted">{loc.code}</span>}
          {cold && <span className="chip border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"><Snowflake className="size-3.5" />gekühlt</span>}
          {loc.archivedAt && <span className="chip-warn">archiviert</span>}
        </div>
        {loc.note && <p className="mt-1 text-sm text-muted-foreground">{loc.note}</p>}
        {writer && <div className="mt-3 flex flex-wrap gap-2"><Link href={buchenHref({ kind: "RECEIPT", to: id })} className="btn-primary btn-sm"><Plus className="size-4" />Eingang hier</Link><Link href={buchenHref({ kind: "TRANSFER", to: id })} className="btn-secondary btn-sm">Hierher umlagern</Link></div>}
      </div>

      {children.length > 0 && (
        <div className="flex flex-wrap gap-2">{children.map((c) => <Link key={c.id} href={`/orte/${c.id}`} className="chip-muted hover:bg-card">{c.name} →</Link>)}</div>
      )}

      <section className="space-y-3">
        <h2 className="text-xl">Was liegt hier</h2>
        {order.length === 0 ? <Empty title="Hier liegt gerade nichts" /> : order.map((lid) => (
          <div key={lid} className="card p-4">
            {lid !== id && <p className="mb-1 text-sm font-medium text-muted-foreground">{pathName(locations, lid)}</p>}
            <ul className="divide-y">
              {Object.values(Object.groupBy(grouped.get(lid)!, (l) => l.article.id)).map((rows) => {
                const a = rows![0].article;
                const full = rows!.find((r) => r.state === "FULL")?.quantity ?? 0;
                const empty = rows!.find((r) => r.state === "EMPTY")?.quantity ?? 0;
                return (
                  <li key={a.id} className="space-y-2 py-3">
                    <div className="flex items-center justify-between gap-3"><ArticleLink article={a} cold={isCooled(locations, lid)} /><Qty article={a} full={full} empty={empty} /></div>
                    {writer && (
                      <div className="space-y-1.5">
                        {full !== 0 && <StockActions articleId={a.id} locationId={lid} state="FULL" quantity={full} returnable={a.returnable} />}
                        {empty !== 0 && <StockActions articleId={a.id} locationId={lid} state="EMPTY" quantity={empty} returnable={a.returnable} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl">Geplant</h2>
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="flex flex-wrap items-center gap-1.5"><strong className="text-heading">{fmtQty(p.quantity, p.article.unit)} {p.article.name}</strong>{p.fromLocation && <>{p.fromLocation.name}<ArrowRight className="size-3.5" /></>}{p.toLocation.name}{p.phase && <span className="chip-muted">{p.phase}</span>}</span>
                <span className={p.dueAt < new Date() ? "text-danger" : "text-muted-foreground"}>{fmtRelativeDay(p.dueAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-xl">Zuletzt hier gebucht</h2><Link href={`/journal?location=${id}`} className="text-sm underline">Alle</Link></div>
        {moves.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p> : <ul className="space-y-3">{moves.map((m) => <MovementRow key={m.id} m={m} locations={locations} canWrite={writer} copyHref={buchenHref({ copy: m.id })} />)}</ul>}
      </section>
    </div>
  );
}
