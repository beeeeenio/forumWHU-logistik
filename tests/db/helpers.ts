// Gemeinsame Hilfen der Datenbanktests: Umgebung setzen, Tabellen leeren, Grunddaten anlegen.
process.env.DATABASE_URL ??= "postgresql://logi@127.0.0.1:5432/logistik_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-only-session-secret-0123456789abcdef0123456789";
process.env.AUTH_MODE ??= "development";

const { prisma } = await import("../../src/db/prisma.ts");
export { prisma };

export async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "plans", "movements", "articles", "suppliers", "locations", "audit_events", "sessions", "users" RESTART IDENTITY CASCADE');
}

export async function seed() {
  await reset();
  const user = await prisma.user.create({ data: { email: "t@x.de", normalizedEmail: "t@x.de", displayName: "Tester", role: "ADMIN", status: "ACTIVE" } });
  const L = await prisma.location.create({ data: { name: "L", kind: "SITE" } });
  const L004 = await prisma.location.create({ data: { name: "L004", code: "L004", parentId: L.id } });
  const SH = await prisma.location.create({ data: { name: "Stadthalle", kind: "SITE" } });
  const KA = await prisma.location.create({ data: { name: "Kühlanhänger", kind: "TRAILER", cooled: true } });
  const wasser = await prisma.article.create({ data: { name: "Mineralwasser", unit: "Kiste", returnable: true, depositCents: 450 } });
  const brot = await prisma.article.create({ data: { name: "Brötchen", unit: "Karton", needsCooling: true } });
  return { user, L, L004, SH, KA, wasser, brot };
}
