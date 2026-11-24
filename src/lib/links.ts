import type { MovementKind, StockState } from "./domain/rules";

/** Link in die Buchungsmaske mit vorausgefüllten Feldern (z. B. „Umlagern“ neben einer Bestandszeile). */
export function buchenHref(p: { kind?: MovementKind; article?: string; from?: string; to?: string; state?: StockState; qty?: number; copy?: string }): string {
  const q = new URLSearchParams();
  if (p.kind) q.set("kind", p.kind);
  if (p.article) q.set("article", p.article);
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  if (p.state) q.set("state", p.state);
  if (p.qty !== undefined) q.set("qty", String(p.qty));
  if (p.copy) q.set("copy", p.copy);
  const s = q.toString();
  return s ? `/buchen?${s}` : "/buchen";
}
