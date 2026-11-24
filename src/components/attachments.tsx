/* eslint-disable @next/next/no-img-element -- geschützte API-Adresse, kein Bild-Optimierer nötig */
"use client";

import { Camera, FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface AttachmentInfo { id: string; mime: string; filename: string }

/** Belege einer Buchung: Fotos als Vorschau, PDFs als Link; Mitglieder können per Kamera/Datei hinzufügen und entfernen. */
export function Attachments({ movementId, items, canWrite }: { movementId: string; items: AttachmentInfo[]; canWrite: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/movements/${movementId}/attachments`, { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) { setError((await res?.json().catch(() => null))?.error ?? "Hochladen fehlgeschlagen."); return; }
    router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm("Anhang entfernen?")) return;
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.refresh(); else setError("Entfernen fehlgeschlagen.");
  }

  if (!items.length && !canWrite) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {items.map((a) => (
          <span key={a.id} className="relative">
            <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted" aria-label={`Beleg ${a.filename}`}>
              {a.mime.startsWith("image/") ? <img src={`/api/attachments/${a.id}`} alt="" className="size-full object-cover" /> : <FileText className="size-6 text-muted-foreground" />}
            </a>
            {canWrite && <button type="button" onClick={() => remove(a.id)} className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border bg-card text-danger" aria-label="Anhang entfernen"><X className="size-3.5" /></button>}
          </span>
        ))}
        {canWrite && (
          <>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-secondary btn-sm"><Camera className="size-4" />{busy ? "Lade …" : "Beleg / Foto"}</button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
