"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { KIND_LABEL, MOVEMENT_KINDS } from "@/lib/domain/rules";
import { parseQuickEntry, type ParsedDraft } from "@/lib/domain/quick-parse";
import { fmtQty } from "@/lib/format";
import { actionUser } from "@/lib/session";
import { fromBerlinInput } from "@/lib/time";
import { pathName } from "@/lib/domain/tree";
import { bookMovements, voidMovement, type BookInput } from "@/services/movements";
import { cancelPlan, completePlan, createPlan, deletePlan } from "@/services/plans";

const id = z.uuid();
const optId = z.preprocess((v) => (v === "" || v === undefined ? null : v), id.nullable());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().max(max).nullable().optional());

const draftSchema = z.object({
  kind: z.enum(MOVEMENT_KINDS as [string, ...string[]]),
  articleId: optId.optional(),
  newArticle: z.object({ name: z.string().max(120), unit: z.string().max(40), returnable: z.boolean() }).nullable().optional(),
  quantity: z.number().int(),
  fromLocationId: optId.optional(),
  toLocationId: optId.optional(),
  state: z.enum(["FULL", "EMPTY"]).default("FULL"),
  supplierName: optText(120),
  note: optText(500),
  occurredAt: optText(32),
  source: z.enum(["ui", "quick"]).default("ui"),
});
const bookSchema = z.object({ rows: z.array(draftSchema).min(1).max(100), force: z.boolean().default(false) });

/** Schnellerfassung: Text → Entwürfe (nur Vorschläge, es wird nichts gebucht). */
export async function quickParseAction(text: string): Promise<{ ok: true; drafts: ParsedDraft[] } | { ok: false; error: string }> {
  if (!(await actionUser("write"))) return { ok: false, error: NOT_ALLOWED.error! };
  const clipped = String(text ?? "").slice(0, 4000);
  if (!clipped.trim()) return { ok: false, error: "Bitte etwas eingeben oder diktieren." };
  const [articles, locations, suppliers] = await Promise.all([
    prisma.article.findMany({ where: { archivedAt: null } }),
    prisma.location.findMany({ where: { archivedAt: null } }),
    prisma.supplier.findMany({ where: { archivedAt: null } }),
  ]);
  const drafts = parseQuickEntry(clipped, {
    articles: articles.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases, unit: a.unit, returnable: a.returnable })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, code: l.code, parentId: l.parentId })),
    suppliers: suppliers.map((s) => s.name),
  });
  return { ok: true, drafts: drafts.slice(0, 50) };
}

/** Bucht alle Zeilen (alles oder nichts). `payload` = JSON { rows, force } aus der Buchungsmaske. */
export async function bookAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  let parsed;
  try {
    parsed = bookSchema.safeParse(JSON.parse(String(formData.get("payload") ?? "")));
  } catch {
    return fail("Die Eingabe konnte nicht gelesen werden.");
  }
  if (!parsed.success) return fail("Bitte alle Pflichtfelder ausfüllen (Art, Artikel, Menge).");
  const inputs: BookInput[] = [];
  for (const r of parsed.data.rows) {
    let occurredAt: Date | null = null;
    if (r.occurredAt) {
      occurredAt = fromBerlinInput(r.occurredAt);
      if (!occurredAt) return fail("Der Zeitpunkt ist ungültig.");
      if (occurredAt.getTime() > Date.now() + 5 * 60_000) return fail("Der Zeitpunkt liegt in der Zukunft – dafür gibt es den Plan.");
    }
    inputs.push({
      kind: r.kind as BookInput["kind"],
      articleId: r.articleId ?? null,
      newArticle: r.newArticle ?? null,
      quantity: r.quantity,
      fromLocationId: r.fromLocationId ?? null,
      toLocationId: r.toLocationId ?? null,
      state: r.state,
      supplierName: r.supplierName ?? null,
      note: r.note ?? null,
      occurredAt,
      source: r.source,
      force: parsed.data.force,
    });
  }
  const res = await bookMovements(user, inputs);
  if (!res.ok) return { ok: false, error: (inputs.length > 1 && res.index !== undefined ? `Zeile ${res.index + 1}: ` : "") + res.error, code: res.code, index: res.index };

  revalidatePath("/", "layout");
  const [articles, locations] = await Promise.all([prisma.article.findMany(), prisma.location.findMany()]);
  const lines = inputs.map((i) => {
    const a = articles.find((x) => x.id === i.articleId) ?? articles.find((x) => x.name.toLowerCase() === i.newArticle?.name.trim().toLowerCase());
    const where = (lid?: string | null) => (lid ? pathName(locations, lid) : "");
    const route = i.kind === "RECEIPT" ? `→ ${where(i.toLocationId)}` : i.kind === "TRANSFER" ? `${where(i.fromLocationId)} → ${where(i.toLocationId)}` : `in ${where(i.fromLocationId)}`;
    const q = i.kind === "ADJUST" ? `gezählt ${i.quantity}` : fmtQty(i.quantity, a?.unit ?? "Stück");
    return `${KIND_LABEL[i.kind]}${i.state === "EMPTY" ? " (leer)" : ""}: ${q} ${a?.name ?? ""} ${route}`.replace(/\s+/g, " ");
  });
  return { ok: true, message: inputs.length === 1 ? "Gebucht." : `${inputs.length} Buchungen gebucht.`, lines, warnings: res.warnings, nonce: Date.now() };
}

export async function voidAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const mid = id.safeParse(formData.get("id"));
  if (!mid.success) return fail("Buchung nicht gefunden.");
  const r = await voidMovement(user, mid.data, String(formData.get("reason") ?? ""));
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Storniert.", warnings: r.warnings };
}

// ── Pläne ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const planSchema = z.object({
  articleId: id,
  quantity: z.coerce.number().int().min(1).max(100000),
  state: z.enum(["FULL", "EMPTY"]).default("FULL"),
  fromLocationId: optId,
  toLocationId: id,
  dueAt: z.string(),
  phase: optText(80),
  note: optText(300),
});

export async function planCreateAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const p = planSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail("Bitte Artikel, Menge, Zielort und Termin angeben.");
  const dueAt = fromBerlinInput(p.data.dueAt);
  if (!dueAt) return fail("Der Termin ist ungültig.");
  const r = await createPlan(user, { ...p.data, fromLocationId: p.data.fromLocationId ?? null, dueAt, phase: p.data.phase ?? null, note: p.data.note ?? null });
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Plan angelegt.", nonce: Date.now() };
}

export async function planDoneAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const pid = id.safeParse(formData.get("id"));
  if (!pid.success) return fail("Plan nicht gefunden.");
  const r = await completePlan(user, pid.data, formData.get("force") === "1");
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, message: "Erledigt und gebucht.", warnings: r.warnings };
}

export async function planCancelAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const pid = id.safeParse(formData.get("id"));
  if (!pid.success) return fail("Plan nicht gefunden.");
  const r = formData.get("mode") === "delete" ? await deletePlan(user, pid.data) : await cancelPlan(user, pid.data);
  if (!r.ok) return fail(r.error ?? "Nicht möglich.");
  revalidatePath("/", "layout");
  return { ok: true, message: "Erledigt." };
}

