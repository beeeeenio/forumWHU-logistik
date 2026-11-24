// Dateityp an den Bytes erkennen (nie am Namen oder am vom Browser gemeldeten Typ). Erlaubt: JPEG, PNG, WebP, PDF. Rein (getestet).
export const ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_MOVEMENT = 6;
export type AttachmentMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export function sniffMime(b: Uint8Array): AttachmentMime | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length < 12) return null;
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

export const EXT: Record<AttachmentMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Dateiname für Anzeige/Download: nur harmlose Zeichen, Endung passend zum erkannten Typ. */
export function safeFilename(name: string, mime: AttachmentMime): string {
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^\w\- äöüÄÖÜß]/g, "").trim().slice(0, 60) || "beleg";
  return `${base}.${EXT[mime]}`;
}
