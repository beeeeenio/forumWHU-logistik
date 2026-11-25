# Bedienung in 2 Minuten

**Lage** (Startseite): Was liegt gerade wo? Oben Warnungen (Minusbestand, Kühlware ohne Kühlung, überfällige Pläne). Tippe einen Ort an → Inhalt mit Knöpfen **Umlagern / Leer gemacht / Pfand zurück / Zählen**.

**Buchen** (orangener Knopf unten):
- *Schnell erfassen:* schreiben oder diktieren, z. B.
  - `Staatlich Fachingen, 46 Kisten Mineralwasser in L004` → Eingang
  - `46 Kisten Mineralwasser von L004 nach Stadthalle Kühlanhänger` → Umlagerung
  - `20 Kisten Mineralwasser leer in Stadthalle` → 20 Kisten voll → leer
  - `Leergut 20 Kisten Mineralwasser von Stadthalle nach L004` → Leergut umlagern
  - `Pfand zurück 20 Kisten Mineralwasser aus L004` → Leergut zurückgegeben
  - `Inventur Mineralwasser L004 gezählt 30` → Bestand auf 30 setzen
  Mehrere Zeilen = mehrere Buchungen. **Zeilen erkennen**, unten prüfen/ändern, **Buchen**.
- Reicht der Bestand am Quellort nicht, wird abgelehnt – mit „Trotzdem buchen“ (Bestand wird negativ und rot markiert).

**Plan:** Soll festhalten („23 Kisten Gewölbekeller → Kühllager 1, Fr 08:00, Frühstück Freitag“); **Erledigt** bucht die Umlagerung.

**Leergut & Pfand:** voll/leer/zurück je Artikel, Pfandwert, wo das Leergut liegt.

**Inventur:** Menü → Inventur (oder „Inventur hier“ auf der Ortsseite). Raum zählen, bei jeder Zeile Zahl eintragen oder „stimmt“ tippen; unten stehen die Abweichungen als Knopf. Mit „Prüfen“ siehst du vor dem Buchen alle Abweichungen (große sind markiert – lieber nachzählen). Gebucht werden nur Differenzen, mit Notiz im Journal. **Falsch gezählt?** Direkt danach oder später unter Inventur → „Frühere Inventuren“ die ganze Zählung zurücknehmen (mit Grund) und neu zählen.

**Demo-Daten zum Ausprobieren:** `npm run db:demo` (nur in leerer Datenbank).

**Belege:** Im Journal (und auf Orts-/Artikelseiten) bei einer Buchung „Beleg / Foto“ tippen: Lieferschein fotografieren oder PDF wählen. Antippen vergrößert, ✕ entfernt.

**Mindestbestand:** Bei einem Artikel in den Stammdaten eintragen; unterschreitet der Vorrat (voll, alle Orte) die Grenze, warnt die Lage – auf Wunsch auch per Teams/Slack.

**QR-Etiketten:** Mehr → QR-Etiketten → Drucken, an Türen und Regale kleben. Handy-Kamera scannen öffnet den Ort in der App (Anmeldung nötig).

**Journal:** alle Buchungen filtern, **Stornieren** (mit Grund; Buchung bleibt sichtbar, zählt nicht mehr), **Als Vorlage**, Excel-Export.

**Rollen:** Betrachter sehen alles, ändern nichts. Mitglieder buchen, planen, pflegen Stammdaten. Administratoren verwalten zusätzlich Personen.

**Aufs Handy:** Seite im Browser öffnen → „Zum Home-Bildschirm“.
