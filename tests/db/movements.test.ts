import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, seed } from "./helpers.ts";
import { bookMovements, voidMovement } from "../../src/services/movements.ts";
import { stockRows, stockAt } from "../../src/services/stock.ts";
import { completePlan, createPlan } from "../../src/services/plans.ts";
import { getLage, getPfand } from "../../src/services/reports.ts";
import { removeArticle, removeLocation, saveLocation } from "../../src/services/catalog.ts";

let d: Awaited<ReturnType<typeof seed>>;
before(async () => { d = await seed(); });
after(async () => { await prisma.$disconnect(); });

const q = async (a: string, l: string, s: "FULL" | "EMPTY") => stockAt(prisma, a, l, s);

test("Szenario aus der Nachricht: Eingang → Umlagerung → leer → Leergut zurück", async () => {
  const { user, wasser, L004, KA, SH } = d;
  // Staatlich Fachingen liefert 46 Kisten nach L004
  const r1 = await bookMovements(user, [{ kind: "RECEIPT", articleId: wasser.id, quantity: 46, toLocationId: L004.id, supplierName: "Staatlich Fachingen", source: "quick" }]);
  assert.ok(r1.ok);
  assert.equal(await q(wasser.id, L004.id, "FULL"), 46);
  // Freitag: 46 Kisten von L004 in den Kühlanhänger
  assert.ok((await bookMovements(user, [{ kind: "TRANSFER", articleId: wasser.id, quantity: 46, fromLocationId: L004.id, toLocationId: KA.id }])).ok);
  assert.equal(await q(wasser.id, L004.id, "FULL"), 0);
  assert.equal(await q(wasser.id, KA.id, "FULL"), 46);
  // 20 Kisten verbraucht → werden Leergut am selben Ort
  assert.ok((await bookMovements(user, [{ kind: "CONSUME", articleId: wasser.id, quantity: 20, fromLocationId: KA.id }])).ok);
  assert.equal(await q(wasser.id, KA.id, "FULL"), 26);
  assert.equal(await q(wasser.id, KA.id, "EMPTY"), 20);
  // Abends: Leergut vom Kühlanhänger zurück nach L004
  assert.ok((await bookMovements(user, [{ kind: "TRANSFER", articleId: wasser.id, quantity: 20, fromLocationId: KA.id, toLocationId: L004.id, state: "EMPTY" }])).ok);
  assert.equal(await q(wasser.id, KA.id, "EMPTY"), 0);
  assert.equal(await q(wasser.id, L004.id, "EMPTY"), 20);
  // Pfand zurückgegeben
  assert.ok((await bookMovements(user, [{ kind: "RETURN", articleId: wasser.id, quantity: 20, fromLocationId: L004.id }])).ok);
  const pfand = await getPfand();
  const line = pfand.lines.find((l) => l.article.id === wasser.id)!;
  assert.equal(line.empty, 0);
  assert.equal(line.full, 26);
  assert.equal(line.returned, 20);
  void SH;
});

test("Zu wenig Bestand: Buchung wird abgelehnt, mit force gebucht und im Lagebericht markiert", async () => {
  const { user, wasser, SH } = d;
  const r = await bookMovements(user, [{ kind: "TRANSFER", articleId: wasser.id, quantity: 5, fromLocationId: SH.id, toLocationId: d.L004.id }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "INSUFFICIENT");
  const forced = await bookMovements(user, [{ kind: "TRANSFER", articleId: wasser.id, quantity: 5, fromLocationId: SH.id, toLocationId: d.L004.id, force: true }]);
  assert.ok(forced.ok);
  assert.equal(await q(wasser.id, SH.id, "FULL"), -5);
  const lage = await getLage();
  assert.ok(lage.alerts.some((a) => a.kind === "NEGATIVE"));
});

test("Leergut gibt es nur bei Pfandartikeln", async () => {
  const { user, brot, L004 } = d;
  const r = await bookMovements(user, [{ kind: "RECEIPT", articleId: brot.id, quantity: 10, toLocationId: L004.id }]);
  assert.ok(r.ok);
  const bad = await bookMovements(user, [{ kind: "RETURN", articleId: brot.id, quantity: 1, fromLocationId: L004.id }]);
  assert.equal(bad.ok, false);
  // Verbrauch bei Artikel ohne Pfand: einfach weg, kein Leergut
  assert.ok((await bookMovements(user, [{ kind: "CONSUME", articleId: brot.id, quantity: 4, fromLocationId: L004.id }])).ok);
  assert.equal(await q(brot.id, L004.id, "FULL"), 6);
  assert.equal(await q(brot.id, L004.id, "EMPTY"), 0);
});

test("Kühlware in ungekühltem Raum löst einen Hinweis aus", async () => {
  const lage = await getLage();
  assert.ok(lage.alerts.some((a) => a.kind === "COOLING" && a.text.includes("Brötchen")));
});

test("Storno: Buchung zählt nicht mehr, bleibt im Journal, Grund ist Pflicht", async () => {
  const { user, brot, L004 } = d;
  const r = await bookMovements(user, [{ kind: "RECEIPT", articleId: brot.id, quantity: 7, toLocationId: L004.id }]);
  assert.ok(r.ok);
  if (!r.ok) return;
  const before = await q(brot.id, L004.id, "FULL");
  assert.equal((await voidMovement(user, r.ids[0], "")).ok, false);
  assert.ok((await voidMovement(user, r.ids[0], "falsche Menge")).ok);
  assert.equal(await q(brot.id, L004.id, "FULL"), before - 7);
  const m = await prisma.movement.findUnique({ where: { id: r.ids[0] } });
  assert.ok(m?.voidedAt);
  assert.equal((await voidMovement(user, r.ids[0], "nochmal")).ok, false);
});

test("Inventur: Bestand wird auf die gezählte Menge gesetzt", async () => {
  const { user, brot, L004 } = d;
  const cur = await q(brot.id, L004.id, "FULL");
  assert.equal((await bookMovements(user, [{ kind: "ADJUST", articleId: brot.id, quantity: cur + 3, fromLocationId: L004.id }])).ok, false, "Notiz ist Pflicht");
  assert.ok((await bookMovements(user, [{ kind: "ADJUST", articleId: brot.id, quantity: cur + 3, fromLocationId: L004.id, note: "Inventur Freitag" }])).ok);
  assert.equal(await q(brot.id, L004.id, "FULL"), cur + 3);
  assert.ok((await bookMovements(user, [{ kind: "ADJUST", articleId: brot.id, quantity: 2, fromLocationId: L004.id, note: "Inventur Samstag" }])).ok);
  assert.equal(await q(brot.id, L004.id, "FULL"), 2);
  assert.equal((await bookMovements(user, [{ kind: "ADJUST", articleId: brot.id, quantity: 2, fromLocationId: L004.id, note: "nochmal" }])).ok, false, "keine Differenz");
});

test("Mehrere Zeilen sind alles-oder-nichts", async () => {
  const { user, wasser, brot, L004 } = d;
  const countBefore = await prisma.movement.count();
  const r = await bookMovements(user, [
    { kind: "RECEIPT", articleId: wasser.id, quantity: 3, toLocationId: L004.id },
    { kind: "RECEIPT", articleId: brot.id, quantity: 0, toLocationId: L004.id },
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.index, 1);
  assert.equal(await prisma.movement.count(), countBefore);
});

test("Neuer Artikel und neuer Lieferant entstehen direkt bei der Buchung", async () => {
  const { user, L004 } = d;
  const r = await bookMovements(user, [{ kind: "RECEIPT", newArticle: { name: "Butterbrezeln", unit: "Karton", returnable: false }, quantity: 12, toLocationId: L004.id, supplierName: "Bäckerei Muster" }]);
  assert.ok(r.ok);
  assert.ok(await prisma.article.findFirst({ where: { name: "Butterbrezeln" } }));
  assert.ok(await prisma.supplier.findFirst({ where: { name: "Bäckerei Muster" } }));
});

test("Gleichzeitiges Buchen überbucht nie (Sperre je Artikel)", async () => {
  const { user, wasser, KA, L004 } = d;
  // Genau 10 Kisten im Kühlanhänger herstellen
  const have = await q(wasser.id, KA.id, "FULL");
  if (have > 10) assert.ok((await bookMovements(user, [{ kind: "WRITE_OFF", articleId: wasser.id, quantity: have - 10, fromLocationId: KA.id }])).ok);
  if (have < 10) assert.ok((await bookMovements(user, [{ kind: "RECEIPT", articleId: wasser.id, quantity: 10 - have, toLocationId: KA.id }])).ok);
  assert.equal(await q(wasser.id, KA.id, "FULL"), 10);
  // 8 Leute wollen gleichzeitig je 3 Kisten umlagern: nur 3 können klappen (9 ≤ 10), alle anderen müssen abgelehnt werden
  const results = await Promise.all(Array.from({ length: 8 }, () => bookMovements(user, [{ kind: "TRANSFER", articleId: wasser.id, quantity: 3, fromLocationId: KA.id, toLocationId: L004.id }])));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(await q(wasser.id, KA.id, "FULL"), 1);
});

test("Plan erledigen bucht die Umlagerung; Storno öffnet den Plan wieder", async () => {
  const { user, wasser, L004, SH } = d;
  await bookMovements(user, [{ kind: "RECEIPT", articleId: wasser.id, quantity: 30, toLocationId: L004.id }]);
  const p = await createPlan(user, { articleId: wasser.id, quantity: 12, state: "FULL", fromLocationId: L004.id, toLocationId: SH.id, dueAt: new Date(Date.now() + 3600_000), phase: "Frühstück Freitag", note: null });
  assert.ok(p.ok);
  if (!p.ok) return;
  const before = await q(wasser.id, SH.id, "FULL");
  const done = await completePlan(user, p.id, false);
  assert.ok(done.ok);
  assert.equal(await q(wasser.id, SH.id, "FULL"), before + 12);
  assert.equal((await prisma.plan.findUnique({ where: { id: p.id } }))?.status, "DONE");
  assert.equal((await completePlan(user, p.id, false)).ok, false, "nicht zweimal");
  if (done.ok) assert.ok((await voidMovement(user, done.ids[0], "Fehler")).ok);
  assert.equal((await prisma.plan.findUnique({ where: { id: p.id } }))?.status, "OPEN");
});

test("Archivieren nur ohne Bestand; Löschen nur ohne Verwendung", async () => {
  const { user, KA, L004 } = d;
  assert.equal((await removeLocation(user, L004.id, "archive")).ok, false, "hier liegt Ware");
  assert.equal((await removeLocation(user, KA.id, "delete")).ok, false, "wurde verwendet");
  const leer = await saveLocation(user, null, { name: "Leer", code: null, parentId: null, kind: "ROOM", cooled: false, note: null, sortOrder: 0 });
  assert.ok(leer.ok);
  if (leer.ok) assert.ok((await removeLocation(user, leer.id, "delete")).ok);
  assert.equal((await removeArticle(user, d.wasser.id, "delete")).ok, false);
});

test("Kurzcode ist eindeutig, ohne Beachtung der Schreibweise", async () => {
  const r = await saveLocation(d.user, null, { name: "Doppelt", code: "l004", parentId: null, kind: "ROOM", cooled: false, note: null, sortOrder: 0 });
  assert.equal(r.ok, false);
});

test("Bestand ist die Summe der Bewegungen (Gegenprobe)", async () => {
  const rows = await stockRows(prisma);
  const moves = await prisma.movement.findMany({ where: { voidedAt: null } });
  let sum = 0;
  for (const m of moves) { if (m.toLocationId) sum += m.quantity; if (m.fromLocationId) sum -= m.quantity; }
  assert.equal(rows.reduce((s, r) => s + r.quantity, 0), sum);
});

test("Inventur: nur Abweichungen werden gebucht, alles in einer Transaktion", async () => {
  const { submitCount } = await import("../../src/services/inventory.ts");
  const { user, wasser, brot, L004 } = d;
  const w = await q(wasser.id, L004.id, "FULL");
  const b = await q(brot.id, L004.id, "FULL");
  const before = await prisma.movement.count();
  const r = await submitCount(user, L004.id, [
    { articleId: wasser.id, state: "FULL", counted: w },
    { articleId: brot.id, state: "FULL", counted: b + 4 },
    { articleId: wasser.id, state: "EMPTY", counted: 3 },
  ], "Freitagabend");
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.changed, 2); assert.equal(r.same, 1); }
  assert.equal(await prisma.movement.count(), before + 2);
  assert.equal(await q(brot.id, L004.id, "FULL"), b + 4);
  assert.equal(await q(wasser.id, L004.id, "EMPTY"), 3);
  const again = await submitCount(user, L004.id, [{ articleId: brot.id, state: "FULL", counted: b + 4 }], "");
  assert.ok(again.ok && again.changed === 0);
  const bad = await submitCount(user, L004.id, [{ articleId: brot.id, state: "EMPTY", counted: 1 }], "");
  assert.equal(bad.ok, false, "Brötchen haben kein Leergut");
});
