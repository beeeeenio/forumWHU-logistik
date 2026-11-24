# forumWHU Logistik – Plan

**Ziel:** Ein ständiger Lagebericht für den Kongress. Jede Person im Team sieht jederzeit: *Was ist in welchem Raum, wie viel ist noch da, was soll wann wohin?* Erfassen geht in Sekunden am Handy, auch per Diktat („Staatlich Fachingen, 46 Kisten Mineralwasser in L004“).

Gebaut wie die Schwester-Apps (NFS-CRM, Participant-CRM): Next.js 16 · TypeScript · PostgreSQL 17 · Prisma 7 · Microsoft-Login (Entra, Single Tenant, keine Passwörter, keine Selbstregistrierung) · Docker auf dem Hostinger-VPS hinter dem Caddy des NFS-Stacks.

## Was gebraucht wird (aus der Sprachnachricht)

| Wunsch | Umsetzung |
|---|---|
| Was kommt rein, was kommt raus, in welchem Raum steht es | **Eingang / Umlagerung / Abgang**, Lagebericht je Ort |
| Ständiger Lagebericht | Startseite **Lage**: Orte als Karten mit Inhalt, Suche „wo liegt …?“, Warnungen |
| Lieferung per Sprache/Text erfassen | **Schnellerfassung** (Text, Diktat) → Entwurf → prüfen → buchen |
| Weitergeben: „von L004 nach Stadthalle, Kühlanhänger“ | **Umlagerung**, Bestand am Quellort wird geprüft |
| Kisten leer machen, Leergut tracken, abends ans L fahren | Pfandartikel zählen **voll / leer** getrennt; „Leer gemacht“ macht aus voll → leer am selben Ort; Leergut umlagern; **Pfand zurück** |
| Alle logistischen Bewegungen nachvollziehen | **Journal** (jede Bewegung, wer/wann), Storno statt Löschen, Excel-Export |
| Was soll wann wohin (Phasen: Gewölbekeller → Frühstück Fr/Sa) | **Plan**: Menge, von/nach, Termin, Anlass; „Erledigt“ bucht die Umlagerung |
| Mehrere Lager: Kühllager 1+2, Kühlanhänger, Kühlkammer, L unten/oben, Z, G | **Lagerorte** als Baum, Kühlung je Ort; Kühlware in ungekühltem Ort → Warnung |
| Team: hinzufügen, abrufen, löschen, nur Betrachter | Rollen **Administrator / Mitglied / Betrachter** |
| Handy-optimiert | Mobile-first, untere Tab-Leiste, große Tippflächen, als App installierbar (PWA) |
| Wie bei NFS-CRM: Login + auf den Server | Microsoft-Login, Docker-Stack, Caddy-Block, Backup, CI |

## Datenmodell (Kern)

**Der Bestand wird nicht gespeichert, sondern aus Bewegungen berechnet.** Jede Bewegung hat Quelle (Ort + Zustand) und/oder Ziel; der Bestand ist Summe(Zugänge) − Summe(Abgänge) ohne stornierte. Dadurch gibt es keine Zahl, die man nicht erklären kann, und Löschen verfälscht nichts (stornierte Buchungen bleiben mit Grund und Person sichtbar).

- **Lagerort** (Baum: Gebäude → Raum), Kurzcode (`L004`), `gekühlt`
- **Artikel** (Einheit, Pfandartikel + Pfandbetrag, kühlpflichtig, Schreibweisen für die Spracherkennung)
- **Lieferant** (entsteht auch beim Erfassen eines Eingangs)
- **Bewegung**: `Eingang · Umlagerung · Verbraucht · Leergut zurück · Abgang · Korrektur (Inventur)`
- **Plan** (Soll), **Person/Sitzung/Protokoll**

Regeln stehen als reine Funktionen in `src/lib/domain/` (getestet) und zusätzlich als CHECK-Constraints in der Datenbank. Gleichzeitiges Buchen desselben Artikels läuft nacheinander (Advisory-Lock) – zwei Leute können dieselben 10 Kisten nicht doppelt abbuchen (Test mit 8 parallelen Buchungen).

## Phasen

### Phase 1 – umgesetzt (dieser Stand)
Login + Rollen · Lagerorte/Artikel/Lieferanten · Buchen (6 Arten, mehrere Zeilen alles-oder-nichts, nachträglich mit Zeitpunkt) · Schnellerfassung (deterministischer Parser, Diktat im Browser) · Lage mit Warnungen (Minusbestand, Kühlung, überfällige Pläne) · Orts- und Artikelseiten mit Schnellaktionen · Plan · Leergut & Pfand · Journal + Storno + CSV · Personenverwaltung + Protokoll · Docker/Caddy/Backup/CI.

### Phase 2 – begonnen
1. ✅ **Inventurmodus** (`/inventur`): Raum wählen, zählen („stimmt“ oder Zahl), nur Abweichungen werden als Korrekturen gebucht – alles in einer Transaktion; Pfandartikel werden voll und leer gezählt; nicht gebuchte Funde lassen sich hinzufügen.
2. ✅ **QR-Codes pro Lagerort** (`/qr`, Druckansicht): Scan öffnet den Ort (Inhalt, Eingang hier, Umlagern, Inventur hier); nicht Angemeldete werden erst zum Microsoft-Login geleitet und landen danach im Ort. QR enthält nur die Adresse, keine Daten.

3. ✅ **Beleg-Foto / PDF an Buchungen** (Journal, Ortsseiten): Kamera oder Datei, bis 6 MB, JPEG/PNG/WebP/PDF – der Typ wird an den Bytes geprüft (HTML/SVG werden abgelehnt), Auslieferung nur angemeldet, `nosniff` + Sandbox-CSP; Bytes liegen in der Datenbank und damit in der Sicherung.
4. ✅ **Mindestbestand** je Artikel (voll/vorrätig über alle Orte): Unterschreitung erscheint als Hinweis in der Lage.
5. ✅ **Benachrichtigung** per Webhook (Teams/Slack) über Cron: `POST /api/cron/alerts`, geschützt durch `CRON_SECRET`, keine Wiederholung bei unveränderter Lage.

Bewusst **nicht** umgesetzt: *Soll je Phase* (Bedarf pro Anlass gegen Bestand) und *Mindesthaltbarkeit/Chargen*. Der Bestand wird je (Artikel, Ort, Zustand) gezählt – Chargen bräuchten eine zusätzliche Dimension im Bestandsmodell und sollten erst nach Praxiserfahrung im Kongress festgelegt werden. Der Plan deckt das „was soll wohin“ bereits ab.

### Phase 3 – Verzahnung
1. **NFS-CRM-Anbindung**: gewonnene Sachsponsoring-Deals (z. B. „Staatlich Fachingen · 2027“) erzeugen erwartete Lieferungen im Plan; Eingang bucht zurück in den Deal („geliefert“).
2. **Claude als Erfasser** (wie beim CRM über MCP, Claude schlägt vor, Mensch bestätigt): Sprachnachricht/Foto → Buchungsvorschlag; „Was fehlt für Samstag?“.
3. Offline-Modus (Keller ohne Empfang): Buchungen lokal sammeln, später senden.

## Entscheidungen und Annahmen (bitte prüfen)
- **Adresse:** `logistik.forumwhu.com` (Port 3200 auf dem VPS). Andere Adresse → nur `APP_URL`, Caddy-Block und Entra-Redirect ändern.
- **Start-Lagerorte** sind aus der Nachricht abgeleitet: Gewölbekeller (Kühlkammer), Stadthalle (Kühllager 1, 2), Kühlanhänger, L (L004, „L unten 2“, „L oben“), Z, G. Welcher Raum im L welcher ist, ist geraten → in Stammdaten umbenennen.
- **Pfandbeträge** sind nicht vorbelegt (unbekannt) → je Artikel eintragen, sonst zeigt „Leergut & Pfand“ 0 €.
- **Kein KI-API-Aufruf**: Die Schnellerfassung ist regelbasiert (wie das CRM ohne Anthropic-Abhängigkeit). Sie füllt nur vor; gebucht wird nach Prüfung.
- **Mengen sind ganze Zahlen** (Kisten, Stück). Für „halbe Palette“ lieber eine passende Einheit wählen.
- **Löschen = Stornieren** (Grund Pflicht). Stammdaten werden archiviert, wenn sie benutzt wurden.

## Bekannte Grenzen
- Docker-Image und Compose-Datei sind hier **nicht gebaut/gestartet** worden (kein Docker-Daemon in der Entwicklungsumgebung); `next build`, Tests und Browser-Durchlauf liefen lokal gegen PostgreSQL. Erster Start auf dem Server: siehe `DEPLOYMENT.md`.
- Die **Microsoft-Anmeldung** ist nach Vorlage der Schwester-Apps gebaut, aber **nicht gegen echtes Entra getestet** (lokal läuft der Klick-Login nur mit `AUTH_MODE=development`, in Produktion verboten).
- Diktat nutzt die Spracherkennung des Browsers (Chrome/Edge/Safari); wo sie fehlt, hilft die Mikrofon-Taste der Handy-Tastatur.
