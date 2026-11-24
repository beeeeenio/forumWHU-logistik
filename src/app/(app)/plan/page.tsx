import { ArrowRight } from "lucide-react";
import { prisma } from "@/db/prisma";
import { Empty } from "@/components/stock-ui";
import { PlanActions } from "@/components/plan-actions";
import { PlanForm } from "@/components/plan-form";
import { pathName } from "@/lib/domain/tree";
import { fmtQty } from "@/lib/format";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { fmtDate, fmtDateTime, fmtTime, toBerlinInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { loadCatalog } from "@/services/catalog-options";
import { stockRows } from "@/services/stock";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const now = new Date();
  const [plans, done, locations, catalog, rows] = await Promise.all([
    prisma.plan.findMany({ where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, include: { article: true, fromLocation: true, toLocation: true } }),
    prisma.plan.findMany({ where: { status: "DONE" }, orderBy: { updatedAt: "desc" }, take: 10, include: { article: true, fromLocation: true, toLocation: true } }),
    prisma.location.findMany(),
    writer ? loadCatalog(false) : Promise.resolve(null),
    stockRows(prisma),
  ]);
  const phases = [...new Set((await prisma.plan.findMany({ where: { phase: { not: null } }, select: { phase: true }, orderBy: { createdAt: "desc" }, take: 50 })).map((p) => p.phase!))];
  const tomorrow8 = toBerlinInput(new Date(now.getTime() + 24 * 3600_000)).slice(0, 11) + "08:00";

  const groups = new Map<string, typeof plans>();
  for (const p of plans) {
    const key = p.dueAt < now ? "Überfällig" : fmtDate(p.dueAt);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }

  return (
    <div className="page space-y-5">
      <div><h1 className="h1">Plan</h1><p className="text-sm text-muted-foreground">Was soll wann wohin? Mit einem Tipp erledigt – das bucht die Umlagerung gleich mit.</p></div>
      {catalog && <PlanForm catalog={catalog} phases={phases} defaultDue={tomorrow8} />}

      {plans.length === 0 ? <Empty title="Nichts geplant">Lege Pläne an, z. B. „23 Kisten Wasser aus dem Gewölbekeller ins Kühllager 1 – Frühstück Freitag“.</Empty> : (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} className="space-y-3">
            <h2 className={cn("text-lg", day === "Überfällig" && "text-danger")}>{day}</h2>
            <ul className="space-y-3">
              {list.map((p) => {
                const have = p.fromLocationId ? (rows.find((r) => r.articleId === p.articleId && r.locationId === p.fromLocationId && r.state === p.state)?.quantity ?? 0) : null;
                const short = have !== null && have < p.quantity;
                return (
                  <li key={p.id} className={cn("card space-y-2 p-4", p.dueAt < now && "border-danger/50")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-heading">{fmtQty(p.quantity, p.article.unit)} {p.article.name}{p.state === "EMPTY" && <span className="ml-2 chip-muted">Leergut</span>}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">{p.fromLocation ? <span>{pathName(locations, p.fromLocation.id)}</span> : <span>Eingang</span>}<ArrowRight className="size-3.5" /><span>{pathName(locations, p.toLocation.id)}</span></p>
                      </div>
                      <div className="text-right text-sm"><p className={p.dueAt < now ? "font-medium text-danger" : "text-heading"}>{fmtTime(p.dueAt)} Uhr</p>{p.phase && <span className="chip-muted">{p.phase}</span>}</div>
                    </div>
                    {p.note && <p className="text-sm">{p.note}</p>}
                    {short && <p className="text-sm text-warn">Am Quellort sind gerade nur {have} gebucht – reicht noch nicht.</p>}
                    {writer && <PlanActions id={p.id} />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {done.length > 0 && (
        <details className="card p-4">
          <summary className="font-medium text-heading">Zuletzt erledigt ({done.length})</summary>
          <ul className="mt-3 divide-y text-sm">
            {done.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{fmtQty(p.quantity, p.article.unit)} {p.article.name} → {p.toLocation.name}{p.phase ? ` (${p.phase})` : ""}</span><span className="text-muted-foreground">{fmtDateTime(p.updatedAt)}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
