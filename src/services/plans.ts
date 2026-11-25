import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import type { StockState } from "@/lib/domain/rules";
import { validQuantity } from "@/lib/domain/rules";
import { audit } from "./audit";
import { BookingRollback, bookInTx, isRetryable, type BookResult } from "./movements";

export interface PlanInput {
  articleId: string;
  quantity: number;
  state: StockState;
  fromLocationId: string | null;
  toLocationId: string;
  dueAt: Date;
  phase: string | null;
  note: string | null;
}

export type PlanResult = { ok: true; id: string } | { ok: false; error: string };

export async function createPlan(user: User, p: PlanInput): Promise<PlanResult> {
  if (!validQuantity(p.quantity)) return { ok: false, error: "Die Menge muss eine ganze Zahl ≥ 1 sein." };
  if (p.fromLocationId && p.fromLocationId === p.toLocationId) return { ok: false, error: "Quelle und Ziel sind derselbe Ort." };
  const [article, to, from] = await Promise.all([
    prisma.article.findUnique({ where: { id: p.articleId } }),
    prisma.location.findUnique({ where: { id: p.toLocationId } }),
    p.fromLocationId ? prisma.location.findUnique({ where: { id: p.fromLocationId } }) : Promise.resolve(null),
  ]);
  if (!article || article.archivedAt) return { ok: false, error: "Artikel nicht gefunden." };
  if (!to || to.archivedAt) return { ok: false, error: "Zielort nicht gefunden." };
  if (p.fromLocationId && (!from || from.archivedAt)) return { ok: false, error: "Quellort nicht gefunden." };
  if (p.state === "EMPTY" && !article.returnable) return { ok: false, error: "Dieser Artikel hat kein Leergut." };
  if (p.state === "EMPTY" && !p.fromLocationId) return { ok: false, error: "Leergut kann nur aus einem Ort heraus geplant werden – bitte den Quellort wählen." };
  const plan = await prisma.plan.create({
    data: { ...p, phase: p.phase?.trim() || null, note: p.note?.trim() || null, createdById: user.id },
  });
  await audit("plan.create", { userId: user.id, entity: "plan", entityId: plan.id }, prisma);
  return { ok: true, id: plan.id };
}

/**
 * Erledigt einen Plan, indem die geplante Umlagerung (bzw. der Eingang) gebucht wird – in EINER Transaktion: Plan sperren, prüfen,
 * buchen, verknüpfen. Zwei gleichzeitige „Erledigt“ buchen nie doppelt, und ein Abbruch dazwischen hinterlässt keine halbe Buchung.
 */
export async function completePlan(user: User, planId: string, force: boolean): Promise<BookResult> {
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const done = await prisma.$transaction(async (tx): Promise<BookResult> => {
          const locked = await tx.$queryRaw<{ status: string }[]>`select status::text as status from plans where id = ${planId}::uuid for update`;
          if (!locked.length) return { ok: false, code: "INVALID", error: "Plan nicht gefunden." };
          if (locked[0].status !== "OPEN") return { ok: false, code: "INVALID", error: "Dieser Plan ist schon erledigt oder abgesagt (jemand anderes war schneller)." };
          const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
          const r = await bookInTx(tx, user, [{
            kind: plan.fromLocationId ? "TRANSFER" : "RECEIPT",
            articleId: plan.articleId,
            quantity: plan.quantity,
            fromLocationId: plan.fromLocationId,
            toLocationId: plan.toLocationId,
            state: plan.state,
            note: plan.phase ? `Plan: ${plan.phase}` : "Plan erledigt",
            source: "plan",
            force,
          }], null);
          await tx.plan.update({ where: { id: plan.id }, data: { status: "DONE", doneMovementId: r.ids[0] } });
          await audit("plan.done", { userId: user.id, entity: "plan", entityId: plan.id }, tx);
          return { ok: true, ids: r.ids, warnings: r.warnings };
        }, { timeout: 20_000 });
        return done;
      } catch (e) {
        if (attempt < 2 && isRetryable(e)) { await new Promise((r) => setTimeout(r, 50 + Math.random() * 100)); continue; }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof BookingRollback) return e.result;
    throw e;
  }
}

export async function cancelPlan(user: User, planId: string): Promise<{ ok: boolean; error?: string }> {
  const { count } = await prisma.plan.updateMany({ where: { id: planId, status: "OPEN" }, data: { status: "CANCELLED" } });
  if (count !== 1) return { ok: false, error: "Nur offene Pläne können abgesagt werden." };
  await audit("plan.cancel", { userId: user.id, entity: "plan", entityId: planId });
  return { ok: true };
}

export async function deletePlan(user: User, planId: string): Promise<{ ok: boolean; error?: string }> {
  const { count } = await prisma.plan.deleteMany({ where: { id: planId, status: { in: ["OPEN", "CANCELLED"] } } });
  if (count !== 1) return { ok: false, error: "Erledigte Pläne bleiben zur Nachvollziehbarkeit erhalten." };
  await audit("plan.delete", { userId: user.id, entity: "plan", entityId: planId });
  return { ok: true };
}
