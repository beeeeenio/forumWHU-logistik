"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { actionUser } from "@/lib/session";
import { removeArticle, removeLocation, removeSupplier, restoreArticle, restoreLocation, saveArticle, saveLocation, saveSupplier } from "@/services/catalog";

const id = z.uuid();
const optId = z.preprocess((v) => (v === "" || v === undefined || v === null ? null : v), id.nullable());
const str = (max: number) => z.string().trim().max(max);
const optStr = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1" || fd.get(k) === "true";
const done = (message: string): ActionResult => { revalidatePath("/", "layout"); return { ok: true, message, nonce: Date.now() }; };

export async function locationSaveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const p = z.object({ id: optId, name: str(80).min(1), code: optStr(20), parentId: optId, kind: z.enum(["SITE", "ROOM", "COLD", "TRAILER"]), note: optStr(300), sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Bitte einen Namen eingeben.");
  const r = await saveLocation(user, p.data.id, { ...p.data, code: p.data.code ?? null, note: p.data.note ?? null, cooled: bool(fd, "cooled") });
  return r.ok ? done("Gespeichert.") : fail(r.error);
}

export async function locationRemoveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const lid = id.safeParse(fd.get("id"));
  if (!lid.success) return fail("Ort nicht gefunden.");
  const mode = fd.get("mode");
  if (mode === "restore") { await restoreLocation(user, lid.data); return done("Wiederhergestellt."); }
  const r = await removeLocation(user, lid.data, mode === "delete" ? "delete" : "archive");
  return r.ok ? done(mode === "delete" ? "Gelöscht." : "Archiviert.") : fail(r.error);
}

export async function articleSaveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const p = z.object({ id: optId, name: str(120).min(2), aliases: optStr(400), category: str(60), unit: str(40), deposit: z.string().default("0"), minStock: z.string().default(""), note: optStr(300) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Bitte einen Namen eingeben (mindestens 2 Zeichen).");
  const euros = Number(p.data.deposit.replace(",", "."));
  if (!Number.isFinite(euros)) return fail("Pfand: bitte eine Zahl eingeben (z. B. 4,50).");
  const r = await saveArticle(user, p.data.id, {
    name: p.data.name,
    aliases: (p.data.aliases ?? "").split(/[,;\n]/),
    category: p.data.category,
    unit: p.data.unit,
    returnable: bool(fd, "returnable"),
    depositCents: Math.round(euros * 100),
    needsCooling: bool(fd, "needsCooling"),
    minStock: p.data.minStock.trim() === "" ? null : Number(p.data.minStock),
    note: p.data.note ?? null,
  });
  return r.ok ? done("Gespeichert.") : fail(r.error);
}

export async function articleRemoveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const aid = id.safeParse(fd.get("id"));
  if (!aid.success) return fail("Artikel nicht gefunden.");
  const mode = fd.get("mode");
  if (mode === "restore") { const r = await restoreArticle(user, aid.data); return r.ok ? done("Wiederhergestellt.") : fail(r.error); }
  const r = await removeArticle(user, aid.data, mode === "delete" ? "delete" : "archive");
  return r.ok ? done(mode === "delete" ? "Gelöscht." : "Archiviert.") : fail(r.error);
}

export async function supplierSaveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const p = z.object({ id: optId, name: str(120).min(2), note: optStr(300) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Bitte einen Namen eingeben.");
  const r = await saveSupplier(user, p.data.id, { name: p.data.name, note: p.data.note ?? null });
  return r.ok ? done("Gespeichert.") : fail(r.error);
}

export async function supplierRemoveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const sid = id.safeParse(fd.get("id"));
  if (!sid.success) return fail("Lieferant nicht gefunden.");
  const r = await removeSupplier(user, sid.data, fd.get("mode") === "delete" ? "delete" : "archive");
  return r.ok ? done(fd.get("mode") === "delete" ? "Gelöscht." : "Archiviert.") : fail(r.error);
}
