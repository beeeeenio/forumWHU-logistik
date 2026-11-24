"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { actionUser } from "@/lib/session";
import { submitCount } from "@/services/inventory";

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
    nonce: Date.now(),
  };
}
