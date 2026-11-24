import Link from "next/link";
import { Empty } from "@/components/stock-ui";
import { pathName } from "@/lib/domain/tree";
import { fmtEuro, fmtQty } from "@/lib/format";
import { buchenHref } from "@/lib/links";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getPfand } from "@/services/reports";

export const metadata = { title: "Leergut & Pfand" };

export default async function PfandPage() {
  const user = await requireUser();
  const { lines, locations } = await getPfand();
  const writer = canWrite(user.role);
  const emptyValue = lines.reduce((s, l) => s + Math.max(l.empty, 0) * l.article.depositCents, 0);
  const circulating = lines.reduce((s, l) => s + (Math.max(l.full, 0) + Math.max(l.empty, 0)) * l.article.depositCents, 0);
  const missingDeposit = lines.filter((l) => l.article.depositCents === 0 && (l.full || l.empty));

  return (
    <div className="page space-y-5">
      <div><h1 className="h1">Leergut &amp; Pfand</h1><p className="text-sm text-muted-foreground">Wie viel Leergut liegt wo, was ist es wert, was ist schon zurück?</p></div>

      {lines.length === 0 ? (
        <Empty title="Noch keine Pfandartikel">Bei einem Artikel in den <Link href="/stammdaten?tab=artikel" className="underline">Stammdaten</Link> „Pfandartikel“ aktivieren – dann werden voll und leer getrennt gezählt.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
            <div className="card p-4"><p className="label">Leergut-Wert</p><p className="text-2xl font-semibold text-heading tabular-nums">{fmtEuro(emptyValue)}</p><p className="text-xs text-muted-foreground">Rückgabewert aller leeren Gebinde</p></div>
            <div className="card p-4"><p className="label">Pfand im Umlauf</p><p className="text-2xl font-semibold text-heading tabular-nums">{fmtEuro(circulating)}</p><p className="text-xs text-muted-foreground">voll + leer, noch nicht zurück</p></div>
          </div>
          {missingDeposit.length > 0 && <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">Für {missingDeposit.map((l) => l.article.name).join(", ")} ist noch kein Pfandbetrag hinterlegt – die Werte oben sind deshalb zu niedrig. <Link href="/stammdaten?tab=artikel" className="underline">Betrag eintragen</Link></p>}

          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.article.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/artikel/${l.article.id}`} className="font-heading text-lg text-heading hover:underline">{l.article.name}</Link>
                  <span className="text-sm text-muted-foreground">Pfand {fmtEuro(l.article.depositCents)} je {l.article.unit}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted p-2"><p className="text-xl font-semibold text-heading tabular-nums">{l.full.toLocaleString("de-DE")}</p><p className="text-xs text-muted-foreground">voll</p></div>
                  <div className="rounded-xl bg-muted p-2"><p className="text-xl font-semibold text-heading tabular-nums">{l.empty.toLocaleString("de-DE")}</p><p className="text-xs text-muted-foreground">leer</p></div>
                  <div className="rounded-xl bg-muted p-2"><p className="text-xl font-semibold text-heading tabular-nums">{l.returned.toLocaleString("de-DE")}</p><p className="text-xs text-muted-foreground">zurückgegeben</p></div>
                </div>
                {l.emptyByLocation.length > 0 && (
                  <div>
                    <p className="label">Leergut liegt hier</p>
                    <ul className="divide-y">
                      {l.emptyByLocation.map((e) => (
                        <li key={e.locationId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <Link href={`/orte/${e.locationId}`} className="text-heading hover:underline">{pathName(locations, e.locationId)}</Link>
                          <span className="flex items-center gap-2"><strong className={e.quantity < 0 ? "text-danger" : "text-heading"}>{fmtQty(e.quantity, l.article.unit)}</strong>
                            {writer && e.quantity > 0 && <><Link href={buchenHref({ kind: "TRANSFER", article: l.article.id, from: e.locationId, state: "EMPTY", qty: e.quantity })} className="btn-secondary btn-sm">Umlagern</Link><Link href={buchenHref({ kind: "RETURN", article: l.article.id, from: e.locationId, qty: e.quantity })} className="btn-secondary btn-sm">Pfand zurück</Link></>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
