"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { previewImport, runImport, type ImportOutcome } from "@/services/import";

const cfgSchema = z.object({
  sheet: z.number().int().min(0).max(50),
  headerRow: z.number().int().min(0).max(6000),
  columns: z.array(z.string().max(40).nullable()).max(200),
  updateExisting: z.boolean(),
  stockMode: z.enum(["set", "add"]),
});
const NOPE: ImportOutcome = { ok: false, error: "Dafür fehlt dir die Berechtigung (Betrachter können nur ansehen) – oder du bist nicht mehr angemeldet." };

async function guarded(draftId: string, cfg: unknown, run: boolean): Promise<ImportOutcome> {
  const user = await actionUser("write");
  if (!user) return NOPE;
  const id = z.uuid().safeParse(draftId);
  const c = cfgSchema.safeParse(cfg);
  if (!id.success || !c.success) return { ok: false, error: "Die Einstellungen sind ungültig. Bitte die Seite neu laden." };
  const rl = rateLimit(`import:${run ? "run" : "preview"}:${user.id}`, run ? 10 : 40, 60_000);
  if (!rl.ok) return { ok: false, error: `Zu viele Anfragen – bitte ${rl.retryAfterSec} Sekunden warten.` };
  const res = run ? await runImport(user, id.data, c.data) : await previewImport(user, id.data, c.data);
  if (run && res.ok) revalidatePath("/", "layout");
  return res;
}

/** Vorschau (Trockenlauf): berechnet, was passieren würde – schreibt nichts. */
export async function importPreviewAction(draftId: string, cfg: unknown): Promise<ImportOutcome> { return guarded(draftId, cfg, false); }
/** Import ausführen (eine Transaktion: ganz oder gar nicht). */
export async function importRunAction(draftId: string, cfg: unknown): Promise<ImportOutcome> { return guarded(draftId, cfg, true); }
