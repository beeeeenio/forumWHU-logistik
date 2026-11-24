# Deployment auf dem Hostinger-VPS

Gleiches Muster wie Participant-CRM: eigener Stack neben dem NFS-CRM, Datenbank ohne Port nach außen, öffentlich nur über den Caddy des NFS-Stacks. **Stand: vorbereitet, nichts auf dem Server ausgeführt.**

| | NFS-CRM | Participant-CRM | **Logistik** |
|---|---|---|---|
| Compose-Name | forumwhu-crm | participant-crm | **logistik** |
| Verzeichnis | /opt/forumwhu-crm | /opt/participant-crm | **/opt/logistik** |
| App-Port | 127.0.0.1:3000 | 127.0.0.1:3100 | **127.0.0.1:3200** |
| Domain | nfs.forumwhu.com | participants.forumwhu.com | **logistik.forumwhu.com** |

## Voraussetzungen (von dir)
1. **DNS:** A-Record `logistik` → VPS-IP.
2. **Entra-App-Registrierung** „forumWHU Logistik“ (Single Tenant): Redirect-URI (Web) `https://logistik.forumwhu.com/api/auth/microsoft/callback`; Client-Geheimnis erzeugen (Wert sofort kopieren); Mandanten-ID und Client-ID notieren. Berechtigungen: nur Anmelden (`openid profile email`).

## Schritte auf dem VPS
```bash
git clone https://github.com/beeeeenio/forumWHU-logistik /opt/logistik/app && cd /opt/logistik/app/deploy
cp .env.production.example .env && chmod 600 .env   # ausfüllen (Secrets mit openssl erzeugen, siehe Datei)
docker compose --env-file .env up -d --build db logistik-web
docker compose --env-file .env run --rm migrate
# ersten Administrator eintragen (Status PENDING, wird beim ersten Microsoft-Login verknüpft):
docker compose --env-file .env run --rm tools npx tsx scripts/create-user.mts "Benjamin Oßwald" benjamin.osswald@forumwhu.com ADMIN
curl -I http://127.0.0.1:3200/login     # erwartet 200
```
Alle weiteren Personen trägt der Administrator in der App unter **Personen** ein (Rolle Administrator / Mitglied / Betrachter).

**Proxy:** Block aus `deploy/Caddy-logistik.snippet` an die Caddyfile des NFS-Stacks anhängen (vorher Sicherungskopie), dann
```bash
cat Caddy-logistik.snippet >> /opt/forumwhu-crm/app/deploy/Caddyfile
docker exec forumwhu-crm-prod-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```
`logistik-web` hängt dafür im Netz `forumwhu-crm-prod_edge`; an der NFS-Compose-Datei ändert sich nichts. (Das Netz muss vorher existieren, also NFS-Stack läuft.)

**Start-Lagerorte** (optional, alternativ Knopf auf der Lage-Seite): `docker compose --env-file .env run --rm tools npx tsx --conditions=react-server scripts/seed-orte.mts`

## Betrieb
- **Update:** `git pull && docker compose --env-file .env up -d --build logistik-web`, bei Schemaänderungen vorher/nachher `run --rm migrate`.
- **Sicherung:** `deploy/backup.sh` per cron (`15 3 * * *`), pg_dump, 14 Tage, optional verschlüsselt (`BACKUP_PASSPHRASE_FILE`). Wiederherstellung einmal testen, bevor man sich darauf verlässt; eine Kopie außerhalb des Servers aufbewahren.
- **Health:** `/api/health` (Datenbank-Check) für Docker und Überwachung.
- **Rückweg:** vorheriger Commit neu bauen; Daten über die Sicherung.

## Sicherheit
Sitzungen: HttpOnly-Cookie `__Host-logi_session`, in der DB nur ein HMAC; gesperrte Personen verlieren den Zugriff sofort. Anmeldung mit PKCE, Nonce- und Tenant-Prüfung; Rate-Limit auf Login. Der Klick-Login (`AUTH_MODE=development`) bricht in Produktion beim Start ab. Container: read-only, ohne Capabilities, DB nur im internen Netz. CSP + Security-Header in `next.config.ts`. Bestandsdaten und Sicherungen nie ins Repo.
