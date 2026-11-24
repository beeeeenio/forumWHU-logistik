// Mengen und Einheiten für die Anzeige. Reine Funktionen (getestet).

const PLURALS: Record<string, string> = {
  kiste: "Kisten", kasten: "Kästen", palette: "Paletten", karton: "Kartons", flasche: "Flaschen", fass: "Fässer", packung: "Packungen",
  paket: "Pakete", sack: "Säcke", dose: "Dosen", box: "Boxen", tray: "Trays", beutel: "Beutel", eimer: "Eimer", kanister: "Kanister",
  liter: "Liter", kilo: "Kilo", kg: "kg", stück: "Stück", stuck: "Stück", tüte: "Tüten", tute: "Tüten", rolle: "Rollen", bund: "Bund",
  korb: "Körbe", behälter: "Behälter", gebinde: "Gebinde", schale: "Schalen", glas: "Gläser", set: "Sets", tablett: "Tabletts",
};

export function pluralUnit(unit: string, quantity: number): string {
  const u = unit.trim();
  if (quantity === 1 || quantity === -1) return u;
  return PLURALS[u.toLowerCase()] ?? u;
}

/** „46 Kisten“, „1 Kiste“ */
export function fmtQty(quantity: number, unit: string): string {
  return `${quantity.toLocaleString("de-DE")} ${pluralUnit(unit, quantity)}`;
}

/** Einzahl-Formen, die in der Schnellerfassung als Einheit erkannt werden (Einzahl und Mehrzahl). */
export function knownUnitWords(extra: string[] = []): string[] {
  const set = new Set<string>();
  for (const [s, p] of Object.entries(PLURALS)) { set.add(s); set.add(p.toLowerCase()); }
  for (const e of extra) { set.add(e.toLowerCase()); const p = PLURALS[e.toLowerCase()]; if (p) set.add(p.toLowerCase()); }
  return [...set];
}

export const fmtEuro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** „Kisten“ → „Kiste“ (erkannte Mehrzahl als Einzahl speichern); Unbekanntes bleibt, wie es ist. */
export function singularUnit(word: string): string {
  const w = word.trim();
  for (const [s, p] of Object.entries(PLURALS)) if (p.toLowerCase() === w.toLowerCase() && s !== p.toLowerCase()) return s.charAt(0).toUpperCase() + s.slice(1);
  return w.charAt(0).toUpperCase() + w.slice(1);
}
