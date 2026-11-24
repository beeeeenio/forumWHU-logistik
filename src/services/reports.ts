import "server-only";
import { prisma } from "@/db/prisma";
import type { Article, Location, Prisma } from "@/generated/prisma/client";
import { buildTree, descendantIds, isCooled, pathName, type TreeNode } from "@/lib/domain/tree";
import { stockKey, type StockState } from "@/lib/domain/rules";
import { stockRows } from "./stock";
import { toCsv } from "./reports-csv";

export interface ItemLine { article: Article; full: number; empty: number }
export interface LageNode { loc: Location; items: ItemLine[]; children: LageNode[]; depth: number; /** Positionen in diesem Ort samt Unterorten */ positions: number }

export interface Alert {
  level: "error" | "warn" | "info";
  kind: "NEGATIVE" | "COOLING" | "OVERDUE" | "SOON" | "LOW";
  text: string;
  href?: string;
}

export interface Lage {
  tree: LageNode[];
  locations: Location[];
  articles: Article[];
  alerts: Alert[];
  totals: { positions: number; articles: number; locationsUsed: number };
  rows: { articleId: string; locationId: string; state: StockState; quantity: number }[];
}

/** Der ständige Lagebericht: was liegt gerade wo – plus Warnungen (Minusbestand, Kühlware ohne Kühlung, überfällige Pläne). */
export async function getLage(now = new Date()): Promise<Lage> {
  const [locations, articles, rows, plans] = await Promise.all([
    prisma.location.findMany(),
    prisma.article.findMany(),
    stockRows(prisma),
    prisma.plan.findMany({ where: { status: "OPEN" }, include: { article: true, toLocation: true }, orderBy: { dueAt: "asc" } }),
  ]);
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const locById = new Map(locations.map((l) => [l.id, l]));

  // Archivierte Orte nur, wenn dort (noch) etwas liegt oder gebucht ist
  const usedLoc = new Set(rows.map((r) => r.locationId));
  const visible = locations.filter((l) => !l.archivedAt || usedLoc.has(l.id));

  const itemsByLoc = new Map<string, Map<string, ItemLine>>();
  for (const r of rows) {
    const article = articleById.get(r.articleId);
    if (!article) continue;
    const perLoc = itemsByLoc.get(r.locationId) ?? itemsByLoc.set(r.locationId, new Map()).get(r.locationId)!;
    const line = perLoc.get(r.articleId) ?? perLoc.set(r.articleId, { article, full: 0, empty: 0 }).get(r.articleId)!;
    if (r.state === "FULL") line.full += r.quantity; else line.empty += r.quantity;
  }

  const toNode = (n: TreeNode<Location>): LageNode => {
    const items = [...(itemsByLoc.get(n.loc.id)?.values() ?? [])].sort((a, b) => a.article.name.localeCompare(b.article.name, "de"));
    const children = n.children.map(toNode);
    return { loc: n.loc, items, children, depth: n.depth, positions: items.length + children.reduce((s, c) => s + c.positions, 0) };
  };
  const tree = buildTree(visible).map(toNode);

  const alerts: Alert[] = [];
  for (const r of rows.filter((x) => x.quantity < 0)) {
    const a = articleById.get(r.articleId);
    alerts.push({ level: "error", kind: "NEGATIVE", text: `${a?.name ?? "?"} (${r.state === "FULL" ? "voll" : "leer"}) in ${pathName(locations, r.locationId)}: ${r.quantity.toLocaleString("de-DE")} – es wurde mehr abgebucht als gebucht war. Bitte Eingang nachtragen oder korrigieren.`, href: `/orte/${r.locationId}` });
  }
  for (const r of rows.filter((x) => x.quantity > 0 && x.state === "FULL")) {
    const a = articleById.get(r.articleId);
    if (a?.needsCooling && locById.has(r.locationId) && !isCooled(locations, r.locationId)) {
      alerts.push({ level: "warn", kind: "COOLING", text: `${a.name} braucht Kühlung, liegt aber in ${pathName(locations, r.locationId)} (ungekühlt).`, href: `/orte/${r.locationId}` });
    }
  }
  // Mindestbestand: voll/vorrätig über alle Orte (Minusbestände zählen mit, ein Minus ist ohnehin gemeldet)
  for (const a of articles.filter((x) => x.minStock !== null && !x.archivedAt)) {
    const total = rows.filter((r) => r.articleId === a.id && r.state === "FULL").reduce((s, r) => s + r.quantity, 0);
    if (total < a.minStock!) alerts.push({ level: "warn", kind: "LOW", text: `${a.name}: nur noch ${total.toLocaleString("de-DE")} ${a.unit === "Kiste" && total !== 1 ? "Kisten" : a.unit} ${a.returnable ? "voll " : ""}(Mindestbestand ${a.minStock!.toLocaleString("de-DE")}).`, href: `/artikel/${a.id}` });
  }
  const soonMs = 24 * 3600 * 1000;
  for (const p of plans) {
    if (p.dueAt < now) alerts.push({ level: "error", kind: "OVERDUE", text: `Überfällig: ${p.quantity.toLocaleString("de-DE")} × ${p.article.name} → ${p.toLocation.name}${p.phase ? ` (${p.phase})` : ""}`, href: "/plan" });
    else if (p.dueAt.getTime() - now.getTime() <= soonMs) alerts.push({ level: "info", kind: "SOON", text: `Bald fällig: ${p.quantity.toLocaleString("de-DE")} × ${p.article.name} → ${p.toLocation.name}${p.phase ? ` (${p.phase})` : ""}`, href: "/plan" });
  }

  const positive = rows.filter((r) => r.quantity > 0);
  return {
    tree, locations, articles, alerts, rows,
    totals: { positions: positive.length, articles: new Set(positive.map((r) => r.articleId)).size, locationsUsed: new Set(positive.map((r) => r.locationId)).size },
  };
}

/** Bestand einer Auswahl von Orten (ein Ort samt Unterorten) – für die Ortsseite. */
export async function getLocationStock(locationId: string) {
  const locations = await prisma.location.findMany();
  const ids = descendantIds(locations, locationId);
  const [rows, articles] = await Promise.all([stockRows(prisma), prisma.article.findMany()]);
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const lines = rows
    .filter((r) => ids.includes(r.locationId) && r.quantity !== 0)
    .map((r) => ({ article: articleById.get(r.articleId)!, locationId: r.locationId, state: r.state, quantity: r.quantity }))
    .filter((l) => l.article)
    .sort((a, b) => a.article.name.localeCompare(b.article.name, "de") || a.state.localeCompare(b.state));
  return { locations, lines };
}

// ── Pfand / Leergut ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PfandLine { article: Article; full: number; empty: number; returned: number; emptyByLocation: { locationId: string; quantity: number }[] }

export async function getPfand() {
  const [articles, rows, returns, locations] = await Promise.all([
    prisma.article.findMany({ where: { returnable: true }, orderBy: { name: "asc" } }),
    stockRows(prisma),
    prisma.movement.groupBy({ by: ["articleId"], where: { kind: "RETURN", voidedAt: null }, _sum: { quantity: true } }),
    prisma.location.findMany(),
  ]);
  const lines: PfandLine[] = articles.map((a) => {
    const mine = rows.filter((r) => r.articleId === a.id);
    return {
      article: a,
      full: mine.filter((r) => r.state === "FULL").reduce((s, r) => s + r.quantity, 0),
      empty: mine.filter((r) => r.state === "EMPTY").reduce((s, r) => s + r.quantity, 0),
      returned: returns.find((r) => r.articleId === a.id)?._sum.quantity ?? 0,
      emptyByLocation: mine.filter((r) => r.state === "EMPTY" && r.quantity !== 0).map((r) => ({ locationId: r.locationId, quantity: r.quantity })).sort((x, y) => y.quantity - x.quantity),
    };
  }).filter((l) => l.full || l.empty || l.returned || l.article.archivedAt === null);
  return { lines, locations };
}

// ── Artikelseite ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function getArticleOverview(articleId: string) {
  const [article, rows, locations, moves, plans] = await Promise.all([
    prisma.article.findUnique({ where: { id: articleId } }),
    stockRows(prisma, { articleId }),
    prisma.location.findMany(),
    prisma.movement.findMany({ where: { articleId }, orderBy: { occurredAt: "desc" }, take: 30, include: { fromLocation: true, toLocation: true, supplier: true, createdBy: true, voidedBy: true, article: true, attachments: { select: { id: true, mime: true, filename: true } } } }),
    prisma.plan.findMany({ where: { articleId, status: "OPEN" }, orderBy: { dueAt: "asc" }, include: { fromLocation: true, toLocation: true, article: true } }),
  ]);
  return { article, rows: rows.filter((r) => r.quantity !== 0), locations, moves, plans };
}

// ── Journal ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface JournalFilter {
  articleId?: string; locationId?: string; kind?: string; userId?: string; from?: Date | null; to?: Date | null; includeVoided?: boolean; page?: number; pageSize?: number;
}

export function journalWhere(f: JournalFilter, locations: Location[]): Prisma.MovementWhereInput {
  const where: Prisma.MovementWhereInput = {};
  if (f.articleId) where.articleId = f.articleId;
  if (f.locationId) { const ids = descendantIds(locations, f.locationId); where.OR = [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }]; }
  if (f.kind) where.kind = f.kind as never;
  if (f.userId) where.createdById = f.userId;
  if (f.from || f.to) where.occurredAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) };
  if (!f.includeVoided) where.voidedAt = null;
  return where;
}

export const JOURNAL_INCLUDE = { article: true, fromLocation: true, toLocation: true, supplier: true, createdBy: true, voidedBy: true, attachments: { select: { id: true, mime: true, filename: true } } } satisfies Prisma.MovementInclude;

export async function getJournal(f: JournalFilter) {
  const pageSize = f.pageSize ?? 40;
  const page = Math.max(1, f.page ?? 1);
  const locations = await prisma.location.findMany();
  const where = journalWhere(f, locations);
  const [total, rows] = await Promise.all([
    prisma.movement.count({ where }),
    prisma.movement.findMany({ where, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: JOURNAL_INCLUDE }),
  ]);
  return { total, rows, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), locations };
}

// ── CSV (Excel-tauglich: Semikolon, UTF-8 mit BOM) ───────────────────────────────────────────────────────────────────────
export async function bestandCsv(): Promise<string> {
  const lage = await getLage();
  const byId = new Map(lage.articles.map((a) => [a.id, a]));
  const rows: (string | number)[][] = [["Ort", "Artikel", "Kategorie", "Zustand", "Menge", "Einheit"]];
  const sorted = [...lage.rows].filter((r) => r.quantity !== 0).sort((a, b) => pathName(lage.locations, a.locationId).localeCompare(pathName(lage.locations, b.locationId), "de") || (byId.get(a.articleId)?.name ?? "").localeCompare(byId.get(b.articleId)?.name ?? "", "de"));
  for (const r of sorted) {
    const a = byId.get(r.articleId);
    rows.push([pathName(lage.locations, r.locationId), a?.name ?? "", a?.category ?? "", r.state === "FULL" ? (a?.returnable ? "voll" : "vorrätig") : "leer", r.quantity, a?.unit ?? ""]);
  }
  return toCsv(rows);
}

export { stockKey };
