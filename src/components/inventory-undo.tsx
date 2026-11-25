"use client";

import { Undo2 } from "lucide-react";
import { inventoryVoidAction } from "@/app/actions/inventory";
import { ActionForm, SubmitButton } from "./action-form";

/** Ganze Inventur zurücknehmen – mit Pflicht-Grund. Danach gilt wieder der Bestand vor der Zählung. */
export function InventoryUndo({ batchId, label = "Zählung zurücknehmen" }: { batchId: string; label?: string }) {
  return (
    <details>
      <summary className="btn-secondary btn-sm inline-flex"><Undo2 className="size-3.5" />{label}</summary>
      <ActionForm action={inventoryVoidAction} className="mt-2 flex flex-col gap-2 rounded-xl border bg-muted p-3 sm:flex-row sm:items-end" confirm="Alle Korrekturen dieser Inventur werden storniert. Fortfahren?">
        <input type="hidden" name="batchId" value={batchId} />
        <label className="flex-1"><span className="label">Grund</span><input name="reason" required minLength={3} maxLength={200} className="field" placeholder="z. B. falsch gezählt" /></label>
        <SubmitButton className="btn-danger btn-sm">Zurücknehmen</SubmitButton>
      </ActionForm>
    </details>
  );
}
