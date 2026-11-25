#!/usr/bin/env bash
# Startet Logistik komplett lokal zum Ansehen: Datenbank (Docker), .env, Abhängigkeiten, Migration, Testnutzer, Dev-Server.
# Voraussetzung: Node 22+, Docker. Aufruf im Projektordner: ./scripts/local-start.sh   → http://localhost:3000
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Docker fehlt (alternativ eine eigene PostgreSQL und DATABASE_URL in .env setzen)."; exit 1; }

docker start logistik-db >/dev/null 2>&1 || docker run -d --name logistik-db -e POSTGRES_PASSWORD=logi -e POSTGRES_DB=logistik -p 5432:5432 postgres:17-alpine >/dev/null
echo "• Warte auf die Datenbank …"
until docker exec logistik-db pg_isready -U postgres -d logistik >/dev/null 2>&1; do sleep 1; done
docker exec logistik-db psql -U postgres -c "create database logistik_shadow" >/dev/null 2>&1 || true

if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_URL=postgresql://postgres:logi@localhost:5432/logistik
SHADOW_DATABASE_URL=postgresql://postgres:logi@localhost:5432/logistik_shadow
APP_URL=http://localhost:3000
SESSION_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | head -c 48)
AUTH_MODE=development
ENV
  echo "• .env angelegt"
fi

npm install
npx prisma migrate deploy
npx tsx scripts/create-user.mts "Admin (Test)" admin@example.com ADMIN
npx tsx scripts/create-user.mts "Mitglied (Test)" mitglied@example.com MEMBER
npx tsx scripts/create-user.mts "Betrachter (Test)" betrachter@example.com VIEWER
echo
echo "→ http://localhost:3000  (Anmeldung per Klick; auf der Lage-Seite „Start-Lagerorte anlegen“)"
npm run dev
