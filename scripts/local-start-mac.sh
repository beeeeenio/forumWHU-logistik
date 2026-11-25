#!/usr/bin/env bash
# Mac, ohne Docker: installiert (falls nötig) PostgreSQL und Node über Homebrew, richtet alles ein und startet http://localhost:3000.
# Aufruf im Projektordner: ./scripts/local-start-mac.sh   (beliebig oft wiederholbar)
set -euo pipefail
cd "$(dirname "$0")/.."
command -v brew >/dev/null || { echo "Homebrew fehlt. Erst installieren: https://brew.sh – danach dieses Skript noch einmal starten."; exit 1; }

brew list postgresql@17 >/dev/null 2>&1 || brew install postgresql@17
node_major=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
[ "${node_major:-0}" -ge 22 ] || brew install node
brew services start postgresql@17 >/dev/null
export PATH="/opt/homebrew/opt/postgresql@17/bin:/usr/local/opt/postgresql@17/bin:$PATH"

echo "• Warte auf die Datenbank …"
for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
pg_isready -q || { echo "PostgreSQL startet nicht. Versuche: brew services restart postgresql@17"; exit 1; }
createdb logistik 2>/dev/null || true
createdb logistik_shadow 2>/dev/null || true

if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_URL=postgresql://$(whoami)@localhost:5432/logistik
SHADOW_DATABASE_URL=postgresql://$(whoami)@localhost:5432/logistik_shadow
APP_URL=http://localhost:3000
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n=+/')
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
echo "→ Läuft gleich auf http://localhost:3000 – per Klick anmelden, dann auf der Lage-Seite „Start-Lagerorte anlegen“."
(sleep 6 && open http://localhost:3000) &
npm run dev
