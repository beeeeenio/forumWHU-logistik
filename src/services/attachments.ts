import "server-only";
import { prisma } from "@/db/prisma";
import type { User } from "@/generated/prisma/client";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_MOVEMENT, safeFilename, sniffMime } from "@/lib/domain/file-sniff";
import { audit } from "./audit";

export type AttachResult = { ok: true; id: string } | { ok: false; error: string };

export async function addAttachment(user: User, movementId: string, file: { name: string; bytes: Uint8Array }): Promise<AttachResult> {
  if (file.bytes.length === 0) return { ok: false, error: "Die Datei ist leer." };
  if (file.bytes.length > ATTACHMENT_MAX_BYTES) return { ok: false, error: `Die Datei ist zu groß (höchstens ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB).` };
  const mime = sniffMime(file.bytes);
  if (!mime) return { ok: false, error: "Nur Fotos (JPEG, PNG, WebP) und PDF sind erlaubt." };
  const m = await prisma.movement.findUnique({ where: { id: movementId }, select: { id: true, voidedAt: true, _count: { select: { attachments: true } } } });
  if (!m) return { ok: false, error: "Buchung nicht gefunden." };
  if (m._count.attachments >= ATTACHMENT_MAX_PER_MOVEMENT) return { ok: false, error: `Höchstens ${ATTACHMENT_MAX_PER_MOVEMENT} Anhänge je Buchung.` };
  const a = await prisma.movementAttachment.create({
    data: { movementId, mime, filename: safeFilename(file.name, mime), size: file.bytes.length, data: Buffer.from(file.bytes), createdById: user.id },
    select: { id: true },
  });
  await audit("attachment.add", { userId: user.id, entity: "movement", entityId: movementId, detail: { mime, size: file.bytes.length } });
  return { ok: true, id: a.id };
}

export async function removeAttachment(user: User, id: string): Promise<{ ok: boolean; error?: string }> {
  const { count } = await prisma.movementAttachment.deleteMany({ where: { id } });
  if (!count) return { ok: false, error: "Anhang nicht gefunden." };
  await audit("attachment.remove", { userId: user.id, entity: "attachment", entityId: id });
  return { ok: true };
}
