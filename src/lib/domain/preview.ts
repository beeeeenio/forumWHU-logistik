// Vorschau „Bestand danach“ und Plausibilität der Menge in der Buchungsmaske. Rein, getestet.
import type { MovementKind, StockState } from "./rules.ts";

export interface AfterLine { text: string; warn: boolean }
export interface PreviewInput {
  kind: MovementKind;
  quantity: number;
  state: StockState;
  fromId: string | null;
  toId: string | null;
  returnable: boolean;
  stockOf: (locationId: string, state: StockState) => number;
  nameOf: (locationId: string) => string;
}

const label = (s: StockState, returnable: boolean) => (returnable ? (s === "FULL" ? " voll" : " leer") : "");

/** Was die Buchung am Bestand ändert, z. B. „L004: 46 → 0 voll“. Minusbestand wird als Warnung markiert. */
export function afterLines(i: PreviewInput): AfterLine[] {
  const q = i.quantity;
  if (!Number.isFinite(q) || q < 0 || (q === 0 && i.kind !== "ADJUST")) return [];
  const line = (loc: string, state: StockState, to: number): AfterLine => ({ text: `${i.nameOf(loc)}: ${i.stockOf(loc, state)} → ${to}${label(state, i.returnable)}`, warn: to < 0 });
  const out: AfterLine[] = [];
  const f = i.fromId, t = i.toId;
  switch (i.kind) {
    case "RECEIPT": if (t) out.push(line(t, "FULL", i.stockOf(t, "FULL") + q)); break;
    case "TRANSFER": if (f) out.push(line(f, i.state, i.stockOf(f, i.state) - q)); if (t) out.push(line(t, i.state, i.stockOf(t, i.state) + q)); break;
    case "CONSUME": if (f) { out.push(line(f, "FULL", i.stockOf(f, "FULL") - q)); if (i.returnable) out.push(line(f, "EMPTY", i.stockOf(f, "EMPTY") + q)); } break;
    case "RETURN": if (f) out.push(line(f, "EMPTY", i.stockOf(f, "EMPTY") - q)); break;
    case "WRITE_OFF": if (f) out.push(line(f, i.state, i.stockOf(f, i.state) - q)); break;
    case "ADJUST": if (f) out.push(line(f, i.state, q)); break;
  }
  return out;
}

/** Deutlich mehr als sonst üblich (Median der letzten Buchungen)? Fängt Tippfehler wie 100 statt 10. */
export function unusualQuantity(quantity: number, typical: number | undefined): boolean {
  if (!typical || typical <= 0 || !Number.isFinite(quantity)) return false;
  return quantity >= typical * 5 && quantity - typical >= 10;
}
