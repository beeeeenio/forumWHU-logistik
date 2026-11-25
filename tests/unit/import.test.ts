import { test } from "node:test";
import assert from "node:assert/strict";
import { guessColumns } from "../../src/lib/import/fields.ts";
import { parseBool, parseCents, parseInteger, parseLocationKind, parseState, splitList } from "../../src/lib/import/values.ts";
import { cellToString, decodeText, detectDelimiter, detectHeaderRow, parseFile } from "../../src/lib/import/parse.ts";

test("Spalten werden automatisch erkannt (deutsch/englisch, jede nur einmal)", () => {
  assert.deepEqual(guessColumns("stock", ["Produkt", "Raum", "Anzahl", "Leergut?", "Bemerkung"]), ["article", "location", "quantity", "state", null]);
  assert.deepEqual(guessColumns("articles", ["Name", "Kategorie", "Einheit", "Pfand", "Kühlpflichtig", "Mindestbestand"]), ["name", "category", "unit", "deposit", "needsCooling", "minStock"]);
  assert.deepEqual(guessColumns("locations", ["Lagerort", "Code", "Gebäude"]), ["name", "code", "parent"]);
  assert.deepEqual(guessColumns("suppliers", ["Foo", "Bar"]), [null, null]);
});

test("Wahrheitswerte", () => {
  for (const y of ["ja", "Ja", "X", "1", "true", "Yes"]) assert.equal(parseBool(y), true, y);
  for (const n of ["nein", "Nein", "0", "false", "-"]) assert.equal(parseBool(n), false, n);
  assert.equal(parseBool(""), undefined);
  assert.equal(parseBool("vielleicht"), undefined);
});

test("Zahlen und Beträge im deutschen Format", () => {
  assert.equal(parseInteger("46"), 46);
  assert.equal(parseInteger("46,0"), 46);
  assert.equal(parseInteger("1.200"), 1200);
  assert.equal(parseInteger("12 Kisten"), 12);
  assert.equal(parseInteger("abc"), null);
  assert.equal(parseCents("4,50"), 450);
  assert.equal(parseCents("4.50 €"), 450);
  assert.equal(parseCents("EUR 4,5"), 450);
  assert.equal(parseCents("1.234,50"), 123450);
  assert.equal(parseCents(""), null);
  assert.equal(parseCents("viel"), null);
});

test("Ortsart und Zustand", () => {
  assert.equal(parseLocationKind("Kühlanhänger"), "TRAILER");
  assert.equal(parseLocationKind("Kühlraum"), "COLD");
  assert.equal(parseLocationKind("Gebäude"), "SITE");
  assert.equal(parseLocationKind("Raum"), "ROOM");
  assert.equal(parseLocationKind("irgendwas"), undefined);
  assert.equal(parseState("leer"), "EMPTY");
  assert.equal(parseState("Leergut"), "EMPTY");
  assert.equal(parseState("voll"), "FULL");
  assert.equal(parseState(""), undefined);
  assert.deepEqual(splitList("Wasser, Fachingen; wasser ,"), ["Wasser", "Fachingen", "wasser"]);
});

test("CSV: Windows-1252, Semikolon, Zeilennummern, Kopfzeile", async () => {
  const csv = Buffer.from("\n\nArtikel;Menge\nBrötchen;5\n;\nButter;2\n", "latin1");
  assert.ok(decodeText(csv).includes("Brötchen"));
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const wb = await parseFile({ name: "liste.csv", data: csv });
  const s = wb.sheets[0];
  assert.deepEqual(s.rows[0], ["Artikel", "Menge"]);
  assert.deepEqual(s.rowNumbers, [3, 4, 6]); // echte Zeilennummern, Leerzeilen übersprungen
  assert.equal(detectHeaderRow(s.rows), 0);
});

test("Dateien: falsches Format, leer, Zellwerte", async () => {
  await assert.rejects(parseFile({ name: "x.pdf", data: Buffer.from("x") }), /Nicht unterstütztes Format/);
  await assert.rejects(parseFile({ name: "x.csv", data: Buffer.from("\n\n") }), /keine Daten/);
  await assert.rejects(parseFile({ name: "kaputt.xlsx", data: Buffer.from("kein zip") }), /nicht gelesen/);
  assert.equal(cellToString(new Date(Date.UTC(2026, 11, 4))), "04.12.2026");
  assert.equal(cellToString({ richText: [{ text: "a" }, { text: "b" }] }), "ab");
  assert.equal(cellToString({ formula: "=1+1", result: 2 }), "2");
  assert.equal(cellToString(null), "");
});
