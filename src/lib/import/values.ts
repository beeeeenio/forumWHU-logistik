// Werte aus Excel-Zellen verstehen (deutsch und englisch, tolerant). Rein, getestet.
import { fold } from "./fields.ts";

const YES = new Set(["ja", "j", "yes", "y", "true", "wahr", "x", "1", "ok", "gekühlt", "gekuhlt", "pfand", "mehrweg"]);
const NO = new Set(["nein", "n", "no", "false", "falsch", "0", "-", "kein", "keine"]);

/** ja/nein-Zelle; leer oder unklar → undefined (Feld bleibt unverändert bzw. Standard). */
export function parseBool(v: string): boolean | undefined {
  if (/^[-–—]$/.test(v.trim())) return false;
  const t = fold(v);
  if (!t) return undefined;
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  return undefined;
}

/** Ganze Zahl aus „46“, „46,0“, „1.200“, „12 Kisten“. Nicht ganzzahlige Werte („2,5“, „0,4“) und Exponenten („1e3“) ergeben null – nie still gerundet. */
export function parseInteger(v: string): number | null {
  const t = v.replace(/\u00a0/g, " ").trim();
  if (/^-?\d+(?:[.,]\d+)?\s*[eE][+-]?\d/.test(t)) return null;
  const m = t.match(/^-?\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|^-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, ""); // 1.200 → 1200
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || Math.abs(n - Math.round(n)) > 1e-9) return null;
  return Math.round(n);
}

/** Euro-Betrag in Cent aus „4,50“, „4.50 €“, „EUR 4,5“; leer/unklar → null. */
export function parseCents(v: string): number | null {
  const t = v.replace(/eur|€/gi, "").replace(/ /g, " ").trim();
  if (!t) return null;
  const m = t.match(/^-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^-?\d+(?:[.,]\d{1,2})?$/);
  if (!m) return null;
  const s = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export type LocKind = "SITE" | "ROOM" | "COLD" | "TRAILER";
export function parseLocationKind(v: string): LocKind | undefined {
  const t = fold(v);
  if (!t) return undefined;
  if (/anhanger|trailer|kuhlwagen/.test(t)) return "TRAILER";
  if (/kuhl|cold|kaltlager/.test(t)) return "COLD";
  if (/gebaude|gelande|site|haus|halle|building/.test(t)) return "SITE";
  if (/raum|room|keller/.test(t)) return "ROOM";
  return undefined;
}

/** voll/leer; alles andere (inkl. leer gelassen) → undefined, der Aufrufer nimmt „voll“. */
export function parseState(v: string): "FULL" | "EMPTY" | undefined {
  const t = fold(v);
  if (!t) return undefined;
  if (/^(leer|leere|leergut|empty|e)$/.test(t) || /leer/.test(t)) return "EMPTY";
  if (/^(voll|volle|full|f|ok|vorratig|gefullt)$/.test(t) || /voll/.test(t)) return "FULL";
  return undefined;
}

export const splitList = (v: string): string[] => [...new Set(v.split(/[,;|\n]/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20);
export const clean = (v: string | undefined) => (v ?? "").trim().replace(/\s+/g, " ");
