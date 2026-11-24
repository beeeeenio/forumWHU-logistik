"use client";

import { Plus } from "lucide-react";
import { planCreateAction } from "@/app/actions/book";
import type { BookCatalog } from "./book-panel";
import { ActionForm, SubmitButton } from "./action-form";

export function PlanForm({ catalog, phases, defaultDue }: { catalog: BookCatalog; phases: string[]; defaultDue: string }) {
  return (
    <details className="card p-4">
      <summary className="flex items-center gap-2 font-medium text-heading"><Plus className="size-5" />Neuen Plan anlegen</summary>
      <ActionForm action={planCreateAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Artikel</span>
          <select name="articleId" required className="field"><option value="">– wählen –</option>{catalog.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label><span className="label">Menge</span><input name="quantity" required inputMode="numeric" pattern="[0-9]*" className="field" placeholder="z. B. 23" /></label>
        <label><span className="label">Zustand</span><select name="state" className="field"><option value="FULL">voll / vorrätig</option><option value="EMPTY">leer (Leergut)</option></select></label>
        <label><span className="label">Von (leer lassen = kommt neu an)</span>
          <select name="fromLocationId" className="field"><option value="">– Eingang / unbekannt –</option>{catalog.locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
        <label><span className="label">Nach</span>
          <select name="toLocationId" required className="field"><option value="">– wählen –</option>{catalog.locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
        <label><span className="label">Wann</span><input type="datetime-local" name="dueAt" required defaultValue={defaultDue} className="field" /></label>
        <label><span className="label">Anlass / Phase</span><input name="phase" list="phase-list" maxLength={80} className="field" placeholder="z. B. Frühstück Freitag" /></label>
        <label className="sm:col-span-2"><span className="label">Notiz</span><input name="note" maxLength={300} className="field" placeholder="optional" /></label>
        <div className="sm:col-span-2"><SubmitButton>Plan speichern</SubmitButton></div>
        <datalist id="phase-list">{phases.map((p) => <option key={p} value={p} />)}</datalist>
      </ActionForm>
    </details>
  );
}
