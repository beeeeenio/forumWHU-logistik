import "server-only";
import { prisma } from "@/db/prisma";
import type { Db } from "@/db/prisma";

/** Protokoll (nur anhängen). Enthält nie Geheimnisse; bei Anmeldefehlern nur den Grund und die E-Mail-Adresse. */
export async function audit(
  action: string,
  p: { userId?: string | null; entity?: string; entityId?: string; detail?: Record<string, unknown> } = {},
  db: Db = prisma,
): Promise<void> {
  await db.auditEvent
    .create({ data: { action, userId: p.userId ?? null, entity: p.entity ?? null, entityId: p.entityId ?? null, detail: (p.detail ?? undefined) as never } })
    .catch((e) => console.error("audit failed:", e instanceof Error ? e.name : "unknown"));
}
