import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLine, parseQuickEntry, type ParseCatalog } from "../../src/lib/domain/quick-parse.ts";

const catalog: ParseCatalog = {
  articles: [
    { id: "a-wasser", name: "Mineralwasser", aliases: ["Wasser", "Fachingen"], unit: "Kiste", returnable: true },
    { id: "a-brot", name: "Brötchen", aliases: ["Semmeln"], unit: "Karton", returnable: false },
    { id: "a-saft", name: "Orangensaft", aliases: [], unit: "Kiste", returnable: true },
  ],
  locations: [
    { id: "l-L", name: "L", code: null, parentId: null },
    { id: "l-L004", name: "L004", code: "L004", parentId: "l-L" },
    { id: "l-Lo", name: "L oben", code: null, parentId: "l-L" },
    { id: "l-SH", name: "Stadthalle", code: null, parentId: null },
    { id: "l-KL2", name: "Kühllager 2", code: null, parentId: "l-SH" },
    { id: "l-KA", name: "Kühlanhänger", code: null, parentId: null },
    { id: "l-GK", name: "Gewölbekeller", code: null, parentId: null },
    { id: "l-KK", name: "Kühlkammer", code: null, parentId: "l-GK" },
  ],
  suppliers: ["Staatlich Fachingen"],
};

test("Eingang mit Lieferant und Ort (aus der Sprachnachricht)", () => {
  const d = parseLine("Staatlich Fachingen, 46 Kisten Mineralwasser in L004", catalog);
  assert.equal(d.kind, "RECEIPT");
  assert.equal(d.quantity, 46);
  assert.equal(d.articleId, "a-wasser");
  assert.equal(d.toLocationId, "l-L004");
  assert.equal(d.fromLocationId, null);
  assert.equal(d.supplierName, "Staatlich Fachingen");
  assert.deepEqual(d.warnings, []);
});

test("Unbekannter Lieferant vor dem Komma wird übernommen", () => {
  const d = parseLine("Startlich Fachinkommen, 46 Kisten Mineralwasser in L004", catalog);
  assert.equal(d.kind, "RECEIPT");
  assert.equal(d.supplierName, "Startlich Fachinkommen");
  assert.equal(d.quantity, 46);
});

test("„von <Lieferant> in <Ort>“", () => {
  const d = parseLine("46 Kisten Mineralwasser von Fachinger Quelle in L004", catalog);
  assert.equal(d.kind, "RECEIPT");
  assert.equal(d.supplierName, "Fachinger Quelle");
  assert.equal(d.toLocationId, "l-L004");
});

test("Umlagerung von L004 in den Kühlanhänger der Stadthalle", () => {
  const d = parseLine("46 Kisten Mineralwasser von L004 nach Stadthalle Kühlanhänger", catalog);
  assert.equal(d.kind, "TRANSFER");
  assert.equal(d.fromLocationId, "l-L004");
  assert.equal(d.toLocationId, "l-KA");
  assert.equal(d.state, "FULL");
  assert.equal(d.quantity, 46);
});

test("Zahl im Ortsnamen („Kühllager 2“) ist nicht die Menge", () => {
  const d = parseLine("30 Kisten Wasser von Gewölbekeller nach Kühllager 2", catalog);
  assert.equal(d.quantity, 30);
  assert.equal(d.toLocationId, "l-KL2");
  assert.equal(d.fromLocationId, "l-GK");
  assert.equal(d.articleId, "a-wasser");
});

test("Leer-Markierung: voll → leer am Ort", () => {
  const d = parseLine("20 Kisten Mineralwasser leer in Stadthalle", catalog);
  assert.equal(d.kind, "CONSUME");
  assert.equal(d.fromLocationId, "l-SH");
  assert.equal(d.toLocationId, null);
  assert.equal(d.quantity, 20);
});

test("verbraucht", () => {
  const d = parseLine("12 Kisten Orangensaft verbraucht Kühllager 2", catalog);
  assert.equal(d.kind, "CONSUME");
  assert.equal(d.articleId, "a-saft");
  assert.equal(d.fromLocationId, "l-KL2");
});

test("Leergut wird umgelagert (Zustand leer)", () => {
  const d = parseLine("Leergut 20 Kisten Mineralwasser von Stadthalle nach L004", catalog);
  assert.equal(d.kind, "TRANSFER");
  assert.equal(d.state, "EMPTY");
  assert.equal(d.fromLocationId, "l-SH");
  assert.equal(d.toLocationId, "l-L004");
});

test("Pfand zurück", () => {
  const d = parseLine("Pfand zurück 20 Kisten Mineralwasser aus L004", catalog);
  assert.equal(d.kind, "RETURN");
  assert.equal(d.state, "EMPTY");
  assert.equal(d.fromLocationId, "l-L004");
});

test("Inventur: gezählte Menge", () => {
  const d = parseLine("Inventur Mineralwasser L004 gezählt 30", catalog);
  assert.equal(d.kind, "ADJUST");
  assert.equal(d.quantity, 30);
  assert.equal(d.fromLocationId, "l-L004");
});

test("Zahlwort und Alias", () => {
  const d = parseLine("eine Kiste Fachingen von L oben nach L004", catalog);
  assert.equal(d.quantity, 1);
  assert.equal(d.articleId, "a-wasser");
  assert.equal(d.fromLocationId, "l-Lo");
  assert.equal(d.toLocationId, "l-L004");
});

test("Code mit Leerzeichen: „L 004“", () => {
  const d = parseLine("5 Kisten Wasser in L 004", catalog);
  assert.equal(d.toLocationId, "l-L004");
  assert.equal(d.quantity, 5);
});

test("Unbekannter Artikel wird als Vorschlag gemeldet", () => {
  const d = parseLine("10 Kartons Butterbrezeln in Kühlkammer", catalog);
  assert.equal(d.articleId, null);
  assert.equal(d.articleGuess, "Butterbrezeln");
  assert.equal(d.toLocationId, "l-KK");
  assert.ok(d.warnings.some((w) => w.includes("Butterbrezeln")));
});

test("Fehlende Menge wird gemeldet", () => {
  const d = parseLine("Mineralwasser in L004", catalog);
  assert.equal(d.quantity, null);
  assert.ok(d.warnings.includes("Menge fehlt."));
});

test("Leergut-Hinweis bei Artikel ohne Pfand", () => {
  const d = parseLine("5 Karton Brötchen leer in L004", catalog);
  assert.equal(d.articleId, "a-brot");
  assert.ok(d.kind === "CONSUME");
});

test("Mehrere Zeilen ergeben mehrere Entwürfe", () => {
  const drafts = parseQuickEntry("Staatlich Fachingen, 46 Kisten Mineralwasser in L004\n12 Karton Brötchen in Kühlkammer", catalog);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[1].articleId, "a-brot");
  assert.equal(drafts[1].toLocationId, "l-KK");
});
