import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, seed } from "./helpers.ts";
import { createDraft, previewImport, runImport, type ImportConfig } from "../../src/services/import.ts";
import { voidInventory } from "../../src/services/inventory.ts";
import { stockAt } from "../../src/services/stock.ts";
import { getConsumption } from "../../src/services/consumption.ts";
import { bookMovements } from "../../src/services/movements.ts";
import type { ImportKind } from "../../src/lib/import/fields.ts";

let d: Awaited<ReturnType<typeof seed>>;
before(async () => { d = await seed(); });
after(async () => { await prisma.$disconnect(); });

async function draft(kind: ImportKind, rows: string[][]) {
  return createDraft(d.user, kind, { fileName: "test.xlsx", sheets: [{ name: "Blatt1", hidden: false, rows, rowNumbers: rows.map((_, i) => i + 1) }] });
}
const cfg = (columns: (string | null)[], over: Partial<ImportConfig> = {}): ImportConfig => ({ sheet: 0, headerRow: 0, columns, updateExisting: false, stockMode: "set", ...over });

test("Lagerorte: Hierarchie, Duplikate, unbekannter Oberort und Kreis werden sauber behandelt", async () => {
  const id = await draft("locations", [
    ["Name", "Code", "Liegt in", "Art", "Gekühlt"],
    ["Eventhalle", "", "", "Gebäude", ""],
    ["Kühllager A", "KLA", "Eventhalle", "Kühlraum", ""],
    ["Kühllager A", "KLA", "", "", ""],            // doppelt
    ["Nische", "NI", "Gibts nicht", "", ""],       // Oberort unbekannt
    ["Loop1", "L1", "L2", "", ""],
    ["Loop2", "L2", "L1", "", ""],                 // Kreis
    ["", "", "", "", ""],                          // leer wird schon beim Einlesen entfernt; hier nur Namenlos mit Rest
    ["", "", "Eventhalle", "Raum", ""],
  ]);
  const c = cfg(["name", "code", "parent", "kind", "cooled"]);
  const pre = await previewImport(d.user, id, c);
  assert.ok(pre.ok);
  if (!pre.ok) return;
  assert.equal(pre.report.created, 5);
  assert.ok(pre.report.skipped >= 2);
  assert.equal(await prisma.location.count({ where: { name: "Eventhalle" } }), 0, "Vorschau schreibt nichts");
  const run = await runImport(d.user, id, c);
  assert.ok(run.ok);
  const halle = await prisma.location.findFirstOrThrow({ where: { name: "Eventhalle" } });
  const kl = await prisma.location.findFirstOrThrow({ where: { code: "KLA" } });
  assert.equal(kl.parentId, halle.id);
  assert.equal(kl.kind, "COLD");
  assert.equal(kl.cooled, true, "Kühlraum ist standardmäßig gekühlt");
  assert.equal(halle.kind, "SITE");
  const nische = await prisma.location.findFirstOrThrow({ where: { code: "NI" } });
  assert.equal(nische.parentId, null);
  const l1 = await prisma.location.findFirstOrThrow({ where: { code: "L1" } });
  const l2 = await prisma.location.findFirstOrThrow({ where: { code: "L2" } });
  assert.ok(!(l1.parentId === l2.id && l2.parentId === l1.id), "kein Kreis");
  assert.equal(await prisma.importDraft.count({ where: { id } }), 0, "Entwurf nach dem Import gelöscht");
});

test("Artikel: ohne Pflichtfelder, Pfand impliziert Pfandartikel, Aktualisieren nur mit Haken", async () => {
  const id = await draft("articles", [
    ["Produkt", "Pfand", "Einheit", "Mindestbestand", "Kühlung"],
    ["Cola", "4,50 €", "Kisten", "10", "nein"],
    ["Quark", "", "", "abc", "ja"],
    ["Mineralwasser", "", "Palette", "", ""],
  ]);
  const c = cfg(["name", "deposit", "unit", "minStock", "needsCooling"]);
  const r1 = await runImport(d.user, id, c);
  assert.ok(r1.ok);
  const cola = await prisma.article.findFirstOrThrow({ where: { name: "Cola" } });
  assert.equal(cola.returnable, true);
  assert.equal(cola.depositCents, 450);
  assert.equal(cola.unit, "Kiste", "Mehrzahl wird zur Einzahl");
  assert.equal(cola.minStock, 10);
  const quark = await prisma.article.findFirstOrThrow({ where: { name: "Quark" } });
  assert.equal(quark.needsCooling, true);
  assert.equal(quark.minStock, null);
  assert.equal(quark.unit, "Stück", "Standardwert");
  if (r1.ok) assert.ok(r1.report.lines.some((l) => l.status === "Hinweis" && l.text.includes("abc")));
  assert.equal((await prisma.article.findFirstOrThrow({ where: { id: d.wasser.id } })).unit, "Kiste", "ohne Haken unverändert");
  const id2 = await draft("articles", [["Name", "Einheit"], ["Mineralwasser", "Palette"]]);
  assert.ok((await runImport(d.user, id2, cfg(["name", "unit"], { updateExisting: true }))).ok);
  assert.equal((await prisma.article.findFirstOrThrow({ where: { id: d.wasser.id } })).unit, "Palette");
});

test("Lieferanten", async () => {
  const id = await draft("suppliers", [["Firma", "Bemerkung"], ["Bäckerei Beispiel", "Tel 123"], ["Bäckerei Beispiel", "doppelt"], ["", "ohne Name"]]);
  const r = await runImport(d.user, id, cfg(["name", "note"]));
  assert.ok(r.ok && r.report.created === 1 && r.report.skipped === 2);
  assert.equal(await prisma.supplier.count({ where: { name: "Bäckerei Beispiel" } }), 1);
});

test("Bestand: legt fehlende Artikel/Orte an, bucht als Zählung, nimmt sich komplett zurück", async () => {
  const id = await draft("stock", [
    ["Artikel", "Lagerort", "Menge", "Zustand", "Einheit"],
    ["Mineralwasser", "L004", "30", "voll", ""],
    ["Mineralwasser", "L004", "5", "leer", ""],
    ["Limonade", "Neuer Keller", "12", "", "Kasten"],
    ["Limonade", "Neuer Keller", "3", "", ""],         // doppelt → addiert
    ["Brötchen", "L004", "4", "leer", ""],         // kein Pfandartikel → übersprungen
    ["Brötchen", "", "4", "", ""],                 // kein Ort
    ["Butter", "L004", "viel", "", ""],            // Menge nicht lesbar
  ]);
  const c = cfg(["article", "location", "quantity", "state", "unit"]);
  const pre = await previewImport(d.user, id, c);
  assert.ok(pre.ok);
  if (pre.ok) { assert.ok(pre.report.extra.some((e) => e.includes("Artikel"))); assert.ok(pre.report.extra.some((e) => e.includes("Ort"))); }
  const run = await runImport(d.user, id, c);
  assert.ok(run.ok, run.ok ? "" : run.error);
  assert.ok(run.ok && run.report.batchId);
  if (!run.ok || !run.report.batchId) return;
  assert.equal(await stockAt(prisma, d.wasser.id, d.L004.id, "FULL"), 30);
  assert.equal(await stockAt(prisma, d.wasser.id, d.L004.id, "EMPTY"), 5);
  const lim = await prisma.article.findFirstOrThrow({ where: { name: "Limonade" } });
  const keller = await prisma.location.findFirstOrThrow({ where: { name: "Neuer Keller" } });
  assert.equal(lim.unit, "Kasten");
  assert.equal(await stockAt(prisma, lim.id, keller.id, "FULL"), 15);
  // „Dazu buchen“ addiert
  const id2 = await draft("stock", [["Artikel", "Ort", "Anzahl"], ["Mineralwasser", "L004", "10"]]);
  assert.ok((await runImport(d.user, id2, cfg(["article", "location", "quantity"], { stockMode: "add" }))).ok);
  assert.equal(await stockAt(prisma, d.wasser.id, d.L004.id, "FULL"), 40);
  // Rücknahme des ersten Imports: Bestand ist wieder wie vorher (angelegte Stammdaten bleiben)
  const v = await voidInventory(d.user, run.report.batchId, "falsche Datei");
  assert.ok(v.ok);
  assert.equal(await stockAt(prisma, d.wasser.id, d.L004.id, "EMPTY"), 0);
  assert.equal(await stockAt(prisma, lim.id, keller.id, "FULL"), 0);
});

test("Ohne Kennzeichen-Spalten: verständliche Meldung statt Fehler; fremde Entwürfe sind unzugänglich", async () => {
  const id = await draft("stock", [["Artikel", "Menge"], ["Wasser", "5"]]);
  const r = await previewImport(d.user, id, cfg(["article", "quantity"]));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Lagerort/);
  const other = await prisma.user.create({ data: { email: "o@x.de", normalizedEmail: "o@x.de", displayName: "Other", role: "MEMBER", status: "ACTIVE" } });
  const none = await previewImport(other, id, cfg(["article", "location", "quantity"]));
  assert.equal(none.ok, false);
});

test("Unbekannte Feldnamen und doppelte Zuordnungen aus der Oberfläche werden ignoriert", async () => {
  const id = await draft("suppliers", [["A", "B", "C"], ["Lieferant X", "n1", "n2"]]);
  const r = await runImport(d.user, id, cfg(["name", "name", "hack" as never]));
  assert.ok(r.ok);
  assert.equal((await prisma.supplier.findFirstOrThrow({ where: { name: "Lieferant X" } })).note, null);
});

test("Verbrauch je Tag: Berliner Kalendertage, storniert zählt nicht, Einheiten werden nicht addiert", async () => {
  const { wasser, brot, L004, user } = d;
  const at = (iso: string) => new Date(iso);
  await bookMovements(user, [{ kind: "RECEIPT", articleId: wasser.id, quantity: 100, toLocationId: L004.id, occurredAt: at("2026-12-03T10:00:00Z") }]);
  await bookMovements(user, [{ kind: "RECEIPT", articleId: brot.id, quantity: 50, toLocationId: L004.id, occurredAt: at("2026-12-03T10:00:00Z") }]);
  await bookMovements(user, [{ kind: "CONSUME", articleId: wasser.id, quantity: 20, fromLocationId: L004.id, occurredAt: at("2026-12-04T09:00:00Z") }]);
  // 23:30 UTC am 4.12. ist in Berlin schon der 5.12.
  await bookMovements(user, [{ kind: "CONSUME", articleId: wasser.id, quantity: 7, fromLocationId: L004.id, occurredAt: at("2026-12-04T23:30:00Z") }]);
  await bookMovements(user, [{ kind: "CONSUME", articleId: brot.id, quantity: 4, fromLocationId: L004.id, occurredAt: at("2026-12-05T10:00:00Z") }]);
  const wrong = await bookMovements(user, [{ kind: "CONSUME", articleId: wasser.id, quantity: 9, fromLocationId: L004.id, occurredAt: at("2026-12-05T11:00:00Z") }]);
  if (wrong.ok) await prisma.movement.update({ where: { id: wrong.ids[0] }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: "test" } });
  const c = await getConsumption("2026-12-03", "2026-12-06", false);
  assert.deepEqual(c.days, ["2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  const w = c.rows.find((r) => r.article.id === wasser.id)!;
  assert.equal(w.perDay["2026-12-04"], 20);
  assert.equal(w.perDay["2026-12-05"], 7, "Berliner Tag, nicht UTC");
  assert.equal(w.total, 27, "stornierte Buchung zählt nicht");
  assert.equal(w.received, 100);
  assert.ok(c.byUnit.some((u) => u.unit === "Palette" && u.total === 27) && c.byUnit.some((u) => u.unit === "Karton" && u.total === 4));
  assert.equal(c.peak?.unit, "Palette");
});
