import "server-only";
import { prisma } from "@/db/prisma";
import { audit } from "./audit";

/**
 * Start-Lagerorte (aus der Beschreibung des Teams). Nur, wenn es noch keinen Ort gibt – danach alles in „Stammdaten“ änderbar.
 * Namen und Codes bitte an die Wirklichkeit anpassen (Räume im L, Gewölbekeller …).
 */
export async function seedDefaultLocations(userId: string | null): Promise<{ created: number }> {
  if ((await prisma.location.count()) > 0) return { created: 0 };
  const site = (name: string, sortOrder: number) => prisma.location.create({ data: { name, kind: "SITE", sortOrder } });
  const child = (parentId: string, name: string, kind: "ROOM" | "COLD", extra: { code?: string; cooled?: boolean; sortOrder?: number } = {}) =>
    prisma.location.create({ data: { name, parentId, kind, cooled: extra.cooled ?? kind === "COLD", code: extra.code ?? null, sortOrder: extra.sortOrder ?? 0 } });
  const gewoelbe = await site("Gewölbekeller", 10);
  await child(gewoelbe.id, "Kühlkammer", "COLD");
  const halle = await site("Stadthalle", 20);
  await child(halle.id, "Kühllager 1", "COLD", { sortOrder: 1 });
  await child(halle.id, "Kühllager 2", "COLD", { sortOrder: 2 });
  await prisma.location.create({ data: { name: "Kühlanhänger", kind: "TRAILER", cooled: true, sortOrder: 30 } });
  const l = await site("L", 40);
  await child(l.id, "L004", "ROOM", { code: "L004", sortOrder: 1 });
  await child(l.id, "L unten 2", "ROOM", { sortOrder: 2 });
  await child(l.id, "L oben", "ROOM", { sortOrder: 3 });
  await site("Z", 50);
  await site("G", 60);
  await audit("setup.seed_locations", { userId }, prisma);
  return { created: await prisma.location.count() };
}
