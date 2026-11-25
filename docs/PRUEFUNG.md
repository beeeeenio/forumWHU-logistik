# Prüfung der App (Stand: nach Phase 2)

Drei unabhängige Prüfungen (Handy/Bedienung/Barrierefreiheit, Code/Sicherheit/Korrektheit, Best-Practice-Recherche). Hier steht, was gefunden und was umgesetzt wurde.
**Hinweis:** Die Recherche konnte keine Web-Suche nutzen und beruht auf dem Wissen des Agenten; Quellen und Zahlen darin sind nicht geprüft.

## Umgesetzt
**Korrektheit / Sicherheit**
- Buchungen mit mehreren Artikeln sperren die Artikel in fester Reihenfolge (zuvor Deadlock bei gegenläufiger Reihenfolge, reproduziert) und wiederholen bei Deadlock automatisch.
- Offener Redirect nach dem Login geschlossen (`returnTo` mit Tab/Zeilenumbruch wurde durchgelassen); Test mit Umgehungsversuchen.
- Inventur rechnet innerhalb der Transaktion auf dem aktuellen Stand und nimmt den beim Öffnen gesehenen Bestand als Basis: Parallele Buchungen und Stornos werden nicht mehr überschrieben.
- Plan erledigen ist atomar (Plan sperren, buchen, verknüpfen in einer Transaktion); keine Phantombuchungen mehr.
- Letzter Administrator kann sich nicht mehr per gleichzeitiger Herabstufung aussperren.
- Neuer Artikel/Lieferant beim Buchen race-sicher; Doppelbuchungsschutz per Erfassungskennung; Sofort-Rückgängig (15 Minuten, nur eigene Buchungen).
- Excel-Import: Name und Alias derselben Ware werden zusammengefasst; Nachkommastellen werden nicht mehr still gerundet; Speichergrenzen (Zellenzahl, entpackte Größe, 1 GB Container-Limit).
- Datenbank erzwingt die Buchungsregeln (CHECK je Buchungsart, Storno-Grund) und schützt Buchungen vor nachträglicher inhaltlicher Änderung (Trigger).
- Cron-Endpunkt prüft zuerst das Geheimnis und ist im Caddy von außen gesperrt; Proxy-Pflicht in Produktion; Plan-Validierung; Mindestdatum für Nachbuchungen; CSV-Export schneidet nie still ab; PDF-Belege als Download.
- Deutsche Fehlerseiten (`error`, `global-error`, `not-found`).

**Handy / Bedienung / Barrierefreiheit**
- Alle Knöpfe und Links mindestens 44 px hoch (gemessen auf allen Hauptseiten, kein seitliches Überlaufen bei 390 px).
- Buchen: Formular zuerst, Schnellerfassung kompakt zugeklappt, fester Buchen-Knopf mit Hintergrund und Angabe, was noch fehlt, Bestätigung scrollt ins Bild, Pfeiltasten in den Auswahlgruppen.
- Auswertung und Journal: Filter zugeklappt, Ergebnisse zuerst, Matrix springt zu den neuesten Tagen; Kontraste von Warn-/Fehlerfarben, Eingaberahmen und Fokusring auf WCAG-AA-Niveau angehoben.
- Seitentitel für Ort/Artikel, „Zum Inhalt springen“, Rollen-Auswahl 16 px.

## Bewusst offen (mit Begründung)
- **Content-Security-Policy mit `unsafe-inline`:** von Next.js bedingt; kein konkreter XSS-Pfad gefunden.
- **Berechtigungsseite liefert HTTP 200 statt 403:** inhaltlich richtig, nur für Monitoring unschön.
- **Backup-Verschlüsselung (`openssl enc` ohne Integritätsprüfung):** besser `age`/`gpg --symmetric`; Wiederherstellungstest bitte einmal durchführen.
- **`audit()` schluckt Fehler:** bewusst, damit ein Protokollfehler keine Buchung verhindert.
- **Erstzuordnung per E-Mail-Attribut:** durch Mandanten-Prüfung auf Verzeichnis-Mitglieder begrenzt; spätere Logins nur per Objekt-ID.
- **Offline-Modus, Artikel-Barcode, Temperaturprotokoll, Zweitfreigabe, Chargen/MHD:** siehe `IDEEN.md`; für ein 13-köpfiges Team nicht zwingend.
