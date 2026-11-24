"use client";

import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { articleRemoveAction, articleSaveAction, locationRemoveAction, locationSaveAction, supplierRemoveAction, supplierSaveAction } from "@/app/actions/catalog";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./action-form";

type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Archivieren / Löschen / Wiederherstellen einer Stammdaten-Zeile (Löschen nur, wenn nie verwendet – sonst erklärt die Meldung warum nicht). */
export function RemoveButtons({ kind, id, archived }: { kind: "location" | "article" | "supplier"; id: string; archived?: boolean }) {
  const action: Act = kind === "location" ? locationRemoveAction : kind === "article" ? articleRemoveAction : supplierRemoveAction;
  return (
    <ActionForm action={action} keepOnSuccess className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {archived ? (
        <SubmitButton name="mode" value="restore" className="btn-secondary btn-sm"><RotateCcw className="size-3.5" />Wiederherstellen</SubmitButton>
      ) : (
        <SubmitButton name="mode" value="archive" className="btn-secondary btn-sm"><Archive className="size-3.5" />Archivieren</SubmitButton>
      )}
      <ConfirmDelete />
    </ActionForm>
  );
}

function ConfirmDelete() {
  return (
    <button type="submit" name="mode" value="delete" className="btn-secondary btn-sm text-danger" onClick={(e) => { if (!window.confirm("Endgültig löschen? Das geht nur, wenn es nie verwendet wurde.")) e.preventDefault(); }}>
      <Trash2 className="size-3.5" />Löschen
    </button>
  );
}

export interface LocOption { id: string; label: string }
export interface LocValues { id?: string; name?: string; code?: string | null; parentId?: string | null; kind?: string; cooled?: boolean; note?: string | null; sortOrder?: number }

export function LocationForm({ values = {}, options }: { values?: LocValues; options: LocOption[] }) {
  return (
    <ActionForm action={locationSaveAction} className="grid gap-3 sm:grid-cols-2" keepOnSuccess={Boolean(values.id)}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <label><span className="label">Name</span><input name="name" required maxLength={80} defaultValue={values.name} className="field" placeholder="z. B. Kühllager 2" /></label>
      <label><span className="label">Kurzcode (wie du ihn sagst)</span><input name="code" maxLength={20} defaultValue={values.code ?? ""} className="field" placeholder="z. B. L004" /></label>
      <label><span className="label">Liegt in</span>
        <select name="parentId" defaultValue={values.parentId ?? ""} className="field"><option value="">– oberste Ebene –</option>{options.filter((o) => o.id !== values.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      <label><span className="label">Art</span>
        <select name="kind" defaultValue={values.kind ?? "ROOM"} className="field"><option value="SITE">Gebäude / Gelände</option><option value="ROOM">Raum</option><option value="COLD">Kühlraum / Kühllager</option><option value="TRAILER">Kühlanhänger</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cooled" defaultChecked={values.cooled} className="size-5" />Gekühlt (Kühlware darf hier liegen)</label>
      <label><span className="label">Reihenfolge</span><input name="sortOrder" inputMode="numeric" defaultValue={values.sortOrder ?? 0} className="field" /></label>
      <label className="sm:col-span-2"><span className="label">Notiz</span><input name="note" maxLength={300} defaultValue={values.note ?? ""} className="field" placeholder="z. B. Schlüssel beim Hausmeister" /></label>
      <div className="sm:col-span-2"><SubmitButton>Speichern</SubmitButton></div>
    </ActionForm>
  );
}

export interface ArtValues { id?: string; name?: string; aliases?: string[]; category?: string; unit?: string; returnable?: boolean; depositCents?: number; needsCooling?: boolean; note?: string | null }

export function ArticleForm({ values = {}, categories }: { values?: ArtValues; categories: string[] }) {
  return (
    <ActionForm action={articleSaveAction} className="grid gap-3 sm:grid-cols-2" keepOnSuccess={Boolean(values.id)}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <label><span className="label">Name</span><input name="name" required maxLength={120} defaultValue={values.name} className="field" placeholder="z. B. Mineralwasser" /></label>
      <label><span className="label">Andere Schreibweisen (Komma)</span><input name="aliases" maxLength={400} defaultValue={values.aliases?.join(", ")} className="field" placeholder="Wasser, Fachingen" /></label>
      <label><span className="label">Kategorie</span><input name="category" list="cat-list" maxLength={60} defaultValue={values.category ?? "Getränke"} className="field" /></label>
      <label><span className="label">Einheit (Einzahl)</span><input name="unit" list="unit-list2" maxLength={40} defaultValue={values.unit ?? "Kiste"} className="field" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="returnable" defaultChecked={values.returnable} className="size-5" />Pfandartikel (voll/leer getrennt zählen)</label>
      <label><span className="label">Pfand je Einheit (€)</span><input name="deposit" inputMode="decimal" defaultValue={values.depositCents ? (values.depositCents / 100).toFixed(2).replace(".", ",") : "0"} className="field" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needsCooling" defaultChecked={values.needsCooling} className="size-5" />Braucht Kühlung</label>
      <label><span className="label">Notiz</span><input name="note" maxLength={300} defaultValue={values.note ?? ""} className="field" /></label>
      <div className="sm:col-span-2"><SubmitButton>Speichern</SubmitButton></div>
      <datalist id="cat-list">{[...new Set(["Getränke", "Lebensmittel", "Material", "Technik", "Dekoration", "Sonstiges", ...categories])].map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="unit-list2">{["Kiste", "Kasten", "Palette", "Karton", "Stück", "Flasche", "Fass", "Packung", "Liter", "Kilo"].map((u) => <option key={u} value={u} />)}</datalist>
    </ActionForm>
  );
}

export function SupplierForm({ values = {} }: { values?: { id?: string; name?: string; note?: string | null } }) {
  return (
    <ActionForm action={supplierSaveAction} className="grid gap-3 sm:grid-cols-2" keepOnSuccess={Boolean(values.id)}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <label><span className="label">Name</span><input name="name" required maxLength={120} defaultValue={values.name} className="field" placeholder="z. B. Staatlich Fachingen" /></label>
      <label><span className="label">Notiz</span><input name="note" maxLength={300} defaultValue={values.note ?? ""} className="field" placeholder="Ansprechperson, Telefon …" /></label>
      <div className="sm:col-span-2"><SubmitButton>Speichern</SubmitButton></div>
    </ActionForm>
  );
}
