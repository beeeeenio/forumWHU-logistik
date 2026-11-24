// Legt die Start-Lagerorte an (nur wenn noch keiner existiert). Nutzung: docker compose run --rm tools npx tsx --conditions=react-server scripts/seed-orte.mts
import "dotenv/config";
import { seedDefaultLocations } from "../src/services/setup.ts";
import { prisma } from "../src/db/prisma.ts";

const r = await seedDefaultLocations(null);
console.log(r.created ? `${r.created} Lagerorte angelegt.` : "Es gibt schon Lagerorte – nichts geändert.");
await prisma.$disconnect();
