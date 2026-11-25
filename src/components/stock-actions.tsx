import Link from "next/link";
import { buchenHref } from "@/lib/links";
import type { StockState } from "@/lib/domain/rules";

/** Schnellaktionen neben einer Bestandszeile: öffnen die Buchungsmaske mit allem vorausgefüllt. */
export function StockActions({ articleId, locationId, state, quantity, returnable }: { articleId: string; locationId: string; state: StockState; quantity: number; returnable: boolean }) {
  const base = { article: articleId, from: locationId, state, qty: Math.max(quantity, 1) };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={buchenHref({ ...base, kind: "TRANSFER" })} className="btn-secondary btn-sm">Umlagern</Link>
      {state === "FULL" && <Link href={buchenHref({ ...base, kind: "CONSUME" })} className="btn-secondary btn-sm">{returnable ? "Verbraucht (→ leer)" : "Verbraucht"}</Link>}
      {state === "EMPTY" && <Link href={buchenHref({ ...base, kind: "RETURN" })} className="btn-secondary btn-sm">Pfand zurück</Link>}
      <Link href={buchenHref({ article: articleId, from: locationId, state, qty: Math.max(quantity, 0), kind: "ADJUST" })} className="btn-secondary btn-sm">Zählen</Link>
    </div>
  );
}
