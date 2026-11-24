import "server-only";
import { prisma } from "@/db/prisma";
import type { BookCatalog } from "@/components/book-panel";
import { buildTree, flatten, isCooled, pathName } from "@/lib/domain/tree";
import { stockRows } from "./stock";

/** Auswahllisten für Formulare: aktive Artikel/Orte/Lieferanten (Orte in Baumreihenfolge mit vollem Pfad) und der aktuelle Bestand. */
export async function loadCatalog(withStock = true): Promise<BookCatalog> {
  const [articles, locations, suppliers, stock] = await Promise.all([
    prisma.article.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.location.findMany(),
    prisma.supplier.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    withStock ? stockRows(prisma) : Promise.resolve([]),
  ]);
  const active = locations.filter((l) => !l.archivedAt);
  const ordered = flatten(buildTree(active)).map((n) => n.loc);
  return {
    articles: articles.map((a) => ({ id: a.id, name: a.name, unit: a.unit, returnable: a.returnable, needsCooling: a.needsCooling })),
    locations: ordered.map((l) => ({ id: l.id, label: pathName(locations, l.id) + (l.code && l.code !== l.name ? ` · ${l.code}` : ""), cooled: isCooled(locations, l.id) })),
    suppliers: suppliers.map((s) => s.name),
    stock: stock.filter((r) => r.quantity !== 0).map((r) => ({ a: r.articleId, l: r.locationId, s: r.state, q: r.quantity })),
  };
}
