"use client";

import { Check, Mic, Minus, Plus, Sparkles, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { bookAction, quickParseAction, undoBookedAction } from "@/app/actions/book";
import type { ActionResult } from "@/lib/action-result";
import { afterLines, unusualQuantity } from "@/lib/domain/preview";
import { KIND_HELP, KIND_LABEL, MOVEMENT_KINDS, STATE_LABEL, type MovementKind, type StockState } from "@/lib/domain/rules";
import { fmtQty, singularUnit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Feedback } from "./action-form";

export interface BookCatalog {
  articles: { id: string; name: string; unit: string; returnable: boolean; needsCooling: boolean }[];
  locations: { id: string; label: string; cooled: boolean }[];
  suppliers: string[];
  /** Aktueller Bestand für den Hinweis „hier liegen gerade …“ (die Prüfung macht der Server) */
  stock: { a: string; l: string; s: StockState; q: number }[];
  /** Übliche Menge je Artikel (Median der letzten Buchungen) für die Warnung bei Ausreißern */
  typical: Record<string, number>;
}

export interface Draft {
  key: string;
  kind: MovementKind;
  /** "" = nichts gewählt, "__new" = neuer Artikel, sonst Artikel-ID */
  articleId: string;
  newName: string;
  newUnit: string;
  newReturnable: boolean;
  quantity: string;
  from: string;
  to: string;
  state: StockState;
  supplier: string;
  note: string;
  when: string;
  source: "ui" | "quick";
  warnings: string[];
}

/** Auswahlgruppe per Tastatur: Pfeile wechseln den Wert (wie eine echte Radiogruppe), nur der aktive Knopf ist ein Tab-Stopp. */
function arrowKeys(e: React.KeyboardEvent<HTMLButtonElement>, index: number, count: number, pick: (i: number) => void) {
  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  const next = (index + dir + count) % count;
  pick(next);
  (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next])?.focus();
}

let counter = 0;
export const blankDraft = (over: Partial<Draft> = {}): Draft => ({
  key: `d${++counter}`, kind: "RECEIPT", articleId: "", newName: "", newUnit: "Stück", newReturnable: false, quantity: "", from: "", to: "", state: "FULL", supplier: "", note: "", when: "", source: "ui", warnings: [], ...over,
});

interface SpeechRec { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
type SpeechCtor = new () => SpeechRec;

const FROM_LABEL: Record<MovementKind, string> = { RECEIPT: "", TRANSFER: "Von", CONSUME: "Wo verbraucht", RETURN: "Wo liegt das Leergut", WRITE_OFF: "Woher", ADJUST: "Wo gezählt" };

function stockOf(c: BookCatalog, a: string, l: string, s: StockState) {
  return c.stock.find((r) => r.a === a && r.l === l && r.s === s)?.q ?? 0;
}

function QuickEntry({ catalog, onDrafts }: { catalog: BookCatalog; onDrafts: (d: Draft[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [open, setOpen] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Diktat gibt es nur im Browser
    setCanListen(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "de-DE";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setText((t) => (t ? t.replace(/\s*$/, " ") : "") + add.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); setError("Das Diktat ist fehlgeschlagen. Du kannst auch die Mikrofon-Taste deiner Tastatur nutzen."); };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }

  async function parse() {
    setBusy(true);
    setError(null);
    const res = await quickParseAction(text);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const drafts = res.drafts.map((d) => {
      const art = d.articleId ? catalog.articles.find((a) => a.id === d.articleId) : undefined;
      return blankDraft({
        kind: d.kind,
        articleId: d.articleId ?? (d.articleGuess ? "__new" : ""),
        newName: d.articleGuess ?? "",
        newUnit: d.unitGuess ? singularUnit(d.unitGuess) : art?.unit ?? "Kiste",
        quantity: d.quantity === null ? "" : String(d.quantity),
        from: d.fromLocationId ?? "",
        to: d.toLocationId ?? "",
        state: d.state,
        supplier: d.supplierName ?? "",
        note: d.kind === "ADJUST" ? "Inventur" : "",
        source: "quick",
        warnings: d.warnings,
      });
    });
    onDrafts(drafts);
    setOpen(false);
  }

  return (
    <details className="card p-4" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex items-center gap-2"><Sparkles className="size-5 text-heading" /><span className="font-heading text-lg text-heading">Per Text oder Diktat erfassen</span><span className="ml-auto text-xs text-muted-foreground">{open ? "zuklappen" : "aufklappen"}</span></summary>
      <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">Schreib oder diktier einfach, was passiert ist – eine Zeile pro Buchung. Unten kannst du alles prüfen und ändern, bevor gebucht wird.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="field" aria-label="Schnellerfassung"
        placeholder={"Staatlich Fachingen, 46 Kisten Mineralwasser in L004\n46 Kisten Mineralwasser von L004 nach Stadthalle Kühlanhänger\n20 Kisten Mineralwasser leer in Stadthalle"} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={parse} disabled={busy || !text.trim()} className="btn-primary">{busy ? "Lese …" : "In Buchungen umwandeln"}</button>
        {canListen && <button type="button" onClick={toggleMic} className={cn("btn-secondary", listening && "border-danger text-danger")} aria-pressed={listening}><Mic className="size-4" />{listening ? "Hört zu … (Stopp)" : "Diktieren"}</button>}
        {text && <button type="button" onClick={() => setText("")} className="text-sm text-muted-foreground underline">leeren</button>}
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>
    </details>
  );
}

function Select({ label, value, onChange, children, required }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field" required={required}>{children}</select>
    </label>
  );
}

function DraftEditor({ d, index, total, catalog, set, remove }: { d: Draft; index: number; total: number; catalog: BookCatalog; set: (patch: Partial<Draft>) => void; remove: () => void }) {
  const article = catalog.articles.find((a) => a.id === d.articleId);
  const returnable = d.articleId === "__new" ? d.newReturnable : Boolean(article?.returnable);
  const unit = d.articleId === "__new" ? d.newUnit || "Stück" : article?.unit ?? "Stück";
  const qty = parseInt(d.quantity, 10);
  const fromState: StockState = d.kind === "CONSUME" ? "FULL" : d.kind === "RETURN" ? "EMPTY" : d.state;
  const needsFrom = d.kind !== "RECEIPT";
  const needsTo = d.kind === "RECEIPT" || d.kind === "TRANSFER";
  const showState = returnable && (d.kind === "TRANSFER" || d.kind === "WRITE_OFF" || d.kind === "ADJUST");
  const have = article && d.from && needsFrom ? stockOf(catalog, article.id, d.from, fromState) : null;
  const short = have !== null && d.kind !== "ADJUST" && Number.isFinite(qty) && qty > have;
  const nameOf = (id: string) => catalog.locations.find((l) => l.id === id)?.label ?? "?";
  const stockHere = (loc: string, s: StockState) => (article ? stockOf(catalog, article.id, loc, s) : 0);
  const after = (article || d.articleId === "__new") && Number.isFinite(qty)
    ? afterLines({ kind: d.kind, quantity: qty, state: fromState, fromId: needsFrom && d.from ? d.from : d.kind === "RECEIPT" ? null : null, toId: needsTo && d.to ? d.to : null, returnable, stockOf: stockHere, nameOf })
    : [];
  const unusual = Boolean(article && unusualQuantity(qty, catalog.typical[article.id]));
  const cooling = article?.needsCooling && d.to && catalog.locations.find((l) => l.id === d.to) && !catalog.locations.find((l) => l.id === d.to)!.cooled && (d.kind === "RECEIPT" || d.kind === "TRANSFER");

  return (
    <div className="card space-y-4 p-4" aria-label={`Buchung ${index + 1}`}>
      <div className="flex items-start justify-between gap-2">
        <div role="radiogroup" aria-label="Art der Buchung" className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-6">
          {MOVEMENT_KINDS.map((k, ki) => (
            <button key={k} type="button" role="radio" aria-checked={d.kind === k} tabIndex={d.kind === k ? 0 : -1} onKeyDown={(e) => arrowKeys(e, ki, MOVEMENT_KINDS.length, (i) => set({ kind: MOVEMENT_KINDS[i], state: MOVEMENT_KINDS[i] === "RETURN" ? "EMPTY" : MOVEMENT_KINDS[i] === "CONSUME" || MOVEMENT_KINDS[i] === "RECEIPT" ? "FULL" : d.state }))} onClick={() => set({ kind: k, state: k === "RETURN" ? "EMPTY" : k === "CONSUME" || k === "RECEIPT" ? "FULL" : d.state })}
              className={cn("min-h-11 rounded-xl border px-1.5 text-xs font-medium leading-tight transition-colors", d.kind === k ? "border-transparent bg-navy text-white dark:bg-primary dark:text-primary-foreground" : "bg-card text-heading hover:bg-muted")}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {total > 1 && <button type="button" onClick={remove} className="btn-secondary btn-sm shrink-0 text-danger" aria-label={`Zeile ${index + 1} entfernen`}><Trash2 className="size-4" /></button>}
      </div>
      <p className="text-xs text-muted-foreground">{KIND_HELP[d.kind]}</p>

      {d.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn/10 p-3 text-sm text-warn">
          {d.warnings.map((w, i) => <li key={i} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{w}</li>)}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Select label="Artikel" value={d.articleId} onChange={(v) => set({ articleId: v, state: v !== "__new" && !catalog.articles.find((a) => a.id === v)?.returnable ? "FULL" : d.state })} required>
            <option value="">– wählen –</option>
            {catalog.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="__new">＋ Neuer Artikel …</option>
          </Select>
          {d.articleId === "__new" && (
            <div className="grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-3">
              <label className="sm:col-span-2"><span className="label">Name des neuen Artikels</span><input value={d.newName} onChange={(e) => set({ newName: e.target.value })} className="field" maxLength={120} /></label>
              <label><span className="label">Einheit</span><input value={d.newUnit} onChange={(e) => set({ newUnit: e.target.value })} className="field" list="unit-list" maxLength={40} /></label>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={d.newReturnable} onChange={(e) => set({ newReturnable: e.target.checked })} className="size-5" />Pfandartikel (Leergut wird mitgezählt)</label>
            </div>
          )}
        </div>

        <div>
          <span className="label">{d.kind === "ADJUST" ? "Gezählt (neuer Bestand)" : "Menge"}{unit ? ` · ${unit}` : ""}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary w-12 px-0" aria-label="Weniger" onClick={() => set({ quantity: String(Math.max((Number.isFinite(qty) ? qty : 1) - 1, d.kind === "ADJUST" ? 0 : 1)) })}><Minus className="size-4" /></button>
            <input value={d.quantity} onChange={(e) => set({ quantity: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" pattern="[0-9]*" className="field text-center text-lg font-semibold tabular-nums" aria-label="Menge" placeholder="0" />
            <button type="button" className="btn-secondary w-12 px-0" aria-label="Mehr" onClick={() => set({ quantity: String((Number.isFinite(qty) ? qty : 0) + 1) })}><Plus className="size-4" /></button>
          </div>
        </div>

        {showState && (
          <div>
            <span className="label">Zustand</span>
            <div role="radiogroup" aria-label="Zustand" className="grid grid-cols-2 gap-1.5">
              {(["FULL", "EMPTY"] as const).map((s, si) => (
                <button key={s} type="button" role="radio" aria-checked={d.state === s} tabIndex={d.state === s ? 0 : -1} onKeyDown={(e) => arrowKeys(e, si, 2, (i) => set({ state: i === 0 ? "FULL" : "EMPTY" }))} onClick={() => set({ state: s })} className={cn("min-h-11 rounded-xl border text-sm font-medium", d.state === s ? "border-transparent bg-navy text-white dark:bg-primary dark:text-primary-foreground" : "bg-card text-heading hover:bg-muted")}>{STATE_LABEL[s]}</button>
              ))}
            </div>
          </div>
        )}

        {needsFrom && (
          <Select label={FROM_LABEL[d.kind]} value={d.from} onChange={(v) => set({ from: v })} required>
            <option value="">– Ort wählen –</option>
            {catalog.locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
        )}
        {needsTo && (
          <Select label={d.kind === "RECEIPT" ? "Wohin eingelagert" : "Nach"} value={d.to} onChange={(v) => set({ to: v })} required>
            <option value="">– Ort wählen –</option>
            {catalog.locations.filter((l) => l.id !== d.from || d.kind === "RECEIPT").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
        )}

        {d.kind === "RECEIPT" && (
          <label className="sm:col-span-2"><span className="label">Von wem (Lieferant / Sponsor)</span><input value={d.supplier} onChange={(e) => set({ supplier: e.target.value })} list="supplier-list" className="field" maxLength={120} placeholder="optional" /></label>
        )}
        <label className="sm:col-span-2"><span className="label">Notiz{d.kind === "ADJUST" ? " (Pflicht bei Korrektur)" : ""}</span><input value={d.note} onChange={(e) => set({ note: e.target.value })} className="field" maxLength={500} placeholder={d.kind === "ADJUST" ? "z. B. Inventur Freitagabend" : "optional"} /></label>
      </div>

      {have !== null && (
        <p className={cn("text-sm", short ? "text-warn" : "text-muted-foreground")}>
          {short && <TriangleAlert className="mr-1 inline size-4" />}Dort sind {fmtQty(have, unit)} {returnable ? STATE_LABEL[fromState] : ""} gebucht{short ? " – das reicht nicht für diese Menge." : "."}
        </p>
      )}
      {after.length > 0 && (
        <div className="rounded-xl bg-muted p-3 text-sm" aria-live="polite">
          <p className="label !mb-1">Bestand danach</p>
          <ul className="space-y-0.5">{after.map((l, i) => <li key={i} className={cn("tabular-nums", l.warn ? "font-medium text-danger" : "text-foreground")}>{l.warn && <TriangleAlert className="mr-1 inline size-4" />}{l.text}</li>)}</ul>
        </div>
      )}
      {unusual && article && <p className="text-sm text-warn"><TriangleAlert className="mr-1 inline size-4" />Das ist deutlich mehr als sonst (üblich: etwa {Math.round(catalog.typical[article.id])} {unit}). Stimmt die Zahl?</p>}
      {cooling && <p className="text-sm text-warn"><TriangleAlert className="mr-1 inline size-4" />Dieser Artikel braucht Kühlung, der Zielort ist nicht gekühlt.</p>}

      <details className="text-sm">
        <summary className="inline-block text-muted-foreground underline">Anderer Zeitpunkt (nachtragen)</summary>
        <label className="mt-2 block"><span className="label">Wann ist es passiert? (leer = jetzt)</span><input type="datetime-local" value={d.when} onChange={(e) => set({ when: e.target.value })} className="field sm:max-w-xs" /></label>
      </details>
    </div>
  );
}

export function BookPanel({ catalog, initial }: { catalog: BookCatalog; initial: Partial<Draft> }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => [blankDraft(initial)]);
  const [result, formAction, pending] = useActionState(bookAction, null);
  const [force, setForce] = useState(false);
  const lastNonce = useRef<number | undefined>(undefined);
  // Kennung dieser Erfassung: bleibt bei Doppeltipp/Wiederholung gleich (bucht nie zweimal), neu nach jeder Änderung und nach Erfolg
  const keyRef = useRef<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [undoRes, setUndoRes] = useState<ActionResult | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Nach einem Erfolg: Maske leeren (Art der letzten Buchung bleibt – man bucht oft mehrere gleiche hintereinander)
  useEffect(() => {
    if (result?.ok && result.nonce && result.nonce !== lastNonce.current) {
      lastNonce.current = result.nonce;
      keyRef.current = null;
      setUndoRes(null);
      // Die Bestätigung steht oben, der Buchen-Knopf unten: nach oben holen, damit man sie sicher sieht
      requestAnimationFrame(() => successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setDrafts((cur) => [blankDraft({ kind: cur[0]?.kind ?? "RECEIPT" })]);
      setForce(false);
    }
  }, [result]);

  const payload = useMemo(() => JSON.stringify({
    force,
    rows: drafts.map((d) => ({
      kind: d.kind,
      articleId: d.articleId && d.articleId !== "__new" ? d.articleId : null,
      newArticle: d.articleId === "__new" ? { name: d.newName, unit: d.newUnit, returnable: d.newReturnable } : null,
      quantity: parseInt(d.quantity, 10),
      fromLocationId: d.kind === "RECEIPT" ? null : d.from || null,
      toLocationId: d.kind === "RECEIPT" || d.kind === "TRANSFER" ? d.to || null : null,
      state: d.kind === "CONSUME" || d.kind === "RECEIPT" ? "FULL" : d.kind === "RETURN" ? "EMPTY" : d.state,
      supplierName: d.kind === "RECEIPT" ? d.supplier || null : null,
      note: d.note || null,
      occurredAt: d.when || null,
      source: d.source,
    })),
  }), [drafts, force]);

  const patch = (key: string, p: Partial<Draft>) => { keyRef.current = null; setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...p, warnings: p.warnings ?? d.warnings } : d))); };
  // Was fehlt noch? (statt den Knopf ohne Erklärung zu sperren)
  const missing = [...new Set(drafts.flatMap((d, i) => {
    const row = drafts.length > 1 ? `Zeile ${i + 1}: ` : "";
    const m: string[] = [];
    if (!d.articleId) m.push("Artikel"); else if (d.articleId === "__new" && d.newName.trim().length < 2) m.push("Name des neuen Artikels");
    if (!Number.isFinite(parseInt(d.quantity, 10))) m.push(d.kind === "ADJUST" ? "gezählte Menge" : "Menge");
    if (d.kind !== "RECEIPT" && !d.from) m.push("Ort");
    if ((d.kind === "RECEIPT" || d.kind === "TRANSFER") && !d.to) m.push("Zielort");
    return m.map((x) => row + x);
  }))];
  const ready = missing.length === 0;

  const unusualAny = drafts.some((d) => { const a = catalog.articles.find((x) => x.id === d.articleId); return Boolean(a && unusualQuantity(parseInt(d.quantity, 10), catalog.typical[a.id])); });

  function submit(withForce: boolean) {
    if (!withForce && unusualAny && !window.confirm("Mindestens eine Menge ist deutlich größer als sonst üblich. Trotzdem buchen?")) return;
    setForce(withForce);
    keyRef.current ??= crypto.randomUUID();
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ ...JSON.parse(payload), force: withForce, requestKey: keyRef.current }));
    startTransition(() => formAction(fd));
  }

  async function undo() {
    if (!result?.ids) return;
    setUndoing(true);
    setUndoRes(await undoBookedAction(result.ids));
    setUndoing(false);
  }

  return (
    <div className="space-y-5">
      <QuickEntry catalog={catalog} onDrafts={(d) => { setDrafts(d.length ? d : [blankDraft()]); setForce(false); }} />

      {result?.ok && (
        <div ref={successRef} role="status" className="scroll-mt-20 rounded-2xl border border-ok/40 bg-ok/10 p-4 text-ok">
          <p className="flex items-center gap-2 font-medium"><Check className="size-5" />{result.message}</p>
          <ul className="mt-1 list-inside list-disc text-sm">{result.lines?.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="mt-2 text-sm"><Link href="/journal" className="underline">Im Journal ansehen</Link> · <Link href="/" className="underline">Zur Lage</Link></p>
          {result.ids && !result.duplicate && !undoRes?.ok && (
            <button type="button" onClick={undo} disabled={undoing} className="btn-secondary btn-sm mt-3 text-heading"><Undo2 className="size-4" />{undoing ? "Nehme zurück …" : "Falsch? Sofort rückgängig machen"}</button>
          )}
          {undoRes && <Feedback result={undoRes} />}
        </div>
      )}
      {result?.ok && result.warnings?.map((w, i) => <p key={i} className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{w}</p>)}

      <div className="space-y-4">
        {drafts.map((d, i) => (
          <DraftEditor key={d.key} d={d} index={i} total={drafts.length} catalog={catalog} set={(p) => patch(d.key, p)} remove={() => { keyRef.current = null; setDrafts((cur) => cur.filter((x) => x.key !== d.key)); }} />
        ))}
        <button type="button" onClick={() => { keyRef.current = null; setDrafts((cur) => [...cur, blankDraft({ kind: cur.at(-1)?.kind })]); }} className="btn-secondary w-full"><Plus className="size-4" />Weitere Zeile</button>
      </div>

      {result && !result.ok && (
        <div className="space-y-2">
          <Feedback result={result} />
          {result.code === "INSUFFICIENT" && (
            <button type="button" onClick={() => submit(true)} disabled={pending} className="btn-danger w-full">Trotzdem buchen (Bestand wird negativ und im Lagebericht markiert)</button>
          )}
        </div>
      )}

      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-10 -mx-4 space-y-1 border-t bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {!ready && <p className="text-xs text-muted-foreground" aria-live="polite">Es fehlen noch: {missing.slice(0, 4).join(", ")}{missing.length > 4 ? " …" : ""}</p>}
        <button type="button" onClick={() => submit(false)} disabled={pending || !ready} className="btn-primary min-h-12 w-full text-base shadow-soft disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none">
          {pending ? "Buche …" : drafts.length > 1 ? `Alle ${drafts.length} Zeilen buchen` : "Buchen"}
        </button>
      </div>

      <datalist id="supplier-list">{catalog.suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="unit-list">{["Kiste", "Kasten", "Palette", "Karton", "Stück", "Flasche", "Fass", "Packung", "Liter", "Kilo"].map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  );
}
