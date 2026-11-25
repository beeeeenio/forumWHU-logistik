import { Download } from "lucide-react";
import Link from "next/link";
import { Empty } from "@/components/stock-ui";
import { ScrollEnd } from "@/components/scroll-end";
import { fmtQty } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { addDay, berlinToday, dayRange, getConsumption } from "@/services/consumption";

export const metadata = { title: "Auswertung" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const dayLabel = (ymd: string) => new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));

export default async function AuswertungPage({ searchParams }: PageProps<"/auswertung">) {
  await requireUser();
  const sp = await searchParams;
  const today = berlinToday();
  let to = YMD.test(first(sp.to) ?? "") ? first(sp.to)! : today;
  let from = YMD.test(first(sp.from) ?? "") ? first(sp.from)! : addDay(to, -6);
  if (from > to) [from, to] = [to, from];
  if (dayRange(from, to, 63).length > 62) from = addDay(to, -61); // höchstens 62 Tage (lesbare Tabelle)
  const includeWriteOff = first(sp.abgang) === "1";
  const c = await getConsumption(from, to, includeWriteOff);
  const qs = (p: Record<string, string>) => new URLSearchParams({ ...(includeWriteOff ? { abgang: "1" } : {}), ...p }).toString();
  const presets = [
    { label: "Heute", from: today, to: today },
    { label: "Letzte 3 Tage", from: addDay(today, -2), to: today },
    { label: "Letzte 7 Tage", from: addDay(today, -6), to: today },
    { label: "Letzte 30 Tage", from: addDay(today, -29), to: today },
  ];

  return (
    <div className="page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Auswertung</h1><p className="text-sm text-muted-foreground">Verbrauch je Tag und Artikel. Es zählen Buchungen „Verbraucht“{includeWriteOff ? " und „Abgang“" : ""}; stornierte nicht.</p></div>
        <a href={`/api/export/verbrauch?${qs({ from, to })}`} className="btn-secondary btn-sm"><Download className="size-4" />Excel (CSV)</a>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Zeitraum wählen">
        {presets.map((p) => <Link key={p.label} href={`/auswertung?${qs({ from: p.from, to: p.to })}`} className={cn("btn-secondary btn-sm shrink-0", p.from === from && p.to === to && "border-transparent bg-navy text-white dark:bg-primary dark:text-primary-foreground")}>{p.label}</Link>)}
      </div>
      <details className="card px-4 py-1" open={!presets.some((p) => p.from === from && p.to === to)}>
        <summary className="font-medium text-heading">Eigener Zeitraum · {from.split("-").reverse().join(".")} – {to.split("-").reverse().join(".")}{includeWriteOff ? " · inkl. Abgang" : ""}</summary>
        <form className="grid gap-3 pt-2 pb-3 sm:grid-cols-4" aria-label="Eigener Zeitraum">
          <label><span className="label">Von</span><input type="date" name="from" defaultValue={from} className="field" /></label>
          <label><span className="label">Bis</span><input type="date" name="to" defaultValue={to} className="field" /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:pt-6"><input type="checkbox" name="abgang" value="1" defaultChecked={includeWriteOff} className="size-6" />Abgang mitzählen</label>
          <div className="flex items-end"><button className="btn-primary w-full">Anzeigen</button></div>
        </form>
      </details>

      {c.rows.length === 0 ? <Empty title="Im Zeitraum nichts verbraucht">Verbrauch entsteht durch Buchungen „Verbraucht“ (bei Pfandartikeln: „Verbraucht (→ leer)“). Wähle einen anderen Zeitraum oder buche den Verbrauch.</Empty> : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="card px-4 py-3"><dt className="label !mb-0">Verbraucht</dt><dd className="font-semibold text-heading">{c.byUnit.map((u) => fmtQty(u.total, u.unit)).join(" · ") || "–"}</dd></div>
            <div className="card px-4 py-3"><dt className="label !mb-0">Spitzentag</dt><dd className="font-semibold text-heading">{c.peak ? `${dayLabel(c.peak.day)}: ${fmtQty(c.peak.total, c.peak.unit)}` : "–"}</dd></div>
            <div className="card px-4 py-3"><dt className="label !mb-0">Artikel · Tage</dt><dd className="font-semibold text-heading">{c.rows.filter((r) => r.total > 0).length} Artikel · {c.days.length} Tage</dd></div>
          </dl>

          <ScrollEnd label="Verbrauch je Tag und Artikel – seitlich scrollbar">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">Verbrauch je Tag und Artikel im Zeitraum {from} bis {to}</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-heading">Artikel</th>
                  {c.days.map((d) => <th key={d} scope="col" className="px-2 py-2 text-center text-xs font-medium whitespace-nowrap text-muted-foreground">{dayLabel(d)}</th>)}
                  <th scope="col" className="px-3 py-2 text-right font-medium text-heading">Summe</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Eingang</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => {
                  const max = Math.max(1, ...Object.values(r.perDay));
                  return (
                    <tr key={r.article.id} className="border-b last:border-0">
                      <th scope="row" className="sticky left-0 z-10 max-w-[9rem] truncate bg-card px-3 py-2 text-left font-medium text-heading"><Link href={`/artikel/${r.article.id}`} className="inline-flex min-h-11 items-center hover:underline">{r.article.name}</Link><span className="ml-1 text-xs font-normal text-muted-foreground">({r.article.unit})</span></th>
                      {c.days.map((d) => {
                        const q = r.perDay[d] ?? 0;
                        return <td key={d} className="px-1 py-1 text-center"><span className={cn("inline-flex min-w-9 items-center justify-center rounded-md px-1.5 py-1 tabular-nums", q ? "font-semibold" : "text-muted-foreground")} style={q ? { backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(15 + 70 * (q / max))}%, transparent)`, color: q / max >= 0.5 ? "var(--navy)" : "var(--heading)" } : undefined}>{q || "·"}</span></td>;
                      })}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-heading">{r.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.received || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollEnd>
          <p className="text-xs text-muted-foreground">Die Tage sind Berliner Kalendertage. „Eingang“ ist die im Zeitraum angelieferte Menge, zum Vergleich mit dem Verbrauch.</p>
        </>
      )}
    </div>
  );
}
