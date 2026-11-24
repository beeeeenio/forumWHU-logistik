"use client";

import { Undo2 } from "lucide-react";
import { voidAction } from "@/app/actions/book";
import { ActionForm, SubmitButton } from "./action-form";

/** Stornieren mit Pflicht-Begründung. Die Buchung bleibt im Journal (durchgestrichen) – nur ihre Wirkung auf den Bestand entfällt. */
export function VoidForm({ id }: { id: string }) {
  return (
    <details className="group">
      <summary className="btn-secondary btn-sm"><Undo2 className="size-3.5" />Stornieren</summary>
      <ActionForm action={voidAction} className="mt-2 flex flex-col gap-2 rounded-xl border bg-muted p-3 sm:flex-row sm:items-end">
        <input type="hidden" name="id" value={id} />
        <label className="flex-1"><span className="label">Grund</span><input name="reason" required minLength={3} maxLength={200} placeholder="z. B. falsche Menge" className="field" /></label>
        <SubmitButton className="btn-danger btn-sm">Stornieren</SubmitButton>
      </ActionForm>
    </details>
  );
}
