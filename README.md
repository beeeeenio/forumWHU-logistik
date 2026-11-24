# forumWHU Logistik

Bestand, Lagerorte, Bewegungen und Leergut für den forumWHU-Kongress: ein ständiger Lagebericht, den das ganze Team am Handy pflegt und abruft.

Plan und Umfang: [docs/PLAN.md](docs/PLAN.md) · Bedienung: [docs/BEDIENUNG.md](docs/BEDIENUNG.md) · Server: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Lokal starten
```bash
cp .env.example .env          # DATABASE_URL, SESSION_SECRET setzen; AUTH_MODE=development für den Klick-Login
npm install
npx prisma migrate deploy
npx tsx scripts/create-user.mts "Dein Name" du@forumwhu.com ADMIN
npm run dev                   # http://localhost:3000
```
## Prüfen
`npm run verify` (Schema, Typen, Lint, Unit-Tests, Build) und `npm run test:db` (Datenbanktests gegen eine leere PostgreSQL, `TEST_DATABASE_URL`).

## Aufbau
`src/lib/domain/` Regeln, Bestandsrechnung, Ortsbaum, Schnellerfassungs-Parser (rein, getestet) · `src/services/` Datenbank-Logik · `src/app/` Seiten und Server-Aktionen · `deploy/` Docker/Caddy/Backup.
