// Schnellerfassung: aus einem Satz wie „Staatlich Fachingen, 46 Kisten Mineralwasser in L004“ wird ein Buchungsentwurf.
// Deterministisch, ohne KI und ohne Datenbank (getestet in tests/unit/quick-parse.test.ts). Der Entwurf füllt nur das Formular
// vor – gebucht wird erst, wenn eine Person ihn geprüft hat. Unsicheres steht in `warnings`.
//
// Verstanden werden u. a.:
//   „Staatlich Fachingen, 46 Kisten Mineralwasser in L004“                  → Eingang
//   „46 Kisten Mineralwasser von L004 nach Stadthalle Kühlanhänger“          → Umlagerung
//   „20 Kisten Mineralwasser leer in Stadthalle“ / „… verbraucht“           → Verbraucht (voll → leer)
//   „Leergut 20 Kisten Mineralwasser von Stadthalle nach L004“              → Umlagerung von Leergut
//   „Pfand zurück 20 Kisten Mineralwasser aus L004“                         → Leergut zurück
//   „Inventur Mineralwasser L004 gezählt 30“                                → Korrektur (gezählt)
// Mehrere Zeilen (Zeilenumbruch oder „;“) ergeben mehrere Entwürfe.
import type { MovementKind, StockState } from "./rules";

export interface CatalogArticle { id: string; name: string; aliases: string[]; unit: string; returnable: boolean }
export interface CatalogLocation { id: string; name: string; code: string | null; parentId: string | null }
export interface ParseCatalog { articles: CatalogArticle[]; locations: CatalogLocation[]; suppliers: string[] }

export interface ParsedDraft {
  raw: string;
  kind: MovementKind;
  /** Menge; bei Korrektur die gezählte Menge */
  quantity: number | null;
  articleId: string | null;
  /** Name, wenn der Artikel nicht im Katalog steht (wird auf Wunsch neu angelegt) */
  articleGuess: string | null;
  unitGuess: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  state: StockState;
  supplierName: string | null;
  warnings: string[];
}

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Tok { orig: string; f: string; sep: boolean; used: boolean }

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12,
  dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50, hundert: 100,
};
const FROM_PREPS = new Set(["von", "aus", "ab"]);
const TO_PREPS = new Set(["nach", "in", "im", "ins", "zu", "zum", "zur", "bei", "am", "an", "auf"]);
const FILLER = new Set(["ok", "okay", "also", "so", "dann", "hallo", "lieferung", "heute", "neu", "neue", "es", "ist", "sind", "wurde", "wurden", "habe", "ich", "die", "der", "das", "den", "dem", "und", "jetzt", "wieder", "nun", "noch", "da", "dort", "hier"]);

const CONSUME_WORDS = new Set(["verbraucht", "aufgebraucht", "ausgetrunken", "leergetrunken", "leergemacht", "getrunken", "gegessen", "aufgegessen", "verbrauch"]);
const ADJUST_WORDS = new Set(["inventur", "gezahlt", "gezahlte", "nachgezahlt", "korrektur"]);
const WRITEOFF_WORDS = new Set(["entsorgt", "weggeworfen", "kaputt", "defekt", "verdorben", "abgelaufen", "verloren", "gestohlen", "abgang"]);
const RECEIPT_WORDS = new Set(["geliefert", "angeliefert", "lieferung", "eingang", "angekommen", "erhalten", "bekommen", "eingelagert", "abgeholt", "kommt"]);
const MOVE_WORDS = new Set(["gebracht", "umgelagert", "verschoben", "transportiert", "umgeraumt", "bewegt", "ausgeraumt", "gefahren", "eingeraumt"]);
const EMPTY_WORDS = new Set(["leer", "leere", "leeren", "leergut"]);

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  for (const m of line.matchAll(/[^\s,;:]+|[,;:]/g)) {
    const t = m[0];
    if (t === "," || t === ";" || t === ":") { if (out.length) out[out.length - 1].sep = true; continue; }
    const orig = t.replace(/[.!?]+$/g, "");
    const f = fold(orig);
    if (!f) continue;
    out.push({ orig, f, sep: false, used: false });
  }
  return out;
}

const stem = (w: string) => (w.length >= 6 ? w.replace(/(en|n|e|s)$/, "") : w);
const sameWord = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && stem(a) === stem(b));

/** Alle Stellen, an denen die Wortfolge `needle` (gefaltet) in den noch freien Tokens steht. */
function findSeq(toks: Tok[], needle: string[], respectUsed = true): number[] {
  const hits: number[] = [];
  if (!needle.length) return hits;
  for (let i = 0; i + needle.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      const t = toks[i + j];
      if ((respectUsed && t.used) || !sameWord(t.f, needle[j])) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

interface LocHit { loc: CatalogLocation; start: number; end: number }

function matchLocations(toks: Tok[], locations: CatalogLocation[]): LocHit[] {
  const hits: LocHit[] = [];
  for (const loc of locations) {
    const names = new Set<string>();
    const nameF = fold(loc.name);
    if (nameF) names.add(nameF);
    if (loc.code) names.add(fold(loc.code));
    for (const n of names) {
      const parts = n.split(" ");
      for (const i of findSeq(toks, parts)) hits.push({ loc, start: i, end: i + parts.length });
      // Code mit Leerzeichen gesprochen/getippt: „L 004“ = „L004“
      if (loc.code) {
        const codeF = fold(loc.code).replace(/ /g, "");
        for (let i = 0; i + 1 < toks.length; i++) if (!toks[i].used && !toks[i + 1].used && toks[i].f + toks[i + 1].f === codeF) hits.push({ loc, start: i, end: i + 2 });
      }
    }
  }
  // Überlappungen: längere Treffer gewinnen
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: LocHit[] = [];
  for (const h of hits) if (!taken.some((t) => h.start < t.end && t.start < h.end)) taken.push(h);
  return taken.sort((a, b) => a.start - b.start);
}

/** Direkt aufeinanderfolgende Treffer („Stadthalle Kühlanhänger“) sind ein Ort: der speziellere (Kind) bzw. der zuletzt genannte gilt. */
function mergeAdjacent(hits: LocHit[], locations: CatalogLocation[]): LocHit[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const isDescendant = (child: CatalogLocation, ancestorId: string): boolean => {
    let cur: CatalogLocation | undefined = child;
    for (let i = 0; cur && i < 10; i++) { if (cur.parentId === ancestorId) return true; cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return false;
  };
  const out: LocHit[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && prev.end === h.start) {
      const winner = isDescendant(prev.loc, h.loc.id) ? prev.loc : h.loc;
      out[out.length - 1] = { loc: winner, start: prev.start, end: h.end };
    } else out.push({ ...h });
  }
  return out;
}

function precedingPrep(toks: Tok[], start: number): "from" | "to" | null {
  for (let i = start - 1; i >= Math.max(0, start - 3); i--) {
    const f = toks[i].f;
    if (FROM_PREPS.has(f)) return "from";
    if (TO_PREPS.has(f)) return "to";
    if (toks[i].sep) break;
  }
  return null;
}

export function parseQuickEntry(text: string, catalog: ParseCatalog): ParsedDraft[] {
  return text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parseLine(line, catalog));
}

export function parseLine(line: string, catalog: ParseCatalog): ParsedDraft {
  const toks = tokenize(line);
  const warnings: string[] = [];
  const has = (set: Set<string>) => toks.some((t) => set.has(t.f));

  // 1) Orte zuerst (ihre Namen können Zahlen enthalten: „Kühllager 2“), dann sind diese Tokens belegt.
  const locHits = mergeAdjacent(matchLocations(toks, catalog.locations), catalog.locations);
  for (const h of locHits) for (let i = h.start; i < h.end; i++) toks[i].used = true;

  // 2) Menge: Ziffern direkt vor einer Einheit, sonst die erste freie Zahl, sonst Zahlwort („eine Kiste“).
  const unitWords = new Set(catalogUnits(catalog));
  let qIdx = -1;
  for (let i = 0; i < toks.length - 1; i++) if (!toks[i].used && /^\d+x?$/.test(toks[i].f) && unitWords.has(toks[i + 1].f)) { qIdx = i; break; }
  if (qIdx < 0) qIdx = toks.findIndex((t) => !t.used && /^\d+x?$/.test(t.f));
  let quantity: number | null = null;
  if (qIdx >= 0) quantity = parseInt(toks[qIdx].f, 10);
  else {
    const i = toks.findIndex((t, k) => !t.used && t.f in NUMBER_WORDS && k + 1 < toks.length && unitWords.has(toks[k + 1].f));
    if (i >= 0) { qIdx = i; quantity = NUMBER_WORDS[toks[i].f]; }
  }
  if (qIdx >= 0) toks[qIdx].used = true;
  let unitGuess: string | null = null;
  if (qIdx >= 0 && qIdx + 1 < toks.length && !toks[qIdx + 1].used && unitWords.has(toks[qIdx + 1].f)) { unitGuess = toks[qIdx + 1].orig; toks[qIdx + 1].used = true; }

  // 3) Artikel: längster Treffer auf Name/Alias, sonst die Wörter hinter der Einheit als neuer Name.
  let articleId: string | null = null;
  let best = 0;
  for (const a of catalog.articles) {
    for (const n of [a.name, ...a.aliases]) {
      const parts = fold(n).split(" ").filter(Boolean);
      const hit = findSeq(toks, parts)[0];
      if (hit !== undefined && parts.length > best) { best = parts.length; articleId = a.id; for (let i = hit; i < hit + parts.length; i++) toks[i].used = true; }
    }
  }
  // Nur ein Teil des Namens gesprochen („Wasser“ für „Mineralwasser“)? Dann Enthaltensein als Rückfall.
  if (!articleId) {
    const free = toks.filter((t) => !t.used && t.f.length >= 4 && !FILLER.has(t.f) && !FROM_PREPS.has(t.f) && !TO_PREPS.has(t.f));
    for (const t of free) {
      const cand = catalog.articles.filter((a) => [a.name, ...a.aliases].some((n) => { const nf = fold(n).replace(/ /g, ""); return nf.includes(t.f) || t.f.includes(nf); }));
      if (cand.length === 1) { articleId = cand[0].id; t.used = true; break; }
    }
  }
  let articleGuess: string | null = null;
  if (!articleId && qIdx >= 0) {
    const words: string[] = [];
    for (let i = qIdx + 1; i < toks.length; i++) {
      const t = toks[i];
      if (t.used && !words.length) continue;
      if (t.used || FROM_PREPS.has(t.f) || TO_PREPS.has(t.f) || FILLER.has(t.f) || EMPTY_WORDS.has(t.f) || CONSUME_WORDS.has(t.f)) break;
      words.push(t.orig);
      t.used = true;
    }
    if (words.length) articleGuess = words.join(" ");
  }

  // 4) Lieferant: bekannter Name irgendwo, „von <Unbekanntes>“ oder ein Satzanfang vor einem Komma/Doppelpunkt.
  let supplierName: string | null = null;
  for (const s of catalog.suppliers) {
    const parts = fold(s).split(" ").filter(Boolean);
    const hit = findSeq(toks, parts)[0];
    if (hit !== undefined) { supplierName = s; for (let i = hit; i < hit + parts.length; i++) toks[i].used = true; break; }
  }
  if (!supplierName) {
    const vi = toks.findIndex((t) => t.f === "von");
    if (vi >= 0 && vi + 1 < toks.length && !toks[vi + 1].used) {
      const words: string[] = [];
      for (let i = vi + 1; i < toks.length; i++) {
        const t = toks[i];
        if (t.used || TO_PREPS.has(t.f) || FROM_PREPS.has(t.f)) break;
        words.push(t.orig);
        if (t.sep) break;
      }
      if (words.length) { supplierName = words.join(" "); for (let i = vi; i <= vi + words.length; i++) toks[i].used = true; }
    }
  }
  if (!supplierName) {
    const sepIdx = toks.findIndex((t) => t.sep);
    if (sepIdx >= 0 && (qIdx < 0 || sepIdx < qIdx)) {
      const words = toks.slice(0, sepIdx + 1).filter((t) => !t.used && !FILLER.has(t.f)).map((t) => t.orig);
      if (words.length && !words.some((w) => EMPTY_WORDS.has(fold(w)) || CONSUME_WORDS.has(fold(w)) || RECEIPT_WORDS.has(fold(w)) || ADJUST_WORDS.has(fold(w)))) {
        supplierName = words.join(" ");
        for (let i = 0; i <= sepIdx; i++) toks[i].used = true;
      }
    }
  }

  // 5) Rollen der Orte (von / nach) über die Präposition davor; ohne Präposition: erster = von, zweiter = nach.
  const roles = locHits.map((h) => precedingPrep(toks, h.start));
  const byRole = (r: "from" | "to" | null) => locHits.filter((_, i) => roles[i] === r).map((h) => h.loc.id);
  const [fromCands, toCands, noneCands] = [byRole("from"), byRole("to"), byRole(null)];
  let fromId: string | null = fromCands[0] ?? null;
  let toId: string | null = toCands[0] ?? null;
  if (!fromId && !toId) {
    if (noneCands.length >= 2) { fromId = noneCands[0]; toId = noneCands[1]; }
    else if (noneCands.length === 1) toId = noneCands[0]; // einzelner Ort ohne Präposition: wird je nach Art der Buchung umgedeutet
  } else if (fromId && !toId) toId = noneCands[0] ?? null;
  else if (toId && !fromId) fromId = noneCands[0] ?? null;

  // 6) Art der Buchung
  const article = articleId ? catalog.articles.find((a) => a.id === articleId) : undefined;
  const wantsEmpty = has(EMPTY_WORDS);
  const pfand = toks.some((t) => t.f === "pfand");
  const backWord = toks.some((t) => ["zuruck", "zuruckgegeben", "zuruckgebracht", "rueckgabe", "abgegeben", "rucknahme", "ruckgabe"].includes(t.f));
  let kind: MovementKind;
  let state: StockState = "FULL";
  const hasBoth = Boolean(fromId && toId);
  if (has(ADJUST_WORDS)) kind = "ADJUST";
  else if ((pfand && backWord) || (wantsEmpty && backWord) || toks.some((t) => ["zuruckgegeben", "pfandruckgabe", "pfandrueckgabe"].includes(t.f))) kind = "RETURN";
  else if (has(CONSUME_WORDS) || (toks.some((t) => t.f === "leer") && toks.some((t, i) => t.f === "gemacht" && i > 0 && toks[i - 1].f === "leer"))) kind = "CONSUME";
  else if (has(WRITEOFF_WORDS) && !hasBoth) kind = "WRITE_OFF";
  else if (hasBoth) kind = "TRANSFER";
  else if (fromId && !toId && has(MOVE_WORDS)) kind = "TRANSFER";
  else if (has(RECEIPT_WORDS) || supplierName || (toId && !fromId && !wantsEmpty)) kind = "RECEIPT";
  else if (wantsEmpty && (fromId || toId)) kind = "CONSUME"; // „20 Kisten Wasser leer, Stadthalle“ = leer gemacht
  else kind = "RECEIPT";

  if ((kind === "TRANSFER" || kind === "WRITE_OFF") && wantsEmpty) state = "EMPTY";
  if (kind === "RETURN") state = "EMPTY";

  // „am Ort“-Buchungen: der genannte Ort ist die Quelle
  if (["CONSUME", "RETURN", "WRITE_OFF", "ADJUST"].includes(kind)) { fromId = fromId ?? toId; toId = null; }
  if (kind === "RECEIPT") { toId = toId ?? fromId; fromId = null; }

  // 7) Hinweise
  if (quantity === null) warnings.push(kind === "ADJUST" ? "Gezählte Menge fehlt." : "Menge fehlt.");
  if (!articleId && !articleGuess) warnings.push("Artikel nicht erkannt.");
  if (!articleId && articleGuess) warnings.push(`Artikel „${articleGuess}“ gibt es noch nicht – wird neu angelegt, wenn du ihn so bestätigst.`);
  if (article && !article.returnable && (state === "EMPTY" || kind === "RETURN")) warnings.push(`„${article.name}“ ist kein Pfandartikel – Leergut gibt es dort nicht.`);
  if (kind === "RECEIPT" && !toId) warnings.push("Zielort fehlt.");
  if (kind === "TRANSFER" && (!fromId || !toId)) warnings.push(!fromId ? "Quellort fehlt." : "Zielort fehlt.");
  if (["CONSUME", "RETURN", "WRITE_OFF", "ADJUST"].includes(kind) && !fromId) warnings.push("Ort fehlt.");

  return { raw: line, kind, quantity, articleId, articleGuess, unitGuess, fromLocationId: fromId, toLocationId: toId, state, supplierName, warnings };
}

function catalogUnits(catalog: ParseCatalog): string[] {
  const words = new Set<string>(DEFAULT_UNIT_WORDS);
  for (const a of catalog.articles) {
    const f = fold(a.unit);
    if (f) { words.add(f); words.add(f + "n"); words.add(f + "s"); words.add(f + "en"); }
  }
  return [...words];
}

const DEFAULT_UNIT_WORDS = [
  "kiste", "kisten", "kasten", "kasten", "kasten", "palette", "paletten", "karton", "kartons", "flasche", "flaschen", "fass", "fasser", "packung", "packungen",
  "paket", "pakete", "sack", "sacke", "dose", "dosen", "box", "boxen", "tray", "trays", "beutel", "eimer", "kanister", "liter", "kilo", "kg", "stuck", "tute", "tuten",
  "rolle", "rollen", "bund", "korb", "korbe", "gebinde", "schale", "schalen", "glas", "glaser", "set", "sets", "tablett", "tabletts", "x",
];
