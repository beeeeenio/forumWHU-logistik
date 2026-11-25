// Demo-Testdaten zum Ausprobieren (erfundene Mengen, Pfandbeträge sind Beispielwerte). Nur in einer Datenbank ohne Buchungen.
// Nutzung: npm run db:demo      (vorher mindestens eine Person mit scripts/create-user.mts anlegen)
import "dotenv/config";
import { prisma } from "../src/db/prisma.ts";
import { bookMovements, type BookInput } from "../src/services/movements.ts";
import { submitCount } from "../src/services/inventory.ts";
import { createPlan } from "../src/services/plans.ts";
import { seedDefaultLocations } from "../src/services/setup.ts";

if ((await prisma.movement.count()) > 0) { console.error("Es gibt schon Buchungen – Demo-Daten nur in einer leeren Datenbank."); process.exit(1); }
const user = (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ?? (await prisma.user.findFirst());
if (!user) { console.error("Bitte zuerst eine Person anlegen: npx tsx scripts/create-user.mts \"Name\" mail@example.com ADMIN"); process.exit(1); }

await seedDefaultLocations(user.id);
const loc = async (name: string) => (await prisma.location.findFirstOrThrow({ where: { name } })).id;
const [L004, GK, KK, KL1, KA, SH] = await Promise.all(["L004", "Gewölbekeller", "Kühlkammer", "Kühllager 1", "Kühlanhänger", "Stadthalle"].map(loc));

const art = (name: string, data: { unit: string; returnable?: boolean; depositCents?: number; needsCooling?: boolean; minStock?: number; category: string; aliases?: string[] }) =>
  prisma.article.create({ data: { name, returnable: false, ...data } });
const wasser = await art("Mineralwasser", { unit: "Kiste", returnable: true, depositCents: 450, minStock: 20, category: "Getränke", aliases: ["Wasser", "Fachingen"] });
const saft = await art("Orangensaft", { unit: "Kiste", returnable: true, depositCents: 450, category: "Getränke" });
const wein = await art("Weißwein", { unit: "Karton", category: "Getränke" });
const brot = await art("Brötchen", { unit: "Karton", needsCooling: true, category: "Lebensmittel", aliases: ["Semmeln"] });
const butter = await art("Butter", { unit: "Karton", needsCooling: true, minStock: 10, category: "Lebensmittel" });
await art("Servietten", { unit: "Karton", category: "Material" });

const ago = (days: number, hour = 10) => { const d = new Date(Date.now() - days * 86_400_000); d.setHours(hour, 0, 0, 0); return d; };
const b = async (i: BookInput) => { const r = await bookMovements(user, [i]); if (!r.ok) throw new Error(r.error); };

// Lieferungen (Mittwoch)
await b({ kind: "RECEIPT", articleId: wasser.id, quantity: 46, toLocationId: L004, supplierName: "Staatlich Fachingen", occurredAt: ago(2, 15), source: "quick" });
await b({ kind: "RECEIPT", articleId: saft.id, quantity: 24, toLocationId: L004, supplierName: "Fruchtsaft Muster GmbH", occurredAt: ago(2, 16) });
await b({ kind: "RECEIPT", articleId: wein.id, quantity: 12, toLocationId: GK, supplierName: "Weingut Beispiel", occurredAt: ago(2, 17) });
await b({ kind: "RECEIPT", articleId: brot.id, quantity: 20, toLocationId: L004, supplierName: "Bäckerei Muster", occurredAt: ago(1, 7) }); // absichtlich ungekühlt → Hinweis
await b({ kind: "RECEIPT", articleId: butter.id, quantity: 8, toLocationId: KK, supplierName: "Molkerei Beispiel", occurredAt: ago(1, 8) }); // unter Mindestbestand → Hinweis
// Gestern: Umlagerungen, Verbrauch, Leergut
await b({ kind: "TRANSFER", articleId: wasser.id, quantity: 46, fromLocationId: L004, toLocationId: KA, occurredAt: ago(1, 12) });
await b({ kind: "TRANSFER", articleId: saft.id, quantity: 16, fromLocationId: L004, toLocationId: KL1, occurredAt: ago(1, 12) });
await b({ kind: "CONSUME", articleId: wasser.id, quantity: 20, fromLocationId: KA, occurredAt: ago(1, 22), source: "quick" });
await b({ kind: "TRANSFER", articleId: wasser.id, quantity: 20, fromLocationId: KA, toLocationId: L004, state: "EMPTY", occurredAt: ago(1, 23) });
await b({ kind: "CONSUME", articleId: saft.id, quantity: 6, fromLocationId: KL1, occurredAt: ago(0, 9) });
// Inventur mit Abweichung (Brötchen: gebucht 20, gezählt 18)
await submitCount(user, L004, [{ articleId: brot.id, state: "FULL", counted: 18 }, { articleId: saft.id, state: "FULL", counted: 8 }], "Demo");

// Pläne: einer überfällig, einer morgen früh, einer übermorgen
const plan = (hours: number, p: Omit<Parameters<typeof createPlan>[1], "dueAt">) => createPlan(user, { ...p, dueAt: new Date(Date.now() + hours * 3600_000) });
await plan(-3, { articleId: wein.id, quantity: 6, state: "FULL", fromLocationId: GK, toLocationId: SH, phase: "Weinprobe Freitag", note: "Demo: überfällig", });
await plan(14, { articleId: wasser.id, quantity: 23, state: "FULL", fromLocationId: KA, toLocationId: KL1, phase: "Frühstück Freitag", note: null });
await plan(38, { articleId: wasser.id, quantity: 20, state: "EMPTY", fromLocationId: L004, toLocationId: SH, phase: "Leergut Samstag", note: null });

console.log("Demo-Daten angelegt: 6 Artikel, 11 Buchungen, 1 Inventur, 3 Pläne. Erwartete Hinweise in der Lage: Brötchen ungekühlt, Butter unter Mindestbestand, Plan überfällig.");
await prisma.$disconnect();
