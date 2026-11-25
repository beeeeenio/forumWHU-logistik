import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db/prisma";
import { InventoryRuns } from "@/components/inventory-runs";
import { listInventories } from "@/services/inventory";
import { InventoryForm, type InvRow } from "@/components/inventory-form";
import { pathName } from "@/lib/domain/tree";
import { requireWriter } from "@/lib/session";
import { stockRows } from "@/services/stock";

export const metadata = { title: "Inventur" };

export default async function InventurOrtPage({ params }: PageProps<"/inventur/[id]">) {
  await requireWriter();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc || loc.archivedAt) notFound();
  const [locations, rows, articles] = await Promise.all([
    prisma.location.findMany(),
    stockRows(prisma, { locationId: id }),
    prisma.article.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const initial: InvRow[] = [];
  for (const a of articles) {
    const mine = rows.filter((r) => r.articleId === a.id && r.quantity !== 0);
    if (!mine.length) continue;
    // Pfandartikel immer mit voll UND leer zählen (Leergut wird gern vergessen)
    const states = a.returnable ? (["FULL", "EMPTY"] as const) : (["FULL"] as const);
    for (const s of states) initial.push({ articleId: a.id, name: a.name, unit: a.unit, returnable: a.returnable, state: s, current: mine.find((r) => r.state === s)?.quantity ?? 0 });
  }
  const runs = await listInventories(id, 5);
  const children = locations.filter((l) => l.parentId === id && !l.archivedAt);
  return (
    <div className="page max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Inventur</p>
        <h1 className="h1">{loc.name}</h1>
        <p className="text-sm text-muted-foreground">{pathName(locations, id)} · Trag ein, was du wirklich siehst. „stimmt“ übernimmt die gebuchte Zahl.</p>
        {children.length > 0 && <p className="mt-2 text-sm">Unterorte separat zählen: {children.map((c) => <Link key={c.id} href={`/inventur/${c.id}`} className="mr-2 underline">{c.name}</Link>)}</p>}
      </div>
      <InventoryForm key={id} startedAt={new Date().toISOString()} locationId={id} locationName={loc.name} initial={initial} articles={articles.map((a) => ({ id: a.id, name: a.name, unit: a.unit, returnable: a.returnable }))} />
      <section className="space-y-3 pt-4"><h2 className="text-xl">Letzte Inventuren hier</h2><InventoryRuns runs={runs} canWrite showLocation={false} /></section>
    </div>
  );
}
