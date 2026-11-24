#!/usr/bin/env bash
# Tägliche Sicherung der Datenbank (pg_dump) nach /opt/logistik/backups, 14 Tage aufbewahrt.
# Aufruf auf dem VPS (als Betriebsbenutzer), z. B. per cron: 15 3 * * * /opt/logistik/app/deploy/backup.sh
#
# Verschlüsselung (empfohlen, die Datei enthält alle Personendaten): Passphrase-Datei anlegen und in deploy/.env eintragen,
#   openssl rand -base64 32 > /opt/logistik/backup-passphrase && chmod 600 /opt/logistik/backup-passphrase
#   BACKUP_PASSPHRASE_FILE=/opt/logistik/backup-passphrase   (in deploy/.env oder als Umgebungsvariable)
# Die Passphrase an einem ANDEREN Ort sicher aufbewahren (ohne sie ist die Sicherung nicht lesbar).
# Wiederherstellen: siehe docs/DEPLOYMENT.md. Eine Kopie gehört zusätzlich außerhalb des Servers gespeichert.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
DIR="../../backups"
mkdir -p "$DIR" && chmod 700 "$DIR"
STAMP="$(date +%F-%H%M)"
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  [ -r "$BACKUP_PASSPHRASE_FILE" ] || { echo "Passphrase-Datei nicht lesbar: $BACKUP_PASSPHRASE_FILE" >&2; exit 1; }
  FILE="$DIR/logistik-$STAMP.sql.gz.enc"
  docker compose --env-file .env exec -T db sh -c 'pg_dump -U logistik "$POSTGRES_DB"' | gzip | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" > "$FILE"
else
  echo "Hinweis: unverschlüsselt (BACKUP_PASSPHRASE_FILE nicht gesetzt)." >&2
  FILE="$DIR/logistik-$STAMP.sql.gz"
  docker compose --env-file .env exec -T db sh -c 'pg_dump -U logistik "$POSTGRES_DB"' | gzip > "$FILE"
fi
chmod 600 "$FILE"
# leere oder winzige Dateien sind ein Fehler (z. B. Datenbank nicht erreichbar)
[ "$(wc -c < "$FILE")" -gt 1000 ] || { echo "Sicherung ist verdächtig klein, bitte prüfen: $FILE" >&2; exit 1; }
find "$DIR" -name 'logistik-*' -mtime +14 -delete
echo "Sicherung: $FILE"
