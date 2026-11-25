"use client";

import { ArrowRight, Check, CircleHelp, Eye, Play } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { importPreviewAction, importRunAction } from "@/app/actions/import";
import { IMPORT_KINDS, guessColumns, type ImportKind } from "@/lib/import/fields";

import { cn } from "@/lib/utils";
import type { ImportConfig, ImportReport, LineStatus } from "@/services/import";

export interface WizardSheet { name: string; hidden: boolean; total: number; rows: string[][]; rowNumbers: number[]; headerRow: number; guess: (string | null)[] }

const STATUS_TONE: Record<LineStatus, string> = { neu: "chip-ok", aktualisiert: "chip-ok", unverändert: "chip-muted", übersprungen: "chip-danger", Hinweis: "chip-warn" };

/** Pipedrive-Stil: links die Spalte der Datei mit Beispielwerten, rechts das Feld, in das sie gehört. Keine Pflichtfelder. */
export function ImportWizard({ draftId, kind, sheets }: { draftId: string; kind: ImportKind; sheets: WizardSheet[] }) {
  const def = IMPORT_KINDS[kind];
  const firstVisible = Math.max(0, sheets.findIndex((s) => !s.hidden));
  const [sheetIdx, setSheetIdx] = useState(firstVisible);
  const [headerRow, setHeaderRow] = useState(sheets[firstVisible]?.headerRow ?? 0);
  const [columns, setColumns] = useState<(string | null)[]>(sheets[firstVisible]?.guess ?? []);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [stockMode, setStockMode] = useState<"set" | "add">("set");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sheet = sheets[sheetIdx];
  const headers = sheet.rows[headerRow] ?? [];
  const width = Math.max(headers.length, ...sheet.rows.slice(headerRow + 1, headerRow + 8).map((r) => r.length));
  const samples = (col: number) => sheet.rows.slice(headerRow + 1, headerRow + 40).map((r) => r[col]).filter((v) => v && v.trim()).slice(0, 3);
  const used = useMemo(() => new Set(columns.filter(Boolean)), [columns]);
  const cfg = (): ImportConfig => ({ sheet: sheetIdx, headerRow, columns: Array.from({ length: width }, (_, i) => columns[i] ?? null), updateExisting, stockMode });
  const touch = () => { setReport(null); setError(null); };

  function resetFor(si: number, hr: number) {
    setSheetIdx(si); setHeaderRow(hr);
    setColumns(guessColumns(kind, sheets[si].rows[hr] ?? []));
    touch();
  }
  function assign(col: number, key: string | null) {
    setColumns((cur) => {
      const next = Array.from({ length: width }, (_, i) => cur[i] ?? null);
      if (key) next.forEach((k, i) => { if (k === key) next[i] = null; }); // ein Feld nur aus einer Spalte
      next[col] = key;
      return next;
    });
    touch();
  }
  const preview = () => start(async () => { setError(null); const r = await importPreviewAction(draftId, cfg()); if (r.ok) setReport(r.report); else { setReport(null); setError(r.error); } });
  const run = () => start(async () => {
    if (!report) return;
    if (!window.confirm(kind === "stock" ? "Bestand jetzt buchen? Du kannst den Import später unter Inventur → Verlauf zurücknehmen." : "Jetzt importieren? Stammdaten-Importe lassen sich nicht zurücknehmen.")) return;
    setError(null);
    const r = await importRunAction(draftId, cfg());
    if (r.ok) setDone(r.report); else setError(r.error);
  });

  if (done) {
    const where = kind === "stock" ? { href: "/", label: "Zur Lage" } : kind === "articles" ? { href: "/stammdaten?tab=artikel", label: "Zu den Artikeln" } : kind === "locations" ? { href: "/stammdaten?tab=orte", label: "Zu den Lagerorten" } : { href: "/stammdaten?tab=lieferanten", label: "Zu den Lieferanten" };
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-2xl border border-ok/40 bg-ok/10 p-4 text-ok">
          <p className="flex items-center gap-2 font-medium"><Check className="size-5" />Import abgeschlossen</p>
          <p className="mt-1 text-sm">{done.created} neu · {done.updated} aktualisiert · {done.unchanged} unverändert · {done.skipped} übersprungen</p>
          {done.extra.map((e, i) => <p key={i} className="text-sm">{e}</p>)}
        </div>
        {done.batchId && <p className="text-sm">Falsch importiert? <Link href="/inventur/verlauf" className="underline">Unter Inventur → Verlauf</Link> kannst du den ganzen Bestandsimport zurücknehmen.</p>}
        <div className="flex flex-wrap gap-2"><Link href={where.href} className="btn-primary">{where.label}</Link><Link href="/import" className="btn-secondary">Weitere Datei importieren</Link></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-muted p-3 text-sm"><CircleHelp className="mr-1 inline size-4" />Keine Pflichtfelder: Ordne nur zu, was du hast. Was fehlt, bekommt einen Standardwert. Nur Zeilen ohne {kind === "stock" ? "Artikel, Ort oder Menge" : "Namen"} können nicht übernommen werden – sie werden in der Vorschau aufgelistet.</p>

      {sheets.length > 1 && (
        <label className="block"><span className="label">Tabellenblatt</span>
          <select value={sheetIdx} onChange={(e) => resetFor(Number(e.target.value), sheets[Number(e.target.value)].headerRow)} className="field">{sheets.map((s, i) => <option key={i} value={i}>{s.name}{s.hidden ? " (ausgeblendet)" : ""} · {s.total} Zeilen</option>)}</select></label>
      )}
      <label className="block"><span className="label">Kopfzeile (Zeile mit den Spaltennamen)</span>
        <select value={headerRow} onChange={(e) => resetFor(sheetIdx, Number(e.target.value))} className="field">{sheet.rows.slice(0, 15).map((r, i) => <option key={i} value={i}>Zeile {sheet.rowNumbers[i]}: {r.filter(Boolean).slice(0, 4).join(" · ") || "(leer)"}</option>)}</select></label>

      <section aria-label="Spaltenzuordnung" className="card divide-y">
        <div className="hidden grid-cols-[1fr_1.2fr] gap-3 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid"><span>Spalte in der Datei</span><span>Wird übernommen als</span></div>
        {Array.from({ length: width }, (_, col) => {
          const key = columns[col] ?? null;
          const s = samples(col);
          return (
            <div key={col} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1.2fr] sm:items-center sm:gap-3">
              <div className="min-w-0">
                <p className="font-medium text-heading">{headers[col]?.trim() || <span className="text-muted-foreground">Spalte {col + 1} (ohne Überschrift)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{s.length ? s.join(" · ") : "keine Werte"}</p>
              </div>
              <label className="flex items-center gap-2"><ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" /><span className="sr-only">Feld für {headers[col] || `Spalte ${col + 1}`}</span>
                <select value={key ?? ""} onChange={(e) => assign(col, e.target.value || null)} className={cn("field", key && "border-ok/60")}>
                  <option value="">– nicht importieren –</option>
                  {def.fields.map((f) => <option key={f.key} value={f.key}>{f.label}{used.has(f.key) && columns[col] !== f.key ? " (schon vergeben)" : ""}</option>)}
                </select></label>
            </div>
          );
        })}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg">Optionen</h2>
        {kind === "stock" ? (
          <fieldset className="space-y-2"><legend className="label">Menge bedeutet</legend>
            <label className="flex min-h-11 items-start gap-2 text-sm"><input type="radio" checked={stockMode === "set"} onChange={() => { setStockMode("set"); touch(); }} className="mt-1 size-4" /><span><strong>Gezählter Bestand</strong> – der Bestand wird auf diese Menge gesetzt (Anfangsbestand, Inventurliste).</span></label>
            <label className="flex min-h-11 items-start gap-2 text-sm"><input type="radio" checked={stockMode === "add"} onChange={() => { setStockMode("add"); touch(); }} className="mt-1 size-4" /><span><strong>Dazu buchen</strong> – die Menge wird zum vorhandenen Bestand addiert.</span></label>
          </fieldset>
        ) : (
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={updateExisting} onChange={(e) => { setUpdateExisting(e.target.checked); touch(); }} className="mt-1 size-4" /><span><strong>Vorhandene aktualisieren</strong> – gleicher Name (bei Orten auch Kurzcode): ausgefüllte Zellen überschreiben, leere lassen den Wert unverändert. Ohne Haken bleiben vorhandene unberührt.</span></label>
        )}
      </section>

      <button type="button" onClick={preview} disabled={pending} className="btn-secondary w-full min-h-12"><Eye className="size-5" />{pending && !report ? "Berechne …" : "Vorschau berechnen"}</button>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {report && (
        <section aria-label="Vorschau" className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["neu", report.created], ["aktualisiert", report.updated], ["unverändert", report.unchanged], ["übersprungen", report.skipped]] as const).map(([k, n]) => (
              <div key={k} className="card p-3 text-center"><p className="text-2xl font-semibold tabular-nums text-heading">{n}</p><p className="text-xs text-muted-foreground">{k}</p></div>
            ))}
          </div>
          {report.extra.map((e, i) => <p key={i} className="rounded-xl bg-muted p-3 text-sm">{e}</p>)}
          <ul className="card max-h-96 divide-y overflow-y-auto text-sm">
            {report.lines.map((l, i) => <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2"><span className={STATUS_TONE[l.status]}>{l.status}</span><span className="text-xs text-muted-foreground">{l.row}</span><span className="min-w-0 flex-1">{l.text}</span></li>)}
            {report.lines.length === 0 && <li className="px-3 py-3 text-muted-foreground">Keine Zeilen.</li>}
          </ul>
          {report.created + report.updated === 0 ? <p className="text-sm text-muted-foreground">Es gibt nichts zu importieren. Prüfe die Zuordnung oder die Optionen.</p> : (
            <button type="button" onClick={run} disabled={pending} className="btn-primary min-h-12 w-full text-base"><Play className="size-5" />{pending ? "Importiere …" : `Jetzt importieren (${report.created + report.updated})`}</button>
          )}
        </section>
      )}
    </div>
  );
}

