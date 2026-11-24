import { Pencil, Plus, Snowflake, Truck } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/db/prisma";
import { ArticleForm, LocationForm, RemoveButtons, SupplierForm } from "@/components/catalog-forms";
import { Empty } from "@/components/stock-ui";
import { buildTree, flatten, isCooled, pathName } from "@/lib/domain/tree";
import { fmtEuro } from "@/lib/format";
import { requireWriter } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Stammdaten" };

const TABS = [{ id: "orte", label: "Lagerorte" }, { id: "artikel", label: "Artikel" }, { id: "lieferanten", label: "Lieferanten" }] as const;
const KIND_LABEL = { SITE: "Gebäude / Gelände", ROOM: "Raum", COLD: "Kühlraum", TRAILER: "Kühlanhänger" } as const;

export default async function StammdatenPage({ searchParams }: PageProps<"/stammdaten">) {
  await requireWriter();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "orte";

  return (
    <div className="page space-y-5">
      <div><h1 className="h1">Stammdaten</h1><p className="text-sm text-muted-foreground">Lagerorte, Artikel und Lieferanten pflegen. Was schon verwendet wurde, wird archiviert statt gelöscht – die Historie bleibt.</p></div>
      <nav className="flex gap-2" aria-label="Bereich">
        {TABS.map((t) => <Link key={t.id} href={`/stammdaten?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={cn("btn flex-1 sm:flex-none", tab === t.id ? "border-transparent bg-navy text-white dark:bg-primary dark:text-primary-foreground" : "bg-card text-heading")}>{t.label}</Link>)}
      </nav>
      {tab === "orte" && <Orte />}
      {tab === "artikel" && <Artikel />}
      {tab === "lieferanten" && <Lieferanten />}
    </div>
  );
}

async function Orte() {
  const locations = await prisma.location.findMany();
  const active = locations.filter((l) => !l.archivedAt);
  const archived = locations.filter((l) => l.archivedAt);
  const tree = flatten(buildTree(active));
  const options = tree.map((n) => ({ id: n.loc.id, label: pathName(locations, n.loc.id) }));
  return (
    <div className="space-y-4">
      <details className="card p-4"><summary className="flex items-center gap-2 font-medium text-heading"><Plus className="size-5" />Neuer Lagerort</summary><div className="mt-4"><LocationForm options={options} /></div></details>
      {tree.length === 0 ? <Empty title="Noch keine Lagerorte" /> : (
        <ul className="space-y-2">
          {tree.map((n) => (
            <li key={n.loc.id} style={{ marginLeft: `${Math.min(n.depth, 4) * 1.25}rem` }} className="card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  {n.loc.kind === "TRAILER" ? <Truck className="size-4 text-muted-foreground" /> : isCooled(locations, n.loc.id) ? <Snowflake className="size-4 text-sky-600 dark:text-sky-300" /> : null}
                  <Link href={`/orte/${n.loc.id}`} className="font-medium text-heading hover:underline">{n.loc.name}</Link>
                  {n.loc.code && n.loc.code !== n.loc.name && <span className="chip-muted">{n.loc.code}</span>}
                  <span className="text-xs text-muted-foreground">{KIND_LABEL[n.loc.kind]}</span>
                </span>
              </div>
              <details className="mt-2"><summary className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"><Pencil className="size-3.5" />Bearbeiten</summary>
                <div className="mt-3 space-y-3"><LocationForm values={{ id: n.loc.id, name: n.loc.name, code: n.loc.code, parentId: n.loc.parentId, kind: n.loc.kind, cooled: n.loc.cooled, note: n.loc.note, sortOrder: n.loc.sortOrder }} options={options} /><RemoveButtons kind="location" id={n.loc.id} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="card p-4"><summary className="font-medium text-heading">Archiviert ({archived.length})</summary>
          <ul className="mt-3 space-y-2">{archived.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2"><span>{pathName(locations, l.id)}</span><RemoveButtons kind="location" id={l.id} archived /></li>)}</ul></details>
      )}
    </div>
  );
}

async function Artikel() {
  const articles = await prisma.article.findMany({ orderBy: { name: "asc" } });
  const active = articles.filter((a) => !a.archivedAt);
  const archived = articles.filter((a) => a.archivedAt);
  const categories = [...new Set(articles.map((a) => a.category))];
  return (
    <div className="space-y-4">
      <details className="card p-4"><summary className="flex items-center gap-2 font-medium text-heading"><Plus className="size-5" />Neuer Artikel</summary><div className="mt-4"><ArticleForm categories={categories} /></div></details>
      {active.length === 0 ? <Empty title="Noch keine Artikel">Artikel entstehen auch direkt beim Buchen („＋ Neuer Artikel“).</Empty> : (
        <ul className="space-y-2">
          {active.map((a) => (
            <li key={a.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/artikel/${a.id}`} className="font-medium text-heading hover:underline">{a.name}</Link>
                <span className="chip-muted">{a.category}</span><span className="text-xs text-muted-foreground">je {a.unit}</span>
                {a.returnable && <span className="chip-muted">Pfand {fmtEuro(a.depositCents)}</span>}
                {a.needsCooling && <span className="chip border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"><Snowflake className="size-3" />kühlen</span>}
              </div>
              <details className="mt-2"><summary className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"><Pencil className="size-3.5" />Bearbeiten</summary>
                <div className="mt-3 space-y-3"><ArticleForm categories={categories} values={{ id: a.id, name: a.name, aliases: a.aliases, category: a.category, unit: a.unit, returnable: a.returnable, depositCents: a.depositCents, needsCooling: a.needsCooling, note: a.note }} /><RemoveButtons kind="article" id={a.id} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="card p-4"><summary className="font-medium text-heading">Archiviert ({archived.length})</summary>
          <ul className="mt-3 space-y-2">{archived.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2"><span>{a.name}</span><RemoveButtons kind="article" id={a.id} archived /></li>)}</ul></details>
      )}
    </div>
  );
}

async function Lieferanten() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const active = suppliers.filter((s) => !s.archivedAt);
  return (
    <div className="space-y-4">
      <details className="card p-4"><summary className="flex items-center gap-2 font-medium text-heading"><Plus className="size-5" />Neuer Lieferant</summary><div className="mt-4"><SupplierForm /></div></details>
      {active.length === 0 ? <Empty title="Noch keine Lieferanten">Lieferanten entstehen auch automatisch beim Erfassen eines Eingangs.</Empty> : (
        <ul className="space-y-2">
          {active.map((s) => (
            <li key={s.id} className="card p-3">
              <p className="font-medium text-heading">{s.name}{s.note && <span className="ml-2 text-sm font-normal text-muted-foreground">{s.note}</span>}</p>
              <details className="mt-2"><summary className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"><Pencil className="size-3.5" />Bearbeiten</summary>
                <div className="mt-3 space-y-3"><SupplierForm values={{ id: s.id, name: s.name, note: s.note }} /><RemoveButtons kind="supplier" id={s.id} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
