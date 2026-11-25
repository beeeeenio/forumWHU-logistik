"use client";

import { Check, ClipboardCheck, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { inventoryAction } from "@/app/actions/inventory";
import { fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Feedback } from "./action-form";
import { InventoryUndo } from "./inventory-undo";

export interface InvRow { articleId: string; name: string; unit: string; returnable: boolean; state: "FULL" | "EMPTY"; current: number }
export interface InvArticle { id: string; name: string; unit: string; returnable: boolean }

/** Zählliste eines Ortes: Zahl eintragen (oder „stimmt“ tippen), nur Abweichungen werden gebucht. */
export function InventoryForm({ locationId, locationName, initial, articles }: { locationId: string; locationName: string; initial: InvRow[]; articles: InvArticle[] }) {
  const [rows, setRows] = useState<InvRow[]>(initial);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [result, formAction, pending] = useActionState(inventoryAction, null);
  const key = (r: Pick<InvRow, "articleId" | "state">) => r.articleId + r.state;

  const entered = rows.filter((r) => counts[key(r)] !== undefined && counts[key(r)] !== "");
  const diffs = entered.filter((r) => parseInt(counts[key(r)], 10) !== r.current);
  const available = articles.filter((a) => !rows.some((r) => r.articleId === a.id));

  function addArticle(id: string) {
    const a = articles.find((x) => x.id === id);
    if (!a) return;
    const base = { articleId: a.id, name: a.name, unit: a.unit, returnable: a.returnable, current: 0 };
    setRows((cur) => [...cur, { ...base, state: "FULL" }, ...(a.returnable ? [{ ...base, state: "EMPTY" as const }] : [])]);
  }

  function submit() {
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ locationId, note, rows: entered.map((r) => ({ articleId: r.articleId, state: r.state, counted: parseInt(counts[key(r)], 10) })) }));
    startTransition(() => formAction(fd));
  }

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-2xl border border-ok/40 bg-ok/10 p-4 text-ok">
          <p className="flex items-center gap-2 font-medium"><Check className="size-5" />{result.message}</p>
          {result.lines && result.lines.length > 0 && <ul className="mt-2 list-inside list-disc text-sm">{result.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
        {result.batchId && <div className="card space-y-2 p-4"><p className="text-sm font-medium text-heading">Falsch gezählt oder eingegeben?</p><p className="text-sm text-muted-foreground">Du kannst die ganze Zählung mit einem Schritt zurücknehmen und danach neu zählen. Einzelne Zeilen kannst du auch im Journal stornieren.</p><InventoryUndo batchId={result.batchId} label="Ganze Zählung zurücknehmen" /></div>}
        <div className="flex flex-wrap gap-2"><Link href={`/orte/${locationId}`} className="btn-primary">Zum Ort {locationName}</Link><Link href="/inventur" className="btn-secondary">Nächsten Raum zählen</Link></div>
      </div>
    );
  }

  // auffällig: Bestand wird 0 gesetzt oder weicht um mehr als die Hälfte (und ≥ 5) ab – lieber noch einmal nachzählen
  const suspicious = (r: InvRow) => { const n = parseInt(counts[key(r)], 10); const d = Math.abs(n - r.current); return n !== r.current && ((n === 0 && r.current > 0) || (d >= 5 && d * 2 >= Math.max(r.current, 1))); };

  if (review) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl">Prüfen vor dem Buchen</h2>
        {diffs.length === 0 ? <p className="rounded-xl bg-ok/10 p-3 text-sm text-ok">Alle {entered.length} gezählten Zeilen stimmen mit der Lage überein. Es wird nichts geändert.</p> : (
          <ul className="space-y-2">
            {diffs.map((r) => { const n = parseInt(counts[key(r)], 10); const d = n - r.current; const sus = suspicious(r); return (
              <li key={key(r)} className={cn("card flex flex-wrap items-center justify-between gap-2 p-3", sus && "border-warn/60")}>
                <span><span className="font-medium text-heading">{r.name}</span>{r.returnable && <span className="ml-2 chip-muted">{r.state === "FULL" ? "voll" : "leer"}</span>}{sus && <span className="mt-1 block text-xs text-warn">Große Abweichung – bitte noch einmal nachzählen.</span>}</span>
                <span className="tabular-nums">{r.current} → <strong className="text-heading">{n}</strong> <span className={d > 0 ? "text-ok" : "text-danger"}>({d > 0 ? "+" : ""}{d})</span></span>
              </li>); })}
          </ul>
        )}
        {entered.length < rows.length && <p className="text-sm text-muted-foreground">{rows.length - entered.length} {rows.length - entered.length === 1 ? "Zeile" : "Zeilen"} ohne Zahl {rows.length - entered.length === 1 ? "bleibt" : "bleiben"} unverändert.</p>}
        {result && !result.ok && <Feedback result={result} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setReview(false)} className="btn-secondary flex-1">← Zurück zum Zählen</button>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary flex-1">{pending ? "Buche …" : diffs.length ? `Jetzt buchen (${diffs.length})` : "Abschließen"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 && <p className="card border-dashed p-5 text-center text-sm text-muted-foreground">Hier ist nichts gebucht. Füge unten Artikel hinzu, die du hier findest.</p>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const k = key(r);
          const v = counts[k] ?? "";
          const n = parseInt(v, 10);
          const diff = v !== "" && Number.isFinite(n) ? n - r.current : null;
          return (
            <li key={k} className={cn("card flex flex-wrap items-center justify-between gap-3 p-3", diff !== null && diff !== 0 && "border-warn/60")}>
              <div className="min-w-0">
                <p className="font-medium text-heading">{r.name}{r.returnable && <span className="ml-2 chip-muted">{r.state === "FULL" ? "voll" : "leer"}</span>}</p>
                <p className="text-sm text-muted-foreground">Gebucht: {fmtQty(r.current, r.unit)}</p>
              </div>
              <div className="flex items-center gap-2">
                {diff !== null && diff !== 0 && <span className={cn("text-sm font-semibold tabular-nums", diff > 0 ? "text-ok" : "text-danger")}>{diff > 0 ? "+" : ""}{diff}</span>}
                <button type="button" className="btn-secondary btn-sm" onClick={() => setCounts((c) => ({ ...c, [k]: String(r.current) }))}>stimmt</button>
                <input value={v} onChange={(e) => setCounts((c) => ({ ...c, [k]: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" pattern="[0-9]*" placeholder="gezählt" aria-label={`Gezählt: ${r.name}`} className="field w-24 text-center text-lg font-semibold tabular-nums" />
              </div>
            </li>
          );
        })}
      </ul>

      {available.length > 0 && (
        <label className="block"><span className="label"><Plus className="mr-1 inline size-3" />Artikel gefunden, der hier nicht gebucht ist</span>
          <select value="" onChange={(e) => addArticle(e.target.value)} className="field"><option value="">– Artikel hinzufügen –</option>{available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      )}
      <label className="block"><span className="label">Notiz (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field" placeholder="z. B. Freitagabend nach der Weinprobe" /></label>

      {result && !result.ok && <Feedback result={result} />}
      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.5rem)] z-10 md:bottom-4">
        <button type="button" onClick={() => setReview(true)} disabled={pending || entered.length === 0} className="btn-primary min-h-12 w-full text-base shadow-soft">
          <ClipboardCheck className="size-5" />{entered.length === 0 ? "Zahlen eintragen" : diffs.length === 0 ? `Prüfen – alles stimmt (${entered.length})` : `Prüfen (${diffs.length} Abweichung${diffs.length === 1 ? "" : "en"})`}
        </button>
      </div>
    </div>
  );
}
