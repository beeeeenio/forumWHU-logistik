import "server-only";
import { prisma } from "@/db/prisma";
import type { Db, Tx } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import/fields";
import type { ParsedWorkbook } from "@/lib/import/parse";
import { clean, parseBool, parseCents, parseInteger, parseLocationKind, parseState, splitList, type LocKind } from "@/lib/import/values";
import { singularUnit } from "@/lib/format";
import type { StockState } from "@/lib/domain/rules";
import { audit } from "./audit";
import { BookingRollback, bookInTx, type BookInput } from "./movements";
import { stockRows } from "./stock";

/**
 * Excel-/CSV-Import für Bestand, Artikel, Lagerorte und Lieferanten. Es gibt keine Pflichtfelder bei der Zuordnung: Was in der Datei
 * fehlt, bekommt einen sinnvollen Standardwert; nur Zeilen ohne das Kennzeichen (Name bzw. Artikel+Ort+Menge) werden übersprungen
 * und genau benannt. Die Vorschau berechnet denselben Plan wie der Import, schreibt aber nichts.
 */

export interface ImportConfig { sheet: number; headerRow: number; columns: (string | null)[]; updateExisting: boolean; stockMode: "set" | "add" }
export type LineStatus = "neu" | "aktualisiert" | "unverändert" | "übersprungen" | "Hinweis";
export interface ImportLine { row: string; status: LineStatus; text: string }
export interface ImportReport {
  kind: ImportKind;
  created: number; updated: number; unchanged: number; skipped: number;
  /** z. B. „3 neue Artikel“, „2 neue Orte“ */
  extra: string[];
  lines: ImportLine[];
  /** wie viele Zeilen ausgewertet wurden */
  rowsRead: number;
  /** Bestand: Kennung der Buchungen (zum Zurücknehmen unter Inventur → Verlauf) */
  batchId?: string;
}
export type ImportOutcome = { ok: true; report: ImportReport } | { ok: false; error: string };

const MAX_LINES = 300;
const MAX_STOCK_ENTRIES = 2000;
const lower = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const codeKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// ── Entwürfe (hochgeladene Dateien) ───────────────────────────────────────────────────────────────────────────────────────
export async function createDraft(user: User, kind: ImportKind, wb: ParsedWorkbook): Promise<string> {
  await prisma.importDraft.deleteMany({ where: { OR: [{ createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } }] } });
  const mine = await prisma.importDraft.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: 4, select: { id: true } });
  if (mine.length) await prisma.importDraft.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
  const d = await prisma.importDraft.create({ data: { userId: user.id, kind, fileName: wb.fileName, sheets: wb.sheets as never }, select: { id: true } });
  await audit("import.upload", { userId: user.id, entity: "import", entityId: d.id, detail: { kind, file: wb.fileName } });
  return d.id;
}

export interface DraftSheet { name: string; hidden: boolean; rows: string[][]; rowNumbers: number[] }
export interface Draft { id: string; kind: ImportKind; fileName: string; sheets: DraftSheet[] }

export async function getDraft(user: User, id: string): Promise<Draft | null> {
  const d = await prisma.importDraft.findFirst({ where: { id, userId: user.id } });
  if (!d || !(d.kind in IMPORT_KINDS)) return null;
  return { id: d.id, kind: d.kind as ImportKind, fileName: d.fileName, sheets: d.sheets as unknown as DraftSheet[] };
}

// ── Zeilen aus der Datei ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Row { n: number; label: string; cells: string[] }
function extractRows(draft: Draft, cfg: ImportConfig): { rows: Row[]; get: (r: Row, key: string) => string } | { error: string } {
  const sheet = draft.sheets[cfg.sheet];
  if (!sheet) return { error: "Das gewählte Tabellenblatt gibt es nicht." };
  if (cfg.headerRow < 0 || cfg.headerRow >= sheet.rows.length) return { error: "Die Kopfzeile liegt außerhalb der Tabelle." };
  const prefix = draft.sheets.length > 1 ? `${sheet.name}, ` : "";
  const rows: Row[] = sheet.rows.slice(cfg.headerRow + 1).map((cells, i) => ({ n: i, label: `${prefix}Zeile ${sheet.rowNumbers[cfg.headerRow + 1 + i]}`, cells }));
  const idx = new Map<string, number>();
  cfg.columns.forEach((k, i) => { if (k && !idx.has(k)) idx.set(k, i); });
  return { rows, get: (r, key) => { const i = idx.get(key); return i === undefined ? "" : clean(r.cells[i]); } };
}

interface PlanResult { report: ImportReport; execute: (tx: Tx, user: User) => Promise<void> }
type Ctx = { db: Db; rows: Row[]; get: (r: Row, key: string) => string; cfg: ImportConfig; fileName: string };

function newReport(kind: ImportKind, rowsRead: number): ImportReport { return { kind, created: 0, updated: 0, unchanged: 0, skipped: 0, extra: [], lines: [], rowsRead }; }
function line(rep: ImportReport, row: string, status: LineStatus, text: string) {
  if (status === "neu") rep.created++; else if (status === "aktualisiert") rep.updated++; else if (status === "unverändert") rep.unchanged++; else if (status === "übersprungen") rep.skipped++;
  if (rep.lines.length < MAX_LINES && (status !== "unverändert" || rep.lines.length < 40)) rep.lines.push({ row, status, text });
}

// ── Lieferanten ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function planSuppliers(c: Ctx): Promise<PlanResult> {
  const rep = newReport("suppliers", c.rows.length);
  const existing = new Map((await c.db.supplier.findMany({ where: { archivedAt: null } })).map((s) => [lower(s.name), s]));
  const seen = new Set<string>();
  const create: { name: string; note: string | null }[] = [];
  const update: { id: string; note: string }[] = [];
  for (const r of c.rows) {
    const name = c.get(r, "name"), note = c.get(r, "note");
    if (!name) { line(rep, r.label, "übersprungen", "kein Name"); continue; }
    if (seen.has(lower(name))) { line(rep, r.label, "übersprungen", `„${name}“ steht schon weiter oben in der Datei`); continue; }
    seen.add(lower(name));
    const ex = existing.get(lower(name));
    if (!ex) { create.push({ name, note: note || null }); line(rep, r.label, "neu", name); }
    else if (c.cfg.updateExisting && note && note !== (ex.note ?? "")) { update.push({ id: ex.id, note }); line(rep, r.label, "aktualisiert", `${name}: Notiz`); }
    else line(rep, r.label, "unverändert", `${name} gibt es schon`);
  }
  return { report: rep, execute: async (tx) => { for (const s of create) await tx.supplier.create({ data: s }); for (const u of update) await tx.supplier.update({ where: { id: u.id }, data: { note: u.note } }); } };
}

// ── Artikel ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface ArticleRec { name: string; category: string; unit: string; returnable?: boolean; depositCents: number | null; needsCooling?: boolean; minStock: number | null; aliases: string[]; note: string }
async function planArticles(c: Ctx): Promise<PlanResult> {
  const rep = newReport("articles", c.rows.length);
  const existing = new Map((await c.db.article.findMany({ where: { archivedAt: null } })).map((a) => [lower(a.name), a]));
  const seen = new Set<string>();
  const create: { data: Record<string, unknown> }[] = [];
  const update: { id: string; data: Record<string, unknown> }[] = [];
  for (const r of c.rows) {
    const name = c.get(r, "name");
    if (!name) { line(rep, r.label, "übersprungen", "kein Name"); continue; }
    if (seen.has(lower(name))) { line(rep, r.label, "übersprungen", `„${name}“ steht schon weiter oben in der Datei`); continue; }
    seen.add(lower(name));
    const warn = (t: string) => line(rep, r.label, "Hinweis", `${name}: ${t}`);
    const rawDeposit = c.get(r, "deposit"), rawMin = c.get(r, "minStock");
    const rec: ArticleRec = {
      name, category: c.get(r, "category"), unit: c.get(r, "unit") ? singularUnit(c.get(r, "unit")) : "", returnable: parseBool(c.get(r, "returnable")), depositCents: rawDeposit ? parseCents(rawDeposit) : null,
      needsCooling: parseBool(c.get(r, "needsCooling")), minStock: rawMin ? parseInteger(rawMin) : null, aliases: splitList(c.get(r, "aliases")), note: c.get(r, "note"),
    };
    if (rawDeposit && rec.depositCents === null) warn(`Pfand „${rawDeposit}“ nicht lesbar – ignoriert`);
    if (rawMin && (rec.minStock === null || rec.minStock < 0)) { warn(`Mindestbestand „${rawMin}“ nicht lesbar – ignoriert`); rec.minStock = null; }
    if (rec.depositCents !== null && (rec.depositCents < 0 || rec.depositCents > 100_000)) { warn("Pfand außerhalb von 0–1.000 € – ignoriert"); rec.depositCents = null; }
    const returnable = rec.returnable ?? ((rec.depositCents ?? 0) > 0 ? true : undefined);
    const ex = existing.get(lower(name));
    if (!ex) {
      create.push({ data: { name, category: rec.category || "Sonstiges", unit: rec.unit || "Stück", returnable: returnable ?? false, depositCents: returnable === false ? 0 : rec.depositCents ?? 0, needsCooling: rec.needsCooling ?? false, minStock: rec.minStock, aliases: rec.aliases, note: rec.note || null } });
      line(rep, r.label, "neu", name);
      continue;
    }
    if (!c.cfg.updateExisting) { line(rep, r.label, "unverändert", `${name} gibt es schon`); continue; }
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    const set = (key: string, label: string, v: unknown, cur: unknown) => { if (v !== undefined && v !== null && v !== "" && JSON.stringify(v) !== JSON.stringify(cur)) { data[key] = v; changes.push(label); } };
    set("category", "Kategorie", rec.category, ex.category); set("unit", "Einheit", rec.unit, ex.unit); set("returnable", "Pfandartikel", returnable, ex.returnable);
    set("depositCents", "Pfand", rec.depositCents, ex.depositCents); set("needsCooling", "Kühlpflicht", rec.needsCooling, ex.needsCooling); set("minStock", "Mindestbestand", rec.minStock, ex.minStock); set("note", "Notiz", rec.note, ex.note ?? "");
    if (rec.aliases.length) set("aliases", "Schreibweisen", [...new Set([...ex.aliases, ...rec.aliases])].slice(0, 20), ex.aliases);
    if (data.returnable === false && (ex.depositCents > 0 || rec.depositCents)) data.depositCents = 0;
    if (!changes.length) line(rep, r.label, "unverändert", `${name}: nichts Neues`);
    else { update.push({ id: ex.id, data }); line(rep, r.label, "aktualisiert", `${name}: ${changes.join(", ")}`); }
  }
  return { report: rep, execute: async (tx) => { for (const x of create) await tx.article.create({ data: x.data as never }); for (const u of update) await tx.article.update({ where: { id: u.id }, data: u.data as never }); } };
}

// ── Lagerorte ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface LocRec { row: Row; name: string; code: string; parent: string; kind?: LocKind; cooled?: boolean; sort: number | null; note: string; existingId?: string }
async function planLocations(c: Ctx): Promise<PlanResult> {
  const rep = newReport("locations", c.rows.length);
  const all = await c.db.location.findMany();
  const byCode = new Map(all.filter((l) => l.code).map((l) => [codeKey(l.code!), l]));
  const byName = new Map<string, typeof all>();
  for (const l of all) (byName.get(lower(l.name)) ?? byName.set(lower(l.name), []).get(lower(l.name))!).push(l);
  const recs: LocRec[] = [];
  const seen = new Set<string>();
  for (const r of c.rows) {
    let name = c.get(r, "name");
    const code = c.get(r, "code").replace(/\s+/g, "");
    if (!name && code) name = code;
    if (!name) { line(rep, r.label, "übersprungen", "kein Name"); continue; }
    const key = code ? `c:${codeKey(code)}` : `n:${lower(name)}`;
    if (seen.has(key)) { line(rep, r.label, "übersprungen", `„${code || name}“ steht schon weiter oben in der Datei`); continue; }
    seen.add(key);
    const rawSort = c.get(r, "sortOrder");
    const rec: LocRec = { row: r, name, code, parent: c.get(r, "parent"), kind: parseLocationKind(c.get(r, "kind")), cooled: parseBool(c.get(r, "cooled")), sort: rawSort ? parseInteger(rawSort) : null, note: c.get(r, "note") };
    const m = code ? byCode.get(codeKey(code)) : undefined;
    const byN = byName.get(lower(name));
    const match = m ?? (byN && byN.length === 1 ? byN[0] : undefined);
    if (match) rec.existingId = match.id;
    recs.push(rec);
  }
  // Oberorte auflösen (Datei und Bestand), Zyklen verhindern
  const nodeOf = new Map<string, string>(); // Schlüssel → Knoten (Bestand: id, neu: "new:i")
  for (const l of all) { if (l.code) nodeOf.set(`c:${codeKey(l.code)}`, l.id); if ((byName.get(lower(l.name)) ?? []).length === 1) nodeOf.set(`n:${lower(l.name)}`, l.id); }
  recs.forEach((rec, i) => { const node = rec.existingId ?? `new:${i}`; if (rec.code) nodeOf.set(`c:${codeKey(rec.code)}`, node); nodeOf.set(`n:${lower(rec.name)}`, node); });
  const parentNode = new Map<string, string | null>();
  for (const l of all) parentNode.set(l.id, l.parentId);
  const resolved: (string | null)[] = recs.map((rec) => {
    if (!rec.parent) return null;
    const node = nodeOf.get(`c:${codeKey(rec.parent)}`) ?? nodeOf.get(`n:${lower(rec.parent)}`);
    if (!node) { line(rep, rec.row.label, "Hinweis", `${rec.name}: Oberort „${rec.parent}“ nicht gefunden – oberste Ebene`); return null; }
    return node;
  });
  recs.forEach((rec, i) => {
    const self = rec.existingId ?? `new:${i}`;
    const p = resolved[i];
    if (!p) return;
    let cur: string | null = p;
    for (let k = 0; cur && k < 30; k++) { if (cur === self) { line(rep, rec.row.label, "Hinweis", `${rec.name}: Oberort „${rec.parent}“ würde einen Kreis ergeben – oberste Ebene`); resolved[i] = null; return; } cur = cur.startsWith("new:") ? (resolved[Number(cur.slice(4))] ?? null) : parentNode.get(cur) ?? null; }
  });

  const creates: { i: number; data: Record<string, unknown> }[] = [];
  const updates: { i: number; id: string; data: Record<string, unknown> }[] = [];
  recs.forEach((rec, i) => {
    const label = rec.row.label;
    if (!rec.existingId) {
      const kind = rec.kind ?? (resolved[i] ? "ROOM" : "SITE");
      creates.push({ i, data: { name: rec.name, code: rec.code || null, kind, cooled: rec.cooled ?? (kind === "COLD" || kind === "TRAILER"), sortOrder: rec.sort ?? 0, note: rec.note || null } });
      line(rep, label, "neu", `${rec.name}${rec.code ? ` (${rec.code})` : ""}${rec.parent && resolved[i] ? ` in ${rec.parent}` : ""}`);
      return;
    }
    if (!c.cfg.updateExisting) { line(rep, label, "unverändert", `${rec.name} gibt es schon`); return; }
    const ex = all.find((l) => l.id === rec.existingId)!;
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    const set = (key: string, lab: string, v: unknown, cur: unknown) => { if (v !== undefined && v !== null && v !== "" && v !== cur) { data[key] = v; changes.push(lab); } };
    set("name", "Name", rec.name, ex.name); set("kind", "Art", rec.kind, ex.kind); set("cooled", "Kühlung", rec.cooled, ex.cooled); set("sortOrder", "Reihenfolge", rec.sort, ex.sortOrder); set("note", "Notiz", rec.note, ex.note ?? "");
    if (rec.code && codeKey(rec.code) !== codeKey(ex.code ?? "")) { if (byCode.has(codeKey(rec.code))) line(rep, label, "Hinweis", `${rec.name}: Kurzcode „${rec.code}“ gehört schon einem anderen Ort`); else { data.code = rec.code; changes.push("Kurzcode"); } }
    if (resolved[i] && resolved[i] !== ex.parentId) changes.push("Oberort");
    if (!changes.length) line(rep, label, "unverändert", `${rec.name}: nichts Neues`);
    else { updates.push({ i, id: ex.id, data }); line(rep, label, "aktualisiert", `${rec.name}: ${changes.join(", ")}`); }
  });

  return {
    report: rep,
    execute: async (tx) => {
      const ids = new Map<string, string>();
      for (const x of creates) ids.set(`new:${x.i}`, (await tx.location.create({ data: x.data as never })).id);
      for (const u of updates) await tx.location.update({ where: { id: u.id }, data: u.data as never });
      const idOf = (node: string) => (node.startsWith("new:") ? ids.get(node) : node);
      for (const x of creates) { const p = resolved[x.i]; if (p) await tx.location.update({ where: { id: ids.get(`new:${x.i}`)! }, data: { parentId: idOf(p) } }); }
      for (const u of updates) { const p = resolved[u.i]; if (p && idOf(p) !== u.id) await tx.location.update({ where: { id: u.id }, data: { parentId: idOf(p) } }); }
    },
  };
}

// ── Bestand ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface StockEntry { rows: string[]; article: string; location: string; state: StockState; qty: number; unit: string; category: string }
async function planStock(c: Ctx): Promise<PlanResult | { error: string }> {
  const rep = newReport("stock", c.rows.length);
  const entries = new Map<string, StockEntry>();
  for (const r of c.rows) {
    const article = c.get(r, "article"), location = c.get(r, "location"), rawQty = c.get(r, "quantity");
    if (!article) { line(rep, r.label, "übersprungen", "kein Artikel"); continue; }
    if (!location) { line(rep, r.label, "übersprungen", `${article}: kein Lagerort`); continue; }
    if (!rawQty) { line(rep, r.label, "übersprungen", `${article}: keine Menge`); continue; }
    const qty = parseInteger(rawQty);
    if (qty === null) { line(rep, r.label, "übersprungen", `${article}: Menge „${rawQty}“ nicht lesbar`); continue; }
    if (qty < 0) { line(rep, r.label, "übersprungen", `${article}: negative Menge`); continue; }
    const state: StockState = parseState(c.get(r, "state")) ?? "FULL";
    const key = `${lower(article)}|${codeKey(location)}|${state}`;
    const ex = entries.get(key);
    if (ex) { ex.qty += qty; ex.rows.push(r.label); line(rep, r.label, "Hinweis", `${article} / ${location}: mehrfach in der Datei – Mengen werden addiert`); continue; }
    entries.set(key, { rows: [r.label], article, location, state, qty, unit: c.get(r, "unit"), category: c.get(r, "category") });
  }
  if (entries.size > MAX_STOCK_ENTRIES) return { error: `Zu viele Positionen (${entries.size}); bitte höchstens ${MAX_STOCK_ENTRIES} je Import.` };

  const [articles, locations, stock] = await Promise.all([c.db.article.findMany({ where: { archivedAt: null } }), c.db.location.findMany({ where: { archivedAt: null } }), stockRows(c.db)]);
  const artByName = new Map<string, (typeof articles)[number]>();
  for (const a of articles) { artByName.set(lower(a.name), a); for (const al of a.aliases) if (!artByName.has(lower(al))) artByName.set(lower(al), a); }
  const locByCode = new Map(locations.filter((l) => l.code).map((l) => [codeKey(l.code!), l]));
  const locByName = new Map<string, typeof locations>();
  for (const l of locations) (locByName.get(lower(l.name)) ?? locByName.set(lower(l.name), []).get(lower(l.name))!).push(l);
  const findLoc = (t: string) => locByCode.get(codeKey(t)) ?? (locByName.get(lower(t))?.length === 1 ? locByName.get(lower(t))![0] : undefined);

  const newArticles = new Map<string, { name: string; unit: string; category: string; returnable: boolean }>();
  const newLocations = new Map<string, string>();
  const plan: { artKey: string; artId?: string; locKey: string; locId?: string; state: StockState; counted: number }[] = [];
  const cur = (artId: string, locId: string, state: StockState) => stock.find((s) => s.articleId === artId && s.locationId === locId && s.state === state)?.quantity ?? 0;

  for (const e of entries.values()) {
    const art = artByName.get(lower(e.article));
    const loc = findLoc(e.location);
    const label = e.rows[0];
    if (art && e.state === "EMPTY" && !art.returnable) { line(rep, label, "übersprungen", `${art.name}: „leer“ gibt es nur bei Pfandartikeln`); continue; }
    if (!art) {
      const k = lower(e.article);
      const na = newArticles.get(k) ?? { name: e.article, unit: e.unit ? singularUnit(e.unit) : "Stück", category: e.category || "Sonstiges", returnable: false };
      if (e.state === "EMPTY") na.returnable = true;
      newArticles.set(k, na);
    }
    if (!loc && !newLocations.has(codeKey(e.location))) newLocations.set(codeKey(e.location), e.location);
    const current = art && loc ? cur(art.id, loc.id, e.state) : 0;
    const counted = c.cfg.stockMode === "add" ? current + e.qty : e.qty;
    if (counted === current) { line(rep, label, "unverändert", `${art?.name ?? e.article} in ${loc?.name ?? e.location}: ${current}${e.state === "EMPTY" ? " leer" : ""} stimmt schon`); continue; }
    plan.push({ artKey: lower(e.article), artId: art?.id, locKey: codeKey(e.location), locId: loc?.id, state: e.state, counted });
    line(rep, label, "neu", `${art?.name ?? e.article}${art ? "" : " (neuer Artikel)"} in ${loc?.name ?? `${e.location} (neuer Ort)`}${e.state === "EMPTY" ? " (leer)" : ""}: ${current} → ${counted}`);
  }
  if (newArticles.size) rep.extra.push(`${newArticles.size === 1 ? "1 neuer Artikel wird" : `${newArticles.size} neue Artikel werden`} angelegt: ${[...newArticles.values()].slice(0, 6).map((a) => a.name).join(", ")}${newArticles.size > 6 ? " …" : ""}`);
  if (newLocations.size) rep.extra.push(`${newLocations.size === 1 ? "1 neuer Ort wird" : `${newLocations.size} neue Orte werden`} angelegt: ${[...newLocations.values()].slice(0, 6).join(", ")}${newLocations.size > 6 ? " …" : ""}`);

  return {
    report: rep,
    execute: async (tx, user) => {
      const artIds = new Map<string, string>();
      for (const [k, a] of newArticles) artIds.set(k, (await tx.article.create({ data: { name: a.name, unit: a.unit, category: a.category, returnable: a.returnable } })).id);
      const locIds = new Map<string, string>();
      for (const [k, name] of newLocations) locIds.set(k, (await tx.location.create({ data: { name, kind: "ROOM" } })).id);
      const inputs: BookInput[] = plan.map((p) => ({
        kind: "ADJUST", articleId: p.artId ?? artIds.get(p.artKey)!, quantity: p.counted, fromLocationId: p.locId ?? locIds.get(p.locKey)!, state: p.state,
        note: `Excel-Import ${c.fileName}`.slice(0, 200), source: "import",
      }));
      if (inputs.length) { const batchId = crypto.randomUUID(); await bookInTx(tx, user, inputs, batchId); rep.batchId = batchId; }
    },
  };
}

// ── Vorschau und Ausführung ───────────────────────────────────────────────────────────────────────────────────────────────
async function buildPlan(db: Db, draft: Draft, cfg: ImportConfig): Promise<PlanResult | { error: string }> {
  const ex = extractRows(draft, cfg);
  if ("error" in ex) return ex;
  if (!ex.rows.length) return { error: "Unter der Kopfzeile stehen keine Zeilen." };
  const ctx: Ctx = { db, rows: ex.rows, get: ex.get, cfg, fileName: draft.fileName };
  if (draft.kind === "stock") return planStock(ctx);
  if (draft.kind === "articles") return planArticles(ctx);
  if (draft.kind === "locations") return planLocations(ctx);
  return planSuppliers(ctx);
}

function hasIdentity(kind: ImportKind, cfg: ImportConfig): boolean {
  const mapped = new Set(cfg.columns.filter(Boolean));
  return IMPORT_KINDS[kind].identity.every((k) => mapped.has(k)) && (kind !== "stock" || (mapped.has("location") && mapped.has("quantity")));
}

const MISSING_HINT: Record<ImportKind, string> = {
  stock: "Ordne mindestens die Spalten „Artikel“, „Lagerort“ und „Menge“ zu – ohne sie weiß der Import nicht, was wohin gehört.",
  articles: "Ordne die Spalte „Name“ zu – ohne Namen kann kein Artikel angelegt werden. Alle anderen Felder sind frei.",
  locations: "Ordne die Spalte „Name“ zu (oder „Kurzcode“) – alle anderen Felder sind frei.",
  suppliers: "Ordne die Spalte „Name“ zu – alle anderen Felder sind frei.",
};

/** Nur bekannte Felder, jedes höchstens einmal, höchstens 200 Spalten (die Oberfläche ist nicht vertrauenswürdig). */
function sanitize(kind: ImportKind, cfg: ImportConfig): ImportConfig {
  const allowed = new Set(IMPORT_KINDS[kind].fields.map((f) => f.key));
  const used = new Set<string>();
  const columns = cfg.columns.slice(0, 200).map((k) => (k && allowed.has(k) && !used.has(k) ? (used.add(k), k) : null));
  return { sheet: Math.trunc(cfg.sheet), headerRow: Math.trunc(cfg.headerRow), columns, updateExisting: Boolean(cfg.updateExisting), stockMode: cfg.stockMode === "add" ? "add" : "set" };
}

export async function previewImport(user: User, draftId: string, rawCfg: ImportConfig): Promise<ImportOutcome> {
  const draft = await getDraft(user, draftId);
  if (!draft) return { ok: false, error: "Die hochgeladene Datei gibt es nicht mehr – bitte noch einmal hochladen." };
  const cfg = sanitize(draft.kind, rawCfg);
  if (!hasIdentity(draft.kind, cfg)) return { ok: false, error: MISSING_HINT[draft.kind] };
  const plan = await buildPlan(prisma, draft, cfg);
  if ("error" in plan) return { ok: false, error: plan.error };
  return { ok: true, report: plan.report };
}

export async function runImport(user: User, draftId: string, rawCfg: ImportConfig): Promise<ImportOutcome> {
  const draft = await getDraft(user, draftId);
  if (!draft) return { ok: false, error: "Die hochgeladene Datei gibt es nicht mehr – bitte noch einmal hochladen." };
  const cfg = sanitize(draft.kind, rawCfg);
  if (!hasIdentity(draft.kind, cfg)) return { ok: false, error: MISSING_HINT[draft.kind] };
  try {
    const report = await prisma.$transaction(async (tx) => {
      const plan = await buildPlan(tx, draft, cfg);
      if ("error" in plan) throw new ImportStop(plan.error);
      await plan.execute(tx, user);
      return plan.report;
    }, { timeout: 120_000, maxWait: 10_000 });
    await prisma.importDraft.deleteMany({ where: { id: draft.id } });
    await audit("import.run", { userId: user.id, entity: "import", entityId: draft.id, detail: { kind: draft.kind, file: draft.fileName, created: report.created, updated: report.updated, unchanged: report.unchanged, skipped: report.skipped } });
    return { ok: true, report };
  } catch (e) {
    if (e instanceof ImportStop) return { ok: false, error: e.message };
    if (e instanceof BookingRollback) return { ok: false, error: `Der Import wurde abgebrochen, es wurde nichts gespeichert: ${e.message}` };
    throw e;
  }
}
class ImportStop extends Error {}
