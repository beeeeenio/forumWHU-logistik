import { test } from "node:test";
import assert from "node:assert/strict";
import { afterLines, unusualQuantity } from "../../src/lib/domain/preview.ts";

const stock: Record<string, number> = { "A|FULL": 46, "A|EMPTY": 2, "B|FULL": 0 };
const base = { returnable: true, stockOf: (l: string, s: "FULL" | "EMPTY") => stock[`${l}|${s}`] ?? 0, nameOf: (l: string) => `Ort ${l}` };

test("Bestand danach je Buchungsart", () => {
  assert.deepEqual(afterLines({ ...base, kind: "RECEIPT", quantity: 10, state: "FULL", fromId: null, toId: "B" }).map((l) => l.text), ["Ort B: 0 → 10 voll"]);
  assert.deepEqual(afterLines({ ...base, kind: "TRANSFER", quantity: 46, state: "FULL", fromId: "A", toId: "B" }).map((l) => l.text), ["Ort A: 46 → 0 voll", "Ort B: 0 → 46 voll"]);
  assert.deepEqual(afterLines({ ...base, kind: "CONSUME", quantity: 20, state: "FULL", fromId: "A", toId: null }).map((l) => l.text), ["Ort A: 46 → 26 voll", "Ort A: 2 → 22 leer"]);
  assert.deepEqual(afterLines({ ...base, returnable: false, kind: "CONSUME", quantity: 5, state: "FULL", fromId: "A", toId: null }).map((l) => l.text), ["Ort A: 46 → 41"]);
  assert.deepEqual(afterLines({ ...base, kind: "RETURN", quantity: 2, state: "EMPTY", fromId: "A", toId: null }).map((l) => l.text), ["Ort A: 2 → 0 leer"]);
  assert.deepEqual(afterLines({ ...base, kind: "ADJUST", quantity: 40, state: "FULL", fromId: "A", toId: null }).map((l) => l.text), ["Ort A: 46 → 40 voll"]);
});

test("Minusbestand wird als Warnung markiert, ungültige Mengen ergeben nichts", () => {
  const l = afterLines({ ...base, kind: "TRANSFER", quantity: 50, state: "FULL", fromId: "A", toId: "B" });
  assert.equal(l[0].warn, true);
  assert.equal(l[1].warn, false);
  assert.deepEqual(afterLines({ ...base, kind: "RECEIPT", quantity: NaN, state: "FULL", fromId: null, toId: "B" }), []);
  assert.deepEqual(afterLines({ ...base, kind: "RECEIPT", quantity: 0, state: "FULL", fromId: null, toId: "B" }), []);
});

test("Auffällig große Mengen (Tippfehler 100 statt 10)", () => {
  assert.equal(unusualQuantity(100, 10), true);
  assert.equal(unusualQuantity(12, 10), false);
  assert.equal(unusualQuantity(30, 10), false, "unter 5-fach");
  assert.equal(unusualQuantity(10, 1), false, "kleine Differenz");
  assert.equal(unusualQuantity(50, undefined), false, "keine Vergleichswerte");
});
