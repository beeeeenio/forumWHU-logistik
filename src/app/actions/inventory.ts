"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { actionUser } from "@/lib/session";
import { submitCount, voidInventory } from "@/services/inventory";

const schema = z.object({
  locationId: z.uuid(),
  note: z.string().max(200).default(""),
  rows: z.array(z.object({ articleId: z.uuid(), state: z.enum(["FULL", "EMPTY"]), counted: z.number().int() })).min(1).max(300),
});

/** Bucht die Abweichungen einer Zählung. `payload` = JSON { locationId, note, rows } */
export async function inventoryAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  let p;
  try { p = schema.safeParse(JSON.parse(String(fd.get("payload") ?? ""))); } catch { return fail("Die Eingabe konnte nicht gelesen werden."); }
  if (!p.success) return fail("Bitte mindestens eine Menge eintragen (ganze Zahlen).");
  const r = await submitCount(user, p.data.locationId, p.data.rows, p.data.note);
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: r.changed === 0 ? `Alles stimmt – ${r.same} Zeilen ohne Abweichung, nichts gebucht.` : `Inventur gebucht: ${r.changed} Korrekturen, ${r.same} Zeilen stimmten.`,
    lines: r.lines,
    batchId: r.batchId ?? undefined,
    nonce: Date.now(),
  };
}

/** Ganze Inventur zurücknehmen (alle Korrekturen dieser Zählung werden storniert). */
export async function inventoryVoidAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const id = z.uuid().safeParse(fd.get("batchId"));
  if (!id.success) return fail("Inventur nicht gefunden.");
  const r = await voidInventory(user, id.data, String(fd.get("reason") ?? ""));
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return { ok: true, message: `Inventur zurückgenommen (${r.voided} Korrekturen storniert). Der Bestand ist wieder wie vor der Zählung.`, warnings: r.warnings, nonce: Date.now() };
}
