import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import type { StockState } from "@/lib/domain/rules";
import { validQuantity } from "@/lib/domain/rules";
import { audit } from "./audit";
import { bookMovements, type BookResult } from "./movements";

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
  const plan = await prisma.plan.create({
    data: { ...p, phase: p.phase?.trim() || null, note: p.note?.trim() || null, createdById: user.id },
  });
  await audit("plan.create", { userId: user.id, entity: "plan", entityId: plan.id }, prisma);
  return { ok: true, id: plan.id };
}

/** Erledigt einen Plan, indem die geplante Umlagerung (bzw. der Eingang) gebucht wird. */
export async function completePlan(user: User, planId: string, force: boolean): Promise<BookResult> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, code: "INVALID", error: "Plan nicht gefunden." };
  if (plan.status !== "OPEN") return { ok: false, code: "INVALID", error: "Dieser Plan ist schon erledigt oder abgesagt." };
  const booked = await bookMovements(user, [{
    kind: plan.fromLocationId ? "TRANSFER" : "RECEIPT",
    articleId: plan.articleId,
    quantity: plan.quantity,
    fromLocationId: plan.fromLocationId,
    toLocationId: plan.toLocationId,
    state: plan.state,
    note: plan.phase ? `Plan: ${plan.phase}` : "Plan erledigt",
    source: "plan",
    force,
  }]);
  if (!booked.ok) return booked;
  // Verknüpfen; wenn zwischenzeitlich jemand anderes denselben Plan erledigt hat, wird die doppelte Buchung storniert.
  const { count } = await prisma.plan.updateMany({ where: { id: plan.id, status: "OPEN" }, data: { status: "DONE", doneMovementId: booked.ids[0] } });
  if (count !== 1) {
    await prisma.movement.update({ where: { id: booked.ids[0] }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: "Plan war bereits erledigt (doppelt)" } });
    return { ok: false, code: "INVALID", error: "Jemand anderes hat diesen Plan gerade erledigt – deine doppelte Buchung wurde wieder storniert." };
  }
  await audit("plan.done", { userId: user.id, entity: "plan", entityId: plan.id }, prisma);
  return booked;
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
