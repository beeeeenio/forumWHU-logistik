import { AlertTriangle, CircleAlert, Clock, Download, Search, Snowflake } from "lucide-react";
import Link from "next/link";
import { LageTree } from "@/components/lage-tree";
import { Empty } from "@/components/stock-ui";
import { SeedButton } from "@/components/seed-button";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getLage, type Alert, type LageNode } from "@/services/reports";

export const metadata = { title: "Lage" };

function filterTree(nodes: LageNode[], q: string): LageNode[] {
  const needle = q.toLowerCase();
  const walk = (n: LageNode): LageNode => {
    const items = n.items.filter((i) => [i.article.name, ...i.article.aliases, i.article.category].some((s) => s.toLowerCase().includes(needle)));
    const children = n.children.map(walk);
    return { ...n, items, children, positions: items.length + children.reduce((s, c) => s + c.positions, 0) };
  };
  return nodes.map(walk);
}

const ALERT_ICON = { error: CircleAlert, warn: Snowflake, info: Clock } as const;

function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <section aria-label="Hinweise" className="space-y-2">
      {alerts.map((a, i) => {
        const Icon = a.kind === "COOLING" ? Snowflake : ALERT_ICON[a.level] ?? AlertTriangle;
        const tone = a.level === "error" ? "border-danger/40 bg-danger/10 text-danger" : a.level === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-border bg-card text-foreground";
        const body = <><Icon className="mt-0.5 size-4 shrink-0" /><span className="text-sm">{a.text}</span></>;
        return a.href
          ? <Link key={i} href={a.href} className={cn("flex items-start gap-2 rounded-xl border p-3", tone)}>{body}</Link>
          : <div key={i} className={cn("flex items-start gap-2 rounded-xl border p-3", tone)}>{body}</div>;
      })}
    </section>
  );
}

export default async function LagePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const lage = await getLage();
  const nodes = q ? filterTree(lage.tree, q) : lage.tree;
  const shown = nodes.reduce((s, n) => s + n.positions, 0);
  const writer = canWrite(user.role);
  const noLocations = lage.locations.length === 0;

  return (
    <div className="page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Lage</h1>
          <p className="text-sm text-muted-foreground">Stand {fmtDateTime(new Date())} · {lage.totals.positions} Positionen · {lage.totals.articles} Artikel · {lage.totals.locationsUsed} Orte belegt</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/bestand" className="btn-secondary btn-sm"><Download className="size-4" />Excel</a>
        </div>
      </div>

      <AlertList alerts={lage.alerts} />

      <form role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Artikel suchen – wo liegt das gerade?" className="field pl-9" aria-label="Artikel suchen" />
      </form>

      {noLocations ? (
        <Empty title="Noch keine Lagerorte">
          {writer ? <><p className="mb-3">Starte mit den Orten aus eurer Planung (Gewölbekeller, Stadthalle mit Kühllagern, Kühlanhänger, L, Z, G). Namen und Codes kannst du danach in den Stammdaten anpassen.</p><SeedButton /></> : "Ein Mitglied muss zuerst die Lagerorte anlegen."}
        </Empty>
      ) : shown === 0 ? (
        <Empty title={q ? `Nichts gefunden für „${q}“` : "Noch nichts eingelagert"}>
          {q ? <Link href="/" className="underline">Suche zurücksetzen</Link> : writer ? <>Erfasse die erste Lieferung unter <Link href="/buchen" className="underline">Buchen</Link>.</> : null}
        </Empty>
      ) : (
        <LageTree nodes={nodes} locations={lage.locations} />
      )}
    </div>
  );
}
