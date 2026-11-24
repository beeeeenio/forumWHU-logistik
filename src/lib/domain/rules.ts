// Buchungsregeln: aus dem, was eine Person eingibt, wird eindeutig „von (Ort, Zustand)“ und „nach (Ort, Zustand)“.
// Reine Funktionen ohne Datenbank (getestet in tests/unit/rules.test.ts). Die Datenbank prüft zusätzlich per CHECK-Constraint.

export type StockState = "FULL" | "EMPTY";
export type MovementKind = "RECEIPT" | "TRANSFER" | "CONSUME" | "RETURN" | "WRITE_OFF" | "ADJUST";

export const MOVEMENT_KINDS: MovementKind[] = ["RECEIPT", "TRANSFER", "CONSUME", "RETURN", "WRITE_OFF", "ADJUST"];
export const MAX_QUANTITY = 100_000;

export const KIND_LABEL: Record<MovementKind, string> = {
  RECEIPT: "Eingang",
  TRANSFER: "Umlagerung",
  CONSUME: "Verbraucht",
  RETURN: "Leergut zurück",
  WRITE_OFF: "Abgang",
  ADJUST: "Korrektur",
};

export const KIND_HELP: Record<MovementKind, string> = {
  RECEIPT: "Ware kommt an (Lieferung, Abholung) und wird eingelagert.",
  TRANSFER: "Ware (oder Leergut) wird von einem Ort an einen anderen gebracht.",
  CONSUME: "Wurde verbraucht. Bei Pfandartikeln wird aus „voll“ → „leer“ (Leergut bleibt am Ort).",
  RETURN: "Leergut verlässt das System (Pfand zurückgegeben, Getränkemarkt, Lieferant).",
  WRITE_OFF: "Ware ist weg: entsorgt, kaputt, zurück an den Sponsor, verloren.",
  ADJUST: "Inventur: Es wurde gezählt – der Bestand wird auf die gezählte Menge gesetzt.",
};

export const STATE_LABEL: Record<StockState, string> = { FULL: "voll", EMPTY: "leer" };

export interface Place {
  locationId: string;
  state: StockState;
}

export interface MovementDraft {
  kind: MovementKind;
  quantity: number;
  /** Ort der Quelle bzw. – bei Verbrauch/Rückgabe/Abgang/Korrektur – der Ort, an dem es passiert */
  fromLocationId?: string | null;
  /** Ziel (Eingang, Umlagerung) */
  toLocationId?: string | null;
  /** Zustand der bewegten Ware (Standard voll; Leergut-Umlagerung: leer) */
  state?: StockState;
}

export type Resolved = { ok: true; from: Place | null; to: Place | null; quantity: number } | { ok: false; error: string };

const err = (error: string): Resolved => ({ ok: false, error });

export function validQuantity(q: unknown): q is number {
  return typeof q === "number" && Number.isInteger(q) && q >= 1 && q <= MAX_QUANTITY;
}

/**
 * `returnable` = der Artikel hat Pfand/Leergut (voll/leer werden getrennt gezählt).
 * Korrektur wird hier nicht aufgelöst (braucht den aktuellen Bestand): siehe adjustTo().
 */
export function resolveMovement(d: MovementDraft, returnable: boolean): Resolved {
  if (!validQuantity(d.quantity)) return err("Die Menge muss eine ganze Zahl von 1 bis " + MAX_QUANTITY.toLocaleString("de-DE") + " sein.");
  const q = d.quantity;
  const state: StockState = d.state ?? "FULL";
  if (state === "EMPTY" && !returnable) return err("Dieser Artikel hat kein Leergut – „leer“ gibt es nur bei Pfandartikeln.");
  const from = d.fromLocationId || null;
  const to = d.toLocationId || null;

  switch (d.kind) {
    case "RECEIPT":
      if (!to) return err("Wohin wurde eingelagert? Bitte einen Lagerort wählen.");
      if (state !== "FULL") return err("Ein Eingang ist immer „voll“.");
      return { ok: true, from: null, to: { locationId: to, state: "FULL" }, quantity: q };
    case "TRANSFER":
      if (!from) return err("Von wo? Bitte den Ort wählen, aus dem es kommt.");
      if (!to) return err("Wohin? Bitte den Zielort wählen.");
      if (from === to) return err("Quelle und Ziel sind derselbe Ort.");
      return { ok: true, from: { locationId: from, state }, to: { locationId: to, state }, quantity: q };
    case "CONSUME":
      if (!from) return err("Wo wurde es verbraucht? Bitte den Ort wählen.");
      return {
        ok: true,
        from: { locationId: from, state: "FULL" },
        to: returnable ? { locationId: from, state: "EMPTY" } : null,
        quantity: q,
      };
    case "RETURN":
      if (!returnable) return err("Nur Pfandartikel haben Leergut, das zurückgegeben werden kann.");
      if (!from) return err("Wo liegt das Leergut? Bitte den Ort wählen.");
      return { ok: true, from: { locationId: from, state: "EMPTY" }, to: null, quantity: q };
    case "WRITE_OFF":
      if (!from) return err("Woher geht es ab? Bitte den Ort wählen.");
      return { ok: true, from: { locationId: from, state }, to: null, quantity: q };
    case "ADJUST":
      return err("Korrekturen werden über die gezählte Menge gebucht.");
  }
}

/** Inventur: aus „gezählt“ und dem aktuellen Bestand ergibt sich die Differenz als Zugang (+) oder Abgang (−). */
export function adjustTo(locationId: string, state: StockState, counted: number, current: number): Resolved {
  if (!Number.isInteger(counted) || counted < 0 || counted > MAX_QUANTITY) return err("Die gezählte Menge muss eine ganze Zahl von 0 bis " + MAX_QUANTITY.toLocaleString("de-DE") + " sein.");
  const diff = counted - current;
  if (diff === 0) return err("Der Bestand stimmt bereits (" + current + ").");
  if (diff > 0) return { ok: true, from: null, to: { locationId, state }, quantity: diff };
  return { ok: true, from: { locationId, state }, to: null, quantity: -diff };
}

/** Ein Zugang/Abgang je Platz – daraus entsteht der Bestand. */
export interface Delta {
  articleId: string;
  locationId: string;
  state: StockState;
  quantity: number;
}

export const stockKey = (articleId: string, locationId: string, state: StockState) => `${articleId}|${locationId}|${state}`;

export interface MoveLike {
  articleId: string;
  quantity: number;
  fromLocationId: string | null;
  fromState: StockState | null;
  toLocationId: string | null;
  toState: StockState | null;
}

/** Bestandswirkung einer Bewegung (ohne stornierte – die filtert der Aufrufer). */
export function movementDeltas(m: MoveLike): Delta[] {
  const out: Delta[] = [];
  if (m.fromLocationId && m.fromState) out.push({ articleId: m.articleId, locationId: m.fromLocationId, state: m.fromState, quantity: -m.quantity });
  if (m.toLocationId && m.toState) out.push({ articleId: m.articleId, locationId: m.toLocationId, state: m.toState, quantity: m.quantity });
  return out;
}

/** Summiert Zu- und Abgänge zu Beständen je (Artikel, Ort, Zustand). Nullbestände werden weggelassen. */
export function foldStock(deltas: Iterable<Delta>): Map<string, Delta> {
  const map = new Map<string, Delta>();
  for (const d of deltas) {
    const key = stockKey(d.articleId, d.locationId, d.state);
    const cur = map.get(key);
    if (cur) cur.quantity += d.quantity;
    else map.set(key, { ...d });
  }
  for (const [k, v] of map) if (v.quantity === 0) map.delete(k);
  return map;
}
