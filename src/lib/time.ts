// Zeiten: gespeichert wird UTC, angezeigt und eingegeben wird in Berliner Zeit (der Kongress findet in Vallendar statt).
export const TZ = "Europe/Berlin";

const dateTime = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const fmtDateTime = (d: Date) => dateTime.format(d);
export const fmtDate = (d: Date) => dateOnly.format(d);
export const fmtTime = (d: Date) => timeOnly.format(d);

/** „Fr., 04.12., 08:00“ → für Listen. Heute/Morgen werden ausgeschrieben. */
export function fmtRelativeDay(d: Date, now = new Date()): string {
  const key = (x: Date) => parts.format(x).slice(0, 10);
  const today = key(now);
  const tomorrow = key(new Date(now.getTime() + 86_400_000));
  const k = key(d);
  if (k === today) return `heute, ${fmtTime(d)}`;
  if (k === tomorrow) return `morgen, ${fmtTime(d)}`;
  return fmtDateTime(d);
}

/** Wert für <input type="datetime-local"> in Berliner Zeit („2026-12-04T08:00“). */
export function toBerlinInput(d: Date): string {
  const p = parts.format(d); // „2026-12-04, 08:00“
  return p.replace(", ", "T").replace(/ |\s/g, "");
}

/** Berliner Ortszeit („2026-12-04T08:00“) → Zeitpunkt (UTC). Berücksichtigt Sommer-/Winterzeit; null bei ungültiger Eingabe. */
export function fromBerlinInput(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, da, h, mi] = m.slice(1).map(Number);
  const wanted = Date.UTC(y, mo - 1, da, h, mi);
  if (Number.isNaN(wanted)) return null;
  // Erst als UTC annehmen, dann um die Differenz zur Berliner Anzeige korrigieren (zweimal wegen Zeitumstellung).
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = toBerlinInput(new Date(guess));
    const s = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(shown);
    if (!s) return null;
    const [sy, smo, sda, sh, smi] = s.slice(1).map(Number);
    guess += wanted - Date.UTC(sy, smo - 1, sda, sh, smi);
  }
  const check = new Date(guess);
  return toBerlinInput(check) === value!.trim() ? check : null; // nicht existierende Ortszeit (Umstellung) → ungültig
}
