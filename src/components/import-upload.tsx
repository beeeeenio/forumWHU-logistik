"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IMPORT_KINDS, IMPORT_KIND_LIST, type ImportKind } from "@/lib/import/fields";
import { cn } from "@/lib/utils";

/** Schritt 1: Art wählen und Datei hochladen (.xlsx oder .csv). Danach folgt die Spaltenzuordnung. */
export function ImportUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("stock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("kind", kind);
    const res = await fetch("/api/import/upload", { method: "POST", body: fd }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res || !res.ok || !data?.id) { setError(data?.error ?? "Hochladen fehlgeschlagen."); return; }
    router.push(`/import/${data.id}`);
  }

  return (
    <div className="space-y-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="label mb-2">Was möchtest du importieren?</legend>
        {IMPORT_KIND_LIST.map((k) => (
          <label key={k} className={cn("card flex cursor-pointer flex-col gap-1 p-4", kind === k && "border-primary ring-2 ring-primary/40")}>
            <span className="flex items-center gap-2 font-medium text-heading"><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="size-4" />{IMPORT_KINDS[k].label}</span>
            <span className="text-sm text-muted-foreground">{IMPORT_KINDS[k].help}</span>
            <a href={`/api/import/template?kind=${k}`} className="mt-1 text-sm underline" onClick={(e) => e.stopPropagation()}>Vorlage (CSV) herunterladen</a>
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-primary min-h-12 w-full text-base">
        {busy ? <><FileSpreadsheet className="size-5" />Lese Datei …</> : <><Upload className="size-5" />Excel- oder CSV-Datei wählen</>}
      </button>
      <input ref={input} type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <p className="text-xs text-muted-foreground">Erlaubt: .xlsx und .csv, bis 10 MB und 5.000 Zeilen je Tabellenblatt. Alte .xls-Dateien in Excel als .xlsx speichern. Beim Hochladen wird noch nichts angelegt.</p>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
