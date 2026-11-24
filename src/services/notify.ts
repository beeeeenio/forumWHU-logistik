import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/db/prisma";
import { alertFingerprint, buildAlertMessage } from "@/lib/domain/alert-message";
import { env } from "@/lib/env";
import { audit } from "./audit";
import { getLage } from "./reports";

const REPEAT_AFTER_MS = 20 * 3600 * 1000;

export type NotifyResult = { sent: boolean; reason: "no_webhook" | "no_alerts" | "unchanged" | "sent" | "failed"; count: number };

/**
 * Meldet Warnungen (Minusbestand, Kühlung, überfällig, Mindestbestand) an den Webhook.
 * Unveränderte Lage wird erst nach 20 Stunden erneut gemeldet; ändert sie sich, sofort. Gedacht für Cron alle 15–30 Minuten.
 */
export async function notifyAlerts(now = new Date()): Promise<NotifyResult> {
  const hook = env().NOTIFY_WEBHOOK_URL;
  if (!hook) return { sent: false, reason: "no_webhook", count: 0 };
  const { alerts } = await getLage(now);
  const text = buildAlertMessage(alerts, env().APP_URL);
  if (!text) return { sent: false, reason: "no_alerts", count: 0 };
  const count = alerts.filter((a) => a.level !== "info").length;
  const fp = createHash("sha256").update(alertFingerprint(alerts)).digest("hex");
  const last = await prisma.auditEvent.findFirst({ where: { action: "alerts.sent" }, orderBy: { createdAt: "desc" } });
  const lastFp = (last?.detail as { fingerprint?: string } | null)?.fingerprint;
  if (last && lastFp === fp && now.getTime() - last.createdAt.getTime() < REPEAT_AFTER_MS) return { sent: false, reason: "unchanged", count };
  const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) { await audit("alerts.failed", { detail: { status: res?.status ?? 0 } }); return { sent: false, reason: "failed", count }; }
  await audit("alerts.sent", { detail: { fingerprint: fp, count } });
  return { sent: true, reason: "sent", count };
}
