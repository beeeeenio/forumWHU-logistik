@AGENTS.md

# forumWHU Logistik
- Plan/Entscheidungen: `docs/PLAN.md`. Gleiche Bausteine wie `beeeeenio/participant-crm` und `Thomas6706/forumwhu-crm` (Auth, Deploy).
- Bestand wird nie gespeichert, nur aus `movements` berechnet. Löschen = Stornieren. Regeln in `src/lib/domain/` (rein, getestet), neue Buchungsarten dort + im DB-CHECK nachziehen.
- `"use server"`-Dateien dürfen nur async-Funktionen exportieren.
- Prüfen: `npx next typegen && npx tsc --noEmit && npm run lint && npm test && npm run test:db && npm run build`.
- Keine echten Bestandsdaten/Sicherungen ins Repo. Migrationen additiv.
