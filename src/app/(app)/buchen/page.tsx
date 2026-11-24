import Link from "next/link";
import { prisma } from "@/db/prisma";
import { BookPanel, type Draft } from "@/components/book-panel";
import { MOVEMENT_KINDS, type MovementKind, type StockState } from "@/lib/domain/rules";
import { requireWriter } from "@/lib/session";
import { loadCatalog } from "@/services/catalog-options";

export const metadata = { title: "Buchen" };

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const UUID = /^[0-9a-f-]{36}$/;

export default async function BuchenPage({ searchParams }: PageProps<"/buchen">) {
  await requireWriter();
  const sp = await searchParams;
  const catalog = await loadCatalog();

  // Vorbelegung aus Links („Umlagern“ neben einer Bestandszeile, „Als Vorlage“ im Journal)
  let initial: Partial<Draft> = {};
  const copy = first(sp.copy);
  if (copy && UUID.test(copy)) {
    const m = await prisma.movement.findUnique({ where: { id: copy }, include: { supplier: true } });
    if (m && m.kind !== "ADJUST") initial = { kind: m.kind, articleId: m.articleId, quantity: String(m.quantity), from: m.fromLocationId ?? "", to: m.toLocationId ?? "", state: (m.kind === "CONSUME" ? "FULL" : m.fromState ?? m.toState ?? "FULL") as StockState, supplier: m.supplier?.name ?? "", note: m.note ?? "" };
  } else {
    const kind = first(sp.kind);
    const article = first(sp.article);
    const from = first(sp.from);
    const to = first(sp.to);
    const state = first(sp.state);
    const qty = first(sp.qty);
    initial = {
      ...(kind && (MOVEMENT_KINDS as string[]).includes(kind) ? { kind: kind as MovementKind } : {}),
      ...(article && catalog.articles.some((a) => a.id === article) ? { articleId: article } : {}),
      ...(from && catalog.locations.some((l) => l.id === from) ? { from } : {}),
      ...(to && catalog.locations.some((l) => l.id === to) ? { to } : {}),
      ...(state === "EMPTY" || state === "FULL" ? { state } : {}),
      ...(qty && /^\d{1,6}$/.test(qty) ? { quantity: qty } : {}),
    };
  }

  return (
    <div className="page max-w-3xl space-y-5">
      <div>
        <h1 className="h1">Buchen</h1>
        <p className="text-sm text-muted-foreground">Eingang, Umlagerung, Verbrauch, Leergut, Abgang oder Inventur – alles in einer Maske.</p>
      </div>
      {catalog.locations.length === 0 && (
        <div className="card border-dashed p-6 text-center">
          <p className="font-medium text-heading">Zuerst Lagerorte anlegen.</p>
          <p className="mt-1 text-sm text-muted-foreground">Die Start-Lagerorte legst du mit einem Klick auf der Lage-Seite an, eigene unter <Link className="underline" href="/stammdaten">Stammdaten</Link>.</p>
          <Link href="/" className="btn-primary mt-4">Zur Lage</Link>
        </div>
      )}
      {catalog.locations.length > 0 && <BookPanel key={JSON.stringify(initial)} catalog={catalog} initial={initial} />}
    </div>
  );
}
