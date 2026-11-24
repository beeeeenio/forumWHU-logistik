import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustTo, foldStock, movementDeltas, resolveMovement } from "../../src/lib/domain/rules.ts";
import { buildTree, descendantIds, isCooled, pathName } from "../../src/lib/domain/tree.ts";
import { fmtQty, pluralUnit, singularUnit } from "../../src/lib/format.ts";
import { fromBerlinInput, toBerlinInput } from "../../src/lib/time.ts";
import { toCsv } from "../../src/services/reports-csv.ts";

test("Eingang braucht ein Ziel und ist immer voll", () => {
  assert.equal(resolveMovement({ kind: "RECEIPT", quantity: 5 }, true).ok, false);
  const r = resolveMovement({ kind: "RECEIPT", quantity: 5, toLocationId: "x" }, true);
  assert.ok(r.ok && r.from === null && r.to?.state === "FULL");
  assert.equal(resolveMovement({ kind: "RECEIPT", quantity: 5, toLocationId: "x", state: "EMPTY" }, true).ok, false);
});

test("Umlagerung behält den Zustand und braucht zwei verschiedene Orte", () => {
  const r = resolveMovement({ kind: "TRANSFER", quantity: 2, fromLocationId: "a", toLocationId: "b", state: "EMPTY" }, true);
  assert.ok(r.ok && r.from?.state === "EMPTY" && r.to?.state === "EMPTY");
  assert.equal(resolveMovement({ kind: "TRANSFER", quantity: 2, fromLocationId: "a", toLocationId: "a" }, true).ok, false);
});

test("Verbrauch: Pfandartikel voll → leer am selben Ort, sonst nur weg", () => {
  const pf = resolveMovement({ kind: "CONSUME", quantity: 3, fromLocationId: "a" }, true);
  assert.ok(pf.ok && pf.from?.state === "FULL" && pf.to?.state === "EMPTY" && pf.to.locationId === "a");
  const np = resolveMovement({ kind: "CONSUME", quantity: 3, fromLocationId: "a" }, false);
  assert.ok(np.ok && np.to === null);
});

test("Leergut zurück nur bei Pfandartikeln", () => {
  assert.equal(resolveMovement({ kind: "RETURN", quantity: 1, fromLocationId: "a" }, false).ok, false);
  const r = resolveMovement({ kind: "RETURN", quantity: 1, fromLocationId: "a" }, true);
  assert.ok(r.ok && r.from?.state === "EMPTY" && r.to === null);
});

test("Mengen: nur ganze Zahlen ≥ 1", () => {
  for (const q of [0, -1, 1.5, NaN, 1e9]) assert.equal(resolveMovement({ kind: "RECEIPT", quantity: q, toLocationId: "x" }, false).ok, false);
});

test("Inventur-Differenz", () => {
  const plus = adjustTo("a", "FULL", 10, 7);
  assert.ok(plus.ok && plus.to && plus.quantity === 3);
  const minus = adjustTo("a", "FULL", 4, 7);
  assert.ok(minus.ok && minus.from && minus.quantity === 3);
  assert.equal(adjustTo("a", "FULL", 7, 7).ok, false);
});

test("Bestand wird aus Zu- und Abgängen gefaltet; Nullbestände fallen weg", () => {
  const m = (q: number, f: string | null, t: string | null) => movementDeltas({ articleId: "w", quantity: q, fromLocationId: f, fromState: f ? "FULL" : null, toLocationId: t, toState: t ? "FULL" : null });
  const folded = foldStock([...m(10, null, "A"), ...m(10, "A", "B"), ...m(4, "B", null)]);
  assert.deepEqual([...folded.values()].map((d) => [d.locationId, d.quantity]), [["B", 6]]);
});

test("Ortsbaum, Pfad, Kühlung wird vererbt", () => {
  const locs = [
    { id: "1", name: "Stadthalle", code: null, parentId: null, sortOrder: 0, cooled: false },
    { id: "2", name: "Kühllager 2", code: null, parentId: "1", sortOrder: 0, cooled: true },
    { id: "3", name: "Nische", code: null, parentId: "2", sortOrder: 0, cooled: false },
  ];
  assert.equal(buildTree(locs)[0].children[0].children[0].loc.id, "3");
  assert.equal(pathName(locs, "3"), "Stadthalle › Kühllager 2 › Nische");
  assert.equal(isCooled(locs, "3"), true);
  assert.equal(isCooled(locs, "1"), false);
  assert.deepEqual(descendantIds(locs, "1").sort(), ["1", "2", "3"]);
});

test("Mehrzahl von Einheiten", () => {
  assert.equal(fmtQty(46, "Kiste"), "46 Kisten");
  assert.equal(fmtQty(1, "Kiste"), "1 Kiste");
  assert.equal(pluralUnit("Fass", 2), "Fässer");
  assert.equal(pluralUnit("Unbekannt", 2), "Unbekannt");
  assert.equal(singularUnit("Kisten"), "Kiste");
  assert.equal(singularUnit("karton"), "Karton");
});

test("Berliner Zeit: Sommer-/Winterzeit und Rundreise", () => {
  assert.equal(fromBerlinInput("2026-12-04T08:00")?.toISOString(), "2026-12-04T07:00:00.000Z");
  assert.equal(fromBerlinInput("2026-07-04T08:00")?.toISOString(), "2026-07-04T06:00:00.000Z");
  assert.equal(toBerlinInput(new Date("2026-12-04T07:00:00Z")), "2026-12-04T08:00");
  assert.equal(fromBerlinInput("kaputt"), null);
  assert.equal(fromBerlinInput("2026-03-29T02:30"), null, "gibt es wegen der Zeitumstellung nicht");
});

test("CSV: Semikolon, Anführungszeichen, Schutz vor Excel-Formeln", () => {
  const csv = toCsv([["a;b", 'sag "hi"', "=1+1", 5]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"a;b";"sag ""hi""";\'=1+1;5'));
});
