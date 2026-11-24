// Trägt eine Person vorab ein (Status PENDING). Beim ersten Microsoft-Login wird sie über die E-Mail-Adresse verknüpft.
// Der erste Administrator muss so angelegt werden; alle weiteren trägt er in der App unter „Personen“ ein.
// Nutzung: npx tsx scripts/create-user.mts "Vorname Nachname" name@forumwhu.com [ADMIN|MEMBER|VIEWER]
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const [displayName, emailRaw, roleRaw = "MEMBER"] = process.argv.slice(2);
if (!displayName || !emailRaw || !["ADMIN", "MEMBER", "VIEWER"].includes(roleRaw)) {
  console.error('Nutzung: npx tsx scripts/create-user.mts "Anzeigename" name@firma.de [ADMIN|MEMBER|VIEWER]');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const email = emailRaw.trim();
const user = await prisma.user.upsert({
  where: { normalizedEmail: email.toLowerCase() },
  update: { displayName, role: roleRaw as "ADMIN" | "MEMBER" | "VIEWER" },
  create: { email, normalizedEmail: email.toLowerCase(), displayName, role: roleRaw as "ADMIN" | "MEMBER" | "VIEWER" },
});
console.log(`Person bereit: ${user.displayName} · ${user.role} · ${user.status}`);
await prisma.$disconnect();
